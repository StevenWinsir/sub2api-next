import { describe, expect, it } from 'vitest'
import type { ApiKey } from '@/types'
import {
  buildSubmitPlan,
  buildUpdatePayload,
  customKeyErrorKey,
  EMPTY_KEY_FORM,
  formatResetCountdown,
  keyToForm,
  shouldSubmitEditStatus
} from '../keyForm'

const key = (over: Partial<ApiKey> = {}): ApiKey =>
  ({
    id: 1,
    name: 'k',
    group_id: 2,
    status: 'active',
    ip_whitelist: [],
    ip_blacklist: [],
    quota: 0,
    rate_limit_5h: 0,
    rate_limit_1d: 0,
    rate_limit_7d: 0,
    expires_at: null,
    ...over
  }) as ApiKey

describe('custom key validation', () => {
  it('requires 16+ chars of [A-Za-z0-9_-]', () => {
    const f = { use_custom_key: true, custom_key: 'short' }
    expect(customKeyErrorKey(f)).toBe('keys.customKeyTooShort')
    expect(customKeyErrorKey({ ...f, custom_key: 'abcdefghijklmnop!' })).toBe('keys.customKeyInvalidChars')
    expect(customKeyErrorKey({ ...f, custom_key: 'abcdefghijklmnop' })).toBe('')
    expect(customKeyErrorKey({ use_custom_key: false, custom_key: 'x' })).toBe('')
  })
})

describe('edit status rule', () => {
  it('only submits status for exhausted/expired keys when re-enabling', () => {
    expect(shouldSubmitEditStatus(key({ status: 'expired' }), 'inactive')).toBe(false)
    expect(shouldSubmitEditStatus(key({ status: 'quota_exhausted' }), 'active')).toBe(true)
    expect(shouldSubmitEditStatus(key({ status: 'active' }), 'inactive')).toBe(true)
  })

  it('maps exhausted keys to inactive in the form', () => {
    expect(keyToForm(key({ status: 'quota_exhausted' })).status).toBe('inactive')
  })
})

describe('submit plan', () => {
  it('create: converts date to days (min 1) and zeroes disabled sections', () => {
    const now = new Date('2026-01-01T00:00:00')
    const plan = buildSubmitPlan(
      { ...EMPTY_KEY_FORM, enable_expiration: true, expiration_date: '2026-01-11T00:00:00' },
      false,
      now
    )
    expect(plan.expiresInDays).toBe(10)
    expect(plan.expiresAt).toBeUndefined()
    expect(plan.ipWhitelist).toEqual([])
    expect(plan.rateLimit).toEqual({ rate_limit_5h: 0, rate_limit_1d: 0, rate_limit_7d: 0 })
    const past = buildSubmitPlan(
      { ...EMPTY_KEY_FORM, enable_expiration: true, expiration_date: '2025-01-01T00:00' },
      false,
      now
    )
    expect(past.expiresInDays).toBe(1)
  })

  it('edit: clears expiry with an empty string and parses IP lists', () => {
    const plan = buildSubmitPlan(
      { ...EMPTY_KEY_FORM, enable_ip_restriction: true, ip_whitelist: ' 1.1.1.1 \n\n2.2.2.2/24', quota: 5 },
      true
    )
    expect(plan.expiresAt).toBe('')
    expect(plan.ipWhitelist).toEqual(['1.1.1.1', '2.2.2.2/24'])
    expect(plan.quota).toBe(5)
    const payload = buildUpdatePayload({ ...EMPTY_KEY_FORM, name: 'n', group_id: 3 }, plan, key())
    expect(payload).toMatchObject({ name: 'n', group_id: 3, expires_at: '', status: 'active' })
  })
})

describe('reset countdown', () => {
  it('formats d/h/m and now', () => {
    const now = Date.parse('2026-01-01T00:00:00Z')
    expect(formatResetCountdown(null, now, 'now')).toBe('')
    expect(formatResetCountdown('2025-12-31T00:00:00Z', now, 'now')).toBe('now')
    expect(formatResetCountdown('2026-01-02T03:00:00Z', now, 'now')).toBe('1d 3h')
    expect(formatResetCountdown('2026-01-01T02:05:00Z', now, 'now')).toBe('2h 5m')
    expect(formatResetCountdown('2026-01-01T00:07:00Z', now, 'now')).toBe('7m')
  })
})
