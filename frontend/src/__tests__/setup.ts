/** Vitest 全局环境（对应 Vue 版 src/__tests__/setup.ts）。 */
import '@testing-library/jest-dom/vitest'
import { vi } from 'vitest'

function createMemoryStorage(): Storage {
  const values = new Map<string, string>()
  return {
    get length() {
      return values.size
    },
    clear() {
      values.clear()
    },
    getItem(key: string) {
      return values.has(key) ? values.get(key)! : null
    },
    key(index: number) {
      return Array.from(values.keys())[index] ?? null
    },
    removeItem(key: string) {
      values.delete(key)
    },
    setItem(key: string, value: string) {
      values.set(key, String(value))
    }
  }
}

if (typeof globalThis.localStorage === 'undefined' || typeof globalThis.localStorage.getItem !== 'function') {
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: createMemoryStorage() })
}
if (typeof window !== 'undefined' && typeof window.localStorage.getItem !== 'function') {
  Object.defineProperty(window, 'localStorage', { configurable: true, value: globalThis.localStorage })
}

if (typeof globalThis.requestIdleCallback === 'undefined') {
  globalThis.requestIdleCallback = ((callback: IdleRequestCallback) =>
    window.setTimeout(
      () => callback({ didTimeout: false, timeRemaining: () => 50 }),
      1
    )) as unknown as typeof requestIdleCallback
}
if (typeof globalThis.cancelIdleCallback === 'undefined') {
  globalThis.cancelIdleCallback = ((id: number) =>
    window.clearTimeout(id)) as unknown as typeof cancelIdleCallback
}

if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  window.matchMedia = ((query: string) => ({
    matches: true,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn()
  })) as unknown as typeof window.matchMedia
}

class MockObserver {
  observe = vi.fn()
  disconnect = vi.fn()
  unobserve = vi.fn()
}
globalThis.IntersectionObserver = MockObserver as unknown as typeof IntersectionObserver
globalThis.ResizeObserver = MockObserver as unknown as typeof ResizeObserver

vi.setConfig({ testTimeout: 10000 })
