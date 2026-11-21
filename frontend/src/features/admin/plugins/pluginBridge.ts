/**
 * 插件 iframe 桥接协议（与 Vue 版 PluginsView 逐条一致）。
 *
 * 安全约束：
 *  - iframe `sandbox="allow-scripts"`（不含 allow-same-origin），来源 origin 恒为 "null"；
 *  - 只接受 event.source 为当前 iframe 窗口、origin 为 "null"、source 字段与 bridge_token 都匹配的消息；
 *  - 需要响应的请求必须带唯一 request_id，30 秒内有效；iframe 重新加载会作废所有待响应请求，
 *    避免迟到的配置响应被发给新文档；
 *  - ui.notify 文案截断到 500 字符；ui.resize 高度限制在 520–960。
 */
export interface PluginBridgeMessage {
  source?: string
  bridge_token?: string
  type?: string
  request_id?: string
  config?: unknown
  height?: unknown
  level?: unknown
  message?: unknown
}

export const BRIDGE_REQUEST_TTL_MS = 30_000
export const BRIDGE_UI_SOURCE = 'sub2api-plugin-ui'
export const BRIDGE_HOST_SOURCE = 'sub2api-plugin-host'
export const MIN_FRAME_HEIGHT = 520
export const MAX_FRAME_HEIGHT = 960

export interface PluginBridgeDeps {
  pluginId: number
  bridgeToken: string
  /** 当前 iframe 的 contentWindow（每次读取最新值）。 */
  getFrameWindow: () => Window | null
  api: {
    getConfig: (id: number) => Promise<Record<string, unknown>>
    saveConfig: (id: number, cfg: Record<string, unknown>) => Promise<Record<string, unknown>>
    test: (id: number) => Promise<{ success: boolean; message: string }>
    status: (id: number) => Promise<unknown>
  }
  /** Step-up 包装（敏感操作）。 */
  stepUp: <T>(fn: () => Promise<T>) => Promise<T>
  isStepUpBlocked: (e: unknown) => boolean
  isStepUpCancelled: (e: unknown) => boolean
  reportSensitiveError: (e: unknown) => void
  errorMessage: (e: unknown) => string
  notify: (level: 'error' | 'success' | 'info', text: string) => void
  texts: { bridgeRejected: string; cancel: string; saved: string; failed: string }
  onReady: () => void
  onResize: (height: number) => void
  setTimeoutFn?: typeof setTimeout
  clearTimeoutFn?: typeof clearTimeout
}

const EXPECTS_RESPONSE = new Set(['config.load', 'config.save', 'config.test', 'plugin.status'])

export class PluginBridge {
  private pending = new Map<string, ReturnType<typeof setTimeout>>()
  private frameLoaded = false
  private readonly setT: typeof setTimeout
  private readonly clearT: typeof clearTimeout

  constructor(private readonly d: PluginBridgeDeps) {
    this.setT = d.setTimeoutFn ?? setTimeout
    this.clearT = d.clearTimeoutFn ?? clearTimeout
  }

  clearPending(): void {
    for (const timer of this.pending.values()) this.clearT(timer)
    this.pending.clear()
  }

  /** iframe load 事件：二次 load（插件自行导航）时作废所有待响应请求。 */
  onFrameLoad(): void {
    if (this.frameLoaded) this.clearPending()
    this.frameLoaded = true
  }

  dispose(): void {
    this.clearPending()
    this.frameLoaded = false
  }

  private register(id: string): void {
    this.pending.set(
      id,
      this.setT(() => {
        this.pending.delete(id)
      }, BRIDGE_REQUEST_TTL_MS)
    )
  }

  private post(request: PluginBridgeMessage, payload: Record<string, unknown>): void {
    const win = this.d.getFrameWindow()
    if (!win) return
    const id = typeof request.request_id === 'string' ? request.request_id.trim() : ''
    const timer = this.pending.get(id)
    if (!id || timer === undefined) return
    this.clearT(timer)
    this.pending.delete(id)
    // 沙箱 iframe 的 origin 是不透明的，没有可用的固定 targetOrigin；
    // 靠“待响应请求登记 + load 作废”避免跨导航泄露。
    win.postMessage(
      {
        source: BRIDGE_HOST_SOURCE,
        bridge_token: this.d.bridgeToken,
        type: `${request.type}.result`,
        request_id: id,
        ...payload
      },
      '*'
    )
  }

  async handle(event: Pick<MessageEvent, 'source' | 'origin' | 'data'>): Promise<void> {
    const win = this.d.getFrameWindow()
    if (!win || event.source !== win || event.origin !== 'null') return
    const msg = event.data as PluginBridgeMessage | null
    if (!msg || msg.source !== BRIDGE_UI_SOURCE || msg.bridge_token !== this.d.bridgeToken) return

    const id = typeof msg.request_id === 'string' ? msg.request_id.trim() : ''
    if (msg.type && EXPECTS_RESPONSE.has(msg.type)) {
      if (!id || this.pending.has(id)) return
      this.register(id)
    }

    const { api, pluginId } = this.d
    try {
      switch (msg.type) {
        case 'sub2api.plugin.ready':
          this.d.onReady()
          break
        case 'config.load': {
          const config = await api.getConfig(pluginId)
          this.post(msg, { ok: true, config })
          break
        }
        case 'config.save': {
          if (!msg.config || typeof msg.config !== 'object' || Array.isArray(msg.config)) {
            throw new Error(this.d.texts.bridgeRejected)
          }
          const config = await this.d.stepUp(() =>
            api.saveConfig(pluginId, msg.config as Record<string, unknown>)
          )
          this.post(msg, { ok: true, config })
          this.d.notify('success', this.d.texts.saved)
          break
        }
        case 'config.test': {
          const result = await this.d.stepUp(() => api.test(pluginId))
          this.post(msg, { ok: result.success, result })
          // 成功结果交还给插件 UI 自行展示；仅失败时由宿主弹 Toast，避免静默丢错、也避免状态轮询刷屏
          if (!result.success) this.d.notify('error', result.message || this.d.texts.failed)
          break
        }
        case 'plugin.status': {
          // 只读运行态：不走 Step-up，不弹 Toast
          const result = await api.status(pluginId)
          this.post(msg, { ok: true, result })
          break
        }
        case 'ui.resize': {
          const height = Number(msg.height)
          if (Number.isFinite(height)) {
            this.d.onResize(Math.min(MAX_FRAME_HEIGHT, Math.max(MIN_FRAME_HEIGHT, Math.round(height))))
          }
          break
        }
        case 'ui.notify': {
          const text = typeof msg.message === 'string' ? msg.message.slice(0, 500) : ''
          if (!text) break
          this.d.notify(msg.level === 'error' ? 'error' : msg.level === 'success' ? 'success' : 'info', text)
          break
        }
      }
    } catch (error) {
      if (this.d.isStepUpBlocked(error)) this.d.reportSensitiveError(error)
      this.post(msg, {
        ok: false,
        error: this.d.isStepUpCancelled(error) ? this.d.texts.cancel : this.d.errorMessage(error)
      })
    }
  }
}
