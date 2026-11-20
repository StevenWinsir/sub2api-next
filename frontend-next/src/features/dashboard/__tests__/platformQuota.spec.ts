import { describe, expect, it } from 'vitest'
import { buildPlatformCards, calcPercent, hasAnyLimit, quotaTone } from '../platformQuota'
import type { PlatformQuotaItem } from '@/types'

const quota = (over: Partial<PlatformQuotaItem>): PlatformQuotaItem =>
  ({ platform: 'openai', ...over }) as PlatformQuotaItem

describe('platform cards', () => {
  it('orders known platforms first and appends an "other" diff card', () => {
    const cards = buildPlatformCards(
      {
        total_actual_cost: 10,
        today_actual_cost: 2,
        by_platform: [
          {
            platform: 'zzz',
            total_requests: 1,
            total_tokens: 1,
            total_actual_cost: 1,
            today_requests: 0,
            today_tokens: 0,
            today_actual_cost: 0
          },
          {
            platform: 'openai',
            total_requests: 1,
            total_tokens: 1,
            total_actual_cost: 5,
            today_requests: 0,
            today_tokens: 0,
            today_actual_cost: 1
          }
        ]
      },
      null
    )
    expect(cards.map((c) => c.platform)).toEqual(['openai', 'zzz', '__other__'])
    expect(cards[2].total_actual_cost).toBeCloseTo(4)
    expect(cards[2].isOther).toBe(true)
  })

  it('creates cards for platforms that only have a quota limit', () => {
    const cards = buildPlatformCards({ total_actual_cost: 0, today_actual_cost: 0, by_platform: [] }, [
      quota({ platform: 'gemini', daily_limit_usd: 5 }),
      quota({ platform: 'grok' })
    ])
    expect(cards.map((c) => c.platform)).toEqual(['gemini'])
  })

  it('computes quota helpers', () => {
    expect(hasAnyLimit(undefined)).toBe(false)
    expect(calcPercent(50, 0)).toBe(0)
    expect(calcPercent(150, 100)).toBe(100)
    expect(quotaTone(96)).toBe('destructive')
    expect(quotaTone(80)).toBe('warning')
    expect(quotaTone(10)).toBe('success')
  })
})
