import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import vm from 'node:vm'
import { describe, expect, it, vi } from 'vitest'
import { shouldRegisterServiceWorker, SW_DISABLED_KEY } from '../serviceWorker'

/** 在隔离上下文里执行 public/sw.js，返回已注册的事件监听器与伪造的缓存 / 网络。 */
function loadWorker(version = 'v1', existingCaches: string[] = []) {
  const src = readFileSync(join(process.cwd(), 'public/sw.js'), 'utf8').replace('__BUILD_ID__', version)
  const listeners: Record<string, (e: unknown) => void> = {}
  const stores = new Map<string, Map<string, Response>>()
  for (const name of existingCaches) stores.set(name, new Map())
  const keyOf = (r: Request | string) => (typeof r === 'string' ? r : r.url)
  const cachesApi = {
    open: async (name: string) => {
      if (!stores.has(name)) stores.set(name, new Map())
      const m = stores.get(name)!
      return {
        match: async (r: Request) => m.get(keyOf(r)),
        put: async (r: Request, resp: Response) => void m.set(keyOf(r), resp)
      }
    },
    keys: async () => [...stores.keys()],
    delete: async (n: string) => stores.delete(n)
  }
  const network = vi.fn(
    async (_r: Request) =>
      ({
        status: 200,
        type: 'basic',
        clone() {
          return this
        }
      }) as unknown as Response
  )
  const unregister = vi.fn(async () => true)
  const claim = vi.fn(async () => undefined)
  const skipWaiting = vi.fn()
  const self = {
    location: { origin: 'https://app.test' },
    addEventListener: (type: string, cb: (e: unknown) => void) => void (listeners[type] = cb),
    skipWaiting,
    clients: { claim },
    registration: { unregister }
  }
  vm.runInNewContext(src, { self, caches: cachesApi, fetch: network, URL, Promise, console })
  const fetchEvent = (url: string, init: { method?: string; range?: boolean; origin?: string } = {}) => {
    const request = {
      url: (init.origin ?? 'https://app.test') + url,
      method: init.method ?? 'GET',
      headers: { get: (h: string) => (h === 'range' && init.range ? 'bytes=0-1' : null) }
    } as unknown as Request
    let responded: Promise<Response> | null = null
    listeners.fetch({ request, respondWith: (p: Promise<Response>) => void (responded = p) })
    return responded as Promise<Response> | null
  }
  const lifecycle = async (type: 'activate' | 'install' | 'message', data?: unknown) => {
    const waits: Promise<unknown>[] = []
    listeners[type]({ data, waitUntil: (p: Promise<unknown>) => void waits.push(p) })
    await Promise.all(waits)
  }
  return { stores, network, unregister, claim, skipWaiting, fetchEvent, lifecycle }
}

describe('public/sw.js', () => {
  it('serves /_next/static/ from the cache after the first network hit (cache-first)', async () => {
    const w = loadWorker()
    const first = w.fetchEvent('/_next/static/chunks/a.js')
    expect(first).not.toBeNull()
    await first
    expect(w.network).toHaveBeenCalledTimes(1)
    await w.fetchEvent('/_next/static/chunks/a.js')
    expect(w.network).toHaveBeenCalledTimes(1) // 命中缓存，不再请求网络
  })

  it('never intercepts HTML navigations, API, gateway, payment callbacks or other origins', () => {
    const w = loadWorker()
    for (const url of [
      '/',
      '/admin/settings',
      '/index.html',
      '/api/v1/auth/me',
      '/v1/messages',
      '/setup/status',
      '/health',
      '/payment/result',
      '/logo.svg',
      '/sw.js'
    ]) {
      expect(w.fetchEvent(url), url).toBeNull()
    }
    expect(w.fetchEvent('/_next/static/a.js', { origin: 'https://cdn.evil.test' })).toBeNull()
    expect(w.fetchEvent('/_next/static/a.js', { method: 'POST' })).toBeNull()
    expect(w.fetchEvent('/_next/static/media/v.mp4', { range: true })).toBeNull()
    expect(w.network).not.toHaveBeenCalled()
  })

  it('does not cache error or opaque responses', async () => {
    const w = loadWorker()
    w.network.mockResolvedValueOnce({
      status: 404,
      type: 'basic',
      clone() {
        return this
      }
    } as unknown as Response)
    await w.fetchEvent('/_next/static/missing.js')
    w.network.mockResolvedValueOnce({
      status: 200,
      type: 'opaque',
      clone() {
        return this
      }
    } as unknown as Response)
    await w.fetchEvent('/_next/static/other.js')
    await w.fetchEvent('/_next/static/missing.js')
    expect(w.network).toHaveBeenCalledTimes(3) // 都没有进缓存
  })

  it('on activate removes caches from older builds only, and claims clients', async () => {
    const w = loadWorker('v2', ['sub2api-static-v1', 'sub2api-static-v2', 'other-app-cache'])
    await w.lifecycle('activate')
    expect([...w.stores.keys()].sort()).toEqual(['other-app-cache', 'sub2api-static-v2'])
    expect(w.claim).toHaveBeenCalled()
  })

  it('skips waiting on install so a new build takes over immediately', async () => {
    const w = loadWorker()
    await w.lifecycle('install')
    expect(w.skipWaiting).toHaveBeenCalled()
  })

  it('kill switch message clears every app cache and unregisters', async () => {
    const w = loadWorker('v1', ['sub2api-static-v0', 'sub2api-static-v1', 'foreign'])
    await w.lifecycle('message', { type: 'KILL' })
    expect([...w.stores.keys()]).toEqual(['foreign'])
    expect(w.unregister).toHaveBeenCalled()
  })

  it('after KILL it stops intercepting, so in-flight requests cannot repopulate the cache', async () => {
    const w = loadWorker()
    await w.lifecycle('message', { type: 'KILL' })
    expect(w.fetchEvent('/_next/static/a.js')).toBeNull()
    expect([...w.stores.keys()]).toEqual([])
  })

  it('ignores malformed messages', async () => {
    const w = loadWorker()
    await w.lifecycle('message', 'KILL')
    await w.lifecycle('message', null)
    expect(w.unregister).not.toHaveBeenCalled()
  })
})

describe('shouldRegisterServiceWorker', () => {
  const store = () => {
    const m = new Map<string, string>()
    return {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
      removeItem: (k: string) => void m.delete(k)
    }
  }
  const env = (over: Partial<Parameters<typeof shouldRegisterServiceWorker>[0]> = {}) => ({
    location: { search: '', hostname: 'app.test', protocol: 'https:' },
    storage: store(),
    buildDisabled: false,
    production: true,
    ...over
  })
  it('registers in a secure production context', () => {
    expect(shouldRegisterServiceWorker(env())).toEqual({ register: true, reason: 'ok' })
  })
  it('does not register in development or insecure contexts (localhost is secure)', () => {
    expect(shouldRegisterServiceWorker(env({ production: false })).register).toBe(false)
    expect(
      shouldRegisterServiceWorker(env({ location: { search: '', hostname: 'app.test', protocol: 'http:' } }))
        .register
    ).toBe(false)
    expect(
      shouldRegisterServiceWorker(env({ location: { search: '', hostname: 'localhost', protocol: 'http:' } }))
        .register
    ).toBe(true)
  })
  it('?sw=off persists the kill switch; ?sw=on clears it', () => {
    const storage = store()
    expect(
      shouldRegisterServiceWorker(
        env({ storage, location: { search: '?sw=off', hostname: 'app.test', protocol: 'https:' } })
      ).reason
    ).toBe('query-off')
    expect(storage.getItem(SW_DISABLED_KEY)).toBe('1')
    expect(shouldRegisterServiceWorker(env({ storage })).reason).toBe('storage-disabled')
    expect(
      shouldRegisterServiceWorker(
        env({ storage, location: { search: '?sw=on', hostname: 'app.test', protocol: 'https:' } })
      ).register
    ).toBe(true)
    expect(storage.getItem(SW_DISABLED_KEY)).toBeNull()
  })
  it('the build-time flag wins over everything', () => {
    expect(shouldRegisterServiceWorker(env({ buildDisabled: true })).reason).toBe('build-disabled')
  })
  it('survives unavailable storage', () => {
    const broken = {
      getItem: () => {
        throw new Error('denied')
      },
      setItem: () => {
        throw new Error('denied')
      },
      removeItem: () => {
        throw new Error('denied')
      }
    }
    expect(shouldRegisterServiceWorker(env({ storage: broken })).register).toBe(true)
  })
})
