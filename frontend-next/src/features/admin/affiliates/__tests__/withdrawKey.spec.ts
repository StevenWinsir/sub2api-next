import { beforeEach, describe, expect, it } from 'vitest'
import { clearWithdrawIdempotencyKey, withdrawIdempotencyKey } from '../AffiliateRecordsPage'

describe('withdraw idempotency key', () => {
  beforeEach(() => window.sessionStorage.clear())
  it('is stable for the same user + amount so a retry replays instead of double-deducting', () => {
    const a = withdrawIdempotencyKey(7, 12.5)
    expect(withdrawIdempotencyKey(7, 12.5)).toBe(a)
    expect(withdrawIdempotencyKey(7, 13)).not.toBe(a)
    expect(withdrawIdempotencyKey(8, 12.5)).not.toBe(a)
  })
  it('is regenerated after being cleared', () => {
    const a = withdrawIdempotencyKey(7, 1)
    clearWithdrawIdempotencyKey(7, 1)
    expect(withdrawIdempotencyKey(7, 1)).not.toBe(a)
  })
})
