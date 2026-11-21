import { describe, expect, it, vi } from 'vitest'
import { BRIDGE_HOST_SOURCE, BRIDGE_UI_SOURCE, PluginBridge, type PluginBridgeDeps } from '../pluginBridge'

function setup(over: Partial<PluginBridgeDeps> = {}) {
  const frame = { postMessage: vi.fn() } as unknown as Window
  const mocks = {
    api: {
      getConfig: vi.fn().mockResolvedValue({ a: 1 }),
      saveConfig: vi.fn().mockResolvedValue({ a: 2 }),
      test: vi.fn().mockResolvedValue({ success: true, message: 'ok' }),
      status: vi.fn().mockResolvedValue({ healthy: true })
    },
    reportSensitiveError: vi.fn(),
    notify: vi.fn(),
    onReady: vi.fn(),
    onResize: vi.fn()
  }
  const deps: PluginBridgeDeps = {
    pluginId: 7,
    bridgeToken: 'tok',
    getFrameWindow: () => frame,
    api: mocks.api,
    stepUp: <T>(fn: () => Promise<T>) => fn(),
    isStepUpBlocked: () => false,
    isStepUpCancelled: () => false,
    reportSensitiveError: mocks.reportSensitiveError,
    errorMessage: (e: unknown) => String((e as Error).message),
    notify: mocks.notify,
    texts: { bridgeRejected: 'rejected', cancel: 'cancel', saved: 'saved', failed: 'failed' },
    onReady: mocks.onReady,
    onResize: mocks.onResize,
    ...over
  }
  const bridge = new PluginBridge(deps)
  const send = (data: Record<string, unknown>, opts: { source?: unknown; origin?: string } = {}) =>
    bridge.handle({
      source: (opts.source ?? frame) as MessageEventSource,
      origin: opts.origin ?? 'null',
      data: { source: BRIDGE_UI_SOURCE, bridge_token: 'tok', ...data }
    })
  return { frame, deps: mocks, bridge, send }
}

describe('PluginBridge', () => {
  it('replies to config.load with the host source, token and request id', async () => {
    const { frame, send } = setup()
    await send({ type: 'config.load', request_id: 'r1' })
    expect(frame.postMessage).toHaveBeenCalledWith(
      {
        source: BRIDGE_HOST_SOURCE,
        bridge_token: 'tok',
        type: 'config.load.result',
        request_id: 'r1',
        ok: true,
        config: { a: 1 }
      },
      '*'
    )
  })

  it('ignores messages from another window, a non-null origin, a wrong source or a wrong token', async () => {
    const { deps, send, bridge, frame } = setup()
    await send({ type: 'config.load', request_id: 'r1' }, { source: {} })
    await send({ type: 'config.load', request_id: 'r2' }, { origin: 'https://evil.example' })
    await bridge.handle({
      source: frame,
      origin: 'null',
      data: { source: 'x', bridge_token: 'tok', type: 'config.load', request_id: 'r3' }
    })
    await send({ type: 'config.load', request_id: 'r4', bridge_token: 'other' })
    expect(deps.api.getConfig).not.toHaveBeenCalled()
  })

  it('rejects requests without a request id and duplicate in-flight ids', async () => {
    const { deps, send } = setup()
    await send({ type: 'config.load' })
    expect(deps.api.getConfig).not.toHaveBeenCalled()
    let release: (v: Record<string, unknown>) => void = () => {}
    deps.api.getConfig.mockReturnValue(new Promise((r) => (release = r)))
    const p = send({ type: 'config.load', request_id: 'dup' })
    await send({ type: 'config.load', request_id: 'dup' })
    expect(deps.api.getConfig).toHaveBeenCalledTimes(1)
    release({})
    await p
  })

  it('drops a late response after the iframe reloads (navigation invalidation)', async () => {
    const { deps, frame, send, bridge } = setup()
    let release: (v: Record<string, unknown>) => void = () => {}
    deps.api.getConfig.mockReturnValue(new Promise((r) => (release = r)))
    bridge.onFrameLoad()
    const p = send({ type: 'config.load', request_id: 'r1' })
    bridge.onFrameLoad() // 插件自行导航
    release({ secret: true })
    await p
    expect(frame.postMessage).not.toHaveBeenCalled()
  })

  it('expires pending requests after 30s', async () => {
    vi.useFakeTimers()
    try {
      const { deps, frame, send } = setup()
      let release: (v: Record<string, unknown>) => void = () => {}
      deps.api.getConfig.mockReturnValue(new Promise((r) => (release = r)))
      const p = send({ type: 'config.load', request_id: 'r1' })
      vi.advanceTimersByTime(30_001)
      release({})
      await p
      expect(frame.postMessage).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('config.save requires a plain object and goes through step-up', async () => {
    const { deps, frame, send } = setup()
    await send({ type: 'config.save', request_id: 's1', config: [1] })
    expect(deps.api.saveConfig).not.toHaveBeenCalled()
    expect(frame.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ ok: false, error: 'rejected' }),
      '*'
    )
    await send({ type: 'config.save', request_id: 's2', config: { k: 'v' } })
    expect(deps.api.saveConfig).toHaveBeenCalledWith(7, { k: 'v' })
    expect(deps.notify).toHaveBeenCalledWith('success', 'saved')
  })

  it('config.test only raises a host toast on failure', async () => {
    const { deps, send } = setup()
    await send({ type: 'config.test', request_id: 't1' })
    expect(deps.notify).not.toHaveBeenCalled()
    deps.api.test.mockResolvedValue({ success: false, message: 'boom' })
    await send({ type: 'config.test', request_id: 't2' })
    expect(deps.notify).toHaveBeenCalledWith('error', 'boom')
  })

  it('step-up cancel is reported to the plugin as the cancel text; blocked also notifies host', async () => {
    const { deps, frame, send } = setup({ isStepUpCancelled: () => true })
    deps.api.test.mockRejectedValue(new Error('x'))
    await send({ type: 'config.test', request_id: 'c1' })
    expect(frame.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ ok: false, error: 'cancel' }),
      '*'
    )
    const b = setup({ isStepUpBlocked: () => true })
    b.deps.api.test.mockRejectedValue(new Error('blocked'))
    await b.send({ type: 'config.test', request_id: 'c2' })
    expect(b.deps.reportSensitiveError).toHaveBeenCalled()
  })

  it('plugin.status is read-only (no step-up, no toast)', async () => {
    const stepUp = vi.fn()
    const { deps, frame, send } = setup({ stepUp: stepUp as never })
    await send({ type: 'plugin.status', request_id: 'p1' })
    expect(stepUp).not.toHaveBeenCalled()
    expect(deps.notify).not.toHaveBeenCalled()
    expect(frame.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'plugin.status.result', ok: true }),
      '*'
    )
  })

  it('clamps ui.resize and truncates ui.notify', async () => {
    const { deps, send } = setup()
    await send({ type: 'ui.resize', height: 100 })
    await send({ type: 'ui.resize', height: 5000 })
    await send({ type: 'ui.resize', height: 'abc' })
    expect(deps.onResize.mock.calls).toEqual([[520], [960]])
    await send({ type: 'ui.notify', level: 'error', message: 'x'.repeat(900) })
    expect(deps.notify).toHaveBeenCalledWith('error', 'x'.repeat(500))
    await send({ type: 'ui.notify', level: 'weird', message: 'hi' })
    expect(deps.notify).toHaveBeenLastCalledWith('info', 'hi')
    await send({ type: 'ui.notify', message: 42 })
    expect(deps.notify).toHaveBeenCalledTimes(2)
  })

  it('signals ready', async () => {
    const { deps, send } = setup()
    await send({ type: 'sub2api.plugin.ready' })
    expect(deps.onReady).toHaveBeenCalled()
  })
})
