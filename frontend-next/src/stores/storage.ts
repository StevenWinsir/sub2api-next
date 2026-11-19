/** 安全的 localStorage 访问封装（SSR / 隐私模式 / 配额异常均不抛出）。 */
export function readStorage(key: string): string | null {
  try {
    if (typeof window === 'undefined') return null
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

export function writeStorage(key: string, value: string): void {
  try {
    if (typeof window !== 'undefined') window.localStorage.setItem(key, value)
  } catch {
    /* ignore */
  }
}

export function removeStorage(key: string): void {
  try {
    if (typeof window !== 'undefined') window.localStorage.removeItem(key)
  } catch {
    /* ignore */
  }
}

export function readCachedBool(key: string, defaultValue: boolean): boolean {
  const raw = readStorage(key)
  if (raw === 'true') return true
  if (raw === 'false') return false
  return defaultValue
}

export function writeCachedBool(key: string, value: boolean): void {
  writeStorage(key, value ? 'true' : 'false')
}

export function readCachedString(key: string, defaultValue: string): string {
  const raw = readStorage(key)
  return typeof raw === 'string' && raw.length > 0 ? raw : defaultValue
}
