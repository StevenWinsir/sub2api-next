import { describe, expect, it } from 'vitest'
import { promoDisplayStatus } from '../PromoCodesPage'

describe('promoDisplayStatus', () => {
  const now = Date.parse('2030-06-01T00:00:00Z')
  const base = { status: 'active' as const, expires_at: null, max_uses: 0, used_count: 0 }
  it('derives expired / max-used before the stored status', () => {
    expect(promoDisplayStatus(base, now)).toBe('active')
    expect(promoDisplayStatus({ ...base, status: 'disabled' }, now)).toBe('disabled')
    expect(promoDisplayStatus({ ...base, expires_at: '2030-01-01T00:00:00Z' }, now)).toBe('expired')
    expect(promoDisplayStatus({ ...base, max_uses: 3, used_count: 3 }, now)).toBe('maxUsed')
    expect(promoDisplayStatus({ ...base, max_uses: 3, used_count: 2 }, now)).toBe('active')
  })
})
