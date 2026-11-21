/**
 * 静态资源缓存 Service Worker 的注册 / 注销（只缓存 /_next/static/，见 public/sw.js）。
 *
 * 紧急注销开关（任一满足即注销并清空缓存，不再注册）：
 *  1. URL 带 ?sw=off（同时写入 localStorage.sw_disabled=1，之后一直生效）；
 *  2. localStorage.sw_disabled === '1'（?sw=on 可清除）；
 *  3. 构建期 NEXT_PUBLIC_DISABLE_SW=1 —— 重新发布后，已装 SW 的客户端下次访问即被注销。
 */
export const SW_URL = '/sw.js'
export const SW_DISABLED_KEY = 'sw_disabled'
const CACHE_PREFIX = 'sub2api-static-'

export interface SwEnv {
  location: Pick<Location, 'search' | 'hostname' | 'protocol'>
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null
  buildDisabled: boolean
  production: boolean
}

export function shouldRegisterServiceWorker(env: SwEnv): { register: boolean; reason: string } {
  const params = new URLSearchParams(env.location.search)
  const q = params.get('sw')
  try {
    if (q === 'off') env.storage?.setItem(SW_DISABLED_KEY, '1')
    if (q === 'on') env.storage?.removeItem(SW_DISABLED_KEY)
  } catch {
    /* 存储不可用 */
  }
  if (env.buildDisabled) return { register: false, reason: 'build-disabled' }
  if (q === 'off') return { register: false, reason: 'query-off' }
  let flag: string | null = null
  try {
    flag = env.storage?.getItem(SW_DISABLED_KEY) ?? null
  } catch {
    /* ignore */
  }
  if (flag === '1' && q !== 'on') return { register: false, reason: 'storage-disabled' }
  if (!env.production) return { register: false, reason: 'not-production' }
  const secure =
    env.location.protocol === 'https:' ||
    env.location.hostname === 'localhost' ||
    env.location.hostname === '127.0.0.1'
  if (!secure) return { register: false, reason: 'insecure-context' }
  return { register: true, reason: 'ok' }
}

/** 注销全部 SW 并删除本应用创建的缓存。 */
export async function unregisterAll(): Promise<void> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
  let regs: readonly ServiceWorkerRegistration[] = []
  try {
    regs = await navigator.serviceWorker.getRegistrations()
    // 先让 worker 自己停止拦截并清缓存，避免注销前仍在飞的请求把缓存写回来
    for (const r of regs) (r.active ?? r.waiting ?? r.installing)?.postMessage({ type: 'KILL' })
    navigator.serviceWorker.controller?.postMessage({ type: 'KILL' })
    await Promise.all(regs.map((r) => r.unregister()))
  } catch {
    /* ignore */
  }
  try {
    if (typeof caches !== 'undefined') {
      const keys = await caches.keys()
      await Promise.all(keys.filter((k) => k.startsWith(CACHE_PREFIX)).map((k) => caches.delete(k)))
    }
  } catch {
    /* ignore */
  }
}

/** 在 window load 之后调用：不抢首屏带宽。 */
export function initServiceWorker(): void {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return
  let storage: Storage | null = null
  try {
    storage = window.localStorage
  } catch {
    storage = null
  }
  const decision = shouldRegisterServiceWorker({
    location: window.location,
    storage,
    buildDisabled: process.env.NEXT_PUBLIC_DISABLE_SW === '1',
    production: process.env.NODE_ENV === 'production'
  })
  const run = () => {
    if (!decision.register) {
      // 开关生效：注销已安装的 worker 并清缓存
      if (decision.reason !== 'not-production' && decision.reason !== 'insecure-context') void unregisterAll()
      return
    }
    navigator.serviceWorker.register(SW_URL, { scope: '/', updateViaCache: 'none' }).catch(() => undefined)
  }
  if (document.readyState === 'complete') run()
  else window.addEventListener('load', run, { once: true })
}
