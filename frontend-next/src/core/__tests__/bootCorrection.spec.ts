import { describe, expect, it } from 'vitest'
import {
  BOOT_LOOP_MAX_ATTEMPTS,
  BOOT_LOOP_WINDOW_MS,
  clearCorrectionRecord,
  decideBoot,
  isBootLoop,
  recordCorrection
} from '../bootCorrection'

const loc = (pathname: string, search = '', hash = '') => ({ pathname, search, hash })

describe('decideBoot (deep-link correction, §5.3.3)', () => {
  it('maps / to /home and keeps search + hash', () => {
    expect(decideBoot(loc('/'))).toEqual({ type: 'replace', to: '/home' })
    expect(decideBoot(loc('/', '?aff=abc', '#x'))).toEqual({ type: 'replace', to: '/home?aff=abc#x' })
  })
  it('replaces to the full original URL for registered routes (OAuth fragments survive)', () => {
    expect(decideBoot(loc('/admin/users', '?page=2', '#x'))).toEqual({
      type: 'replace',
      to: '/admin/users?page=2#x'
    })
    expect(decideBoot(loc('/auth/callback', '?code=1&state=2', '#access_token=t&refresh_token=r'))).toEqual({
      type: 'replace',
      to: '/auth/callback?code=1&state=2#access_token=t&refresh_token=r'
    })
    expect(decideBoot(loc('/legal/privacy'))).toEqual({ type: 'replace', to: '/legal/privacy' })
  })
  it('renders 404 in place for unknown paths (no navigation → no refresh loop)', () => {
    expect(decideBoot(loc('/nope/nothing'))).toEqual({ type: 'not-found' })
  })
})

function memoryStorage() {
  const map = new Map<string, string>()
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k)
  }
}

describe('recordCorrection (loop guard)', () => {
  it('allows a few corrections then trips', () => {
    const storage = memoryStorage()
    const results = Array.from({ length: BOOT_LOOP_MAX_ATTEMPTS + 1 }, (_, i) =>
      recordCorrection(storage, 1000 + i)
    )
    expect(results.slice(0, BOOT_LOOP_MAX_ATTEMPTS)).toEqual(Array(BOOT_LOOP_MAX_ATTEMPTS).fill(false))
    expect(results[BOOT_LOOP_MAX_ATTEMPTS]).toBe(true)
  })
  it('resets once the window has passed', () => {
    const storage = memoryStorage()
    for (let i = 0; i < BOOT_LOOP_MAX_ATTEMPTS + 1; i++) recordCorrection(storage, 1000)
    expect(recordCorrection(storage, 1000 + BOOT_LOOP_WINDOW_MS + 1)).toBe(false)
  })
  it('isBootLoop is a side-effect-free read of the same state', () => {
    const storage = memoryStorage()
    expect(isBootLoop(storage, 1000)).toBe(false)
    for (let i = 0; i < BOOT_LOOP_MAX_ATTEMPTS; i++) recordCorrection(storage, 1000)
    expect(isBootLoop(storage, 1001)).toBe(true)
    expect(isBootLoop(storage, 1000 + BOOT_LOOP_WINDOW_MS + 1)).toBe(false)
  })
  it('a successful landing clears the record, so quick repeated direct loads never trip the guard', () => {
    const storage = memoryStorage()
    for (let i = 0; i < 20; i++) {
      expect(recordCorrection(storage, 1000 + i)).toBe(false)
      clearCorrectionRecord(storage)
    }
  })
  it('tolerates a corrupted record', () => {
    const storage = memoryStorage()
    storage.setItem('sub2api:boot-correction', '{bad')
    expect(recordCorrection(storage, 5)).toBe(false)
  })
})
