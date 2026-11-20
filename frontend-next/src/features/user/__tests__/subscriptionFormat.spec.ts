import { describe, expect, it } from 'vitest'
import { expirationTone, formatDurationParts, progressPercent, progressTone } from '../subscriptionFormat'
import { formatRebateRate } from '../AffiliatePage'

describe('subscription progress', () => {
  it('computes percent and tone thresholds', () => {
    expect(progressPercent(5, 0)).toBe(0)
    expect(progressPercent(150, 100)).toBe(100)
    expect(progressTone(95, 100)).toBe('destructive')
    expect(progressTone(75, 100)).toBe('warning')
    expect(progressTone(10, 100)).toBe('success')
    expect(progressTone(10, null)).toBe('muted')
  })
  it('formats durations', () => {
    expect(formatDurationParts({ days: 2, hours: 3, minutes: 4 })).toBe('2d 3h')
    expect(formatDurationParts({ days: 0, hours: 3, minutes: 4 })).toBe('3h 4m')
    expect(formatDurationParts({ days: 0, hours: 0, minutes: 4 })).toBe('4m')
  })
  it('flags soon-to-expire subscriptions', () => {
    const now = new Date('2026-01-10T00:00:00Z')
    expect(expirationTone('2026-01-09T00:00:00Z', now)).toBe('destructive')
    expect(expirationTone('2026-01-12T00:00:00Z', now)).toBe('destructive')
    expect(expirationTone('2026-01-16T00:00:00Z', now)).toBe('warning')
    expect(expirationTone('2026-03-01T00:00:00Z', now)).toBe('normal')
  })
})

describe('affiliate rebate rate', () => {
  it('trims trailing zeros', () => {
    expect(formatRebateRate(20)).toBe('20')
    expect(formatRebateRate(12.5)).toBe('12.5')
    expect(formatRebateRate(12.345)).toBe('12.35')
    expect(formatRebateRate(undefined)).toBe('0')
  })
})
