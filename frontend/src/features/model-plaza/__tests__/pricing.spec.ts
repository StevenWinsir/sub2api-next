import { describe, expect, it } from 'vitest'
import type { ModelPlazaGroup, PlazaModel } from '@/api/modelPlaza'
import {
  buildRows,
  effectiveRateOf,
  filterGroups,
  formatTimeWindow,
  groupEnabled,
  paidPerMillion,
  paidRequestPrice,
  periodRate,
  platformEnabled,
  rateEnabled,
  requestRate,
  sortModels,
  tierLabel,
  usesIndependentMediaRate
} from '../pricing'

const model = (over: Partial<PlazaModel> & { name: string }): PlazaModel => ({
  platform: 'anthropic',
  pricing: { billing_mode: 'token', input_price: 0.000003, output_price: 0.000015 } as PlazaModel['pricing'],
  official_pricing: {
    input_price: 0.000003,
    output_price: 0.000015,
    cache_write_price: null,
    cache_read_price: null
  },
  ...over
})

const group = (over: Partial<ModelPlazaGroup> & { id: number }): ModelPlazaGroup =>
  ({
    name: `g${over.id}`,
    description: '',
    platform: 'anthropic',
    subscription_type: 'standard',
    rate_multiplier: 1,
    peak_rate_enabled: false,
    peak_start: '',
    peak_end: '',
    peak_rate_multiplier: 1,
    is_exclusive: false,
    image_rate_independent: false,
    image_rate_multiplier: 1,
    video_rate_independent: false,
    video_rate_multiplier: 1,
    long_context_pricing_enabled: true,
    models: [],
    ...over
  }) as ModelPlazaGroup

describe('rates', () => {
  it('effective rate prefers the user-specific multiplier', () => {
    expect(effectiveRateOf({ rate_multiplier: 1.5 })).toBe(1.5)
    expect(effectiveRateOf({ rate_multiplier: 1.5, user_rate_multiplier: 0.8 })).toBe(0.8)
    expect(effectiveRateOf({ rate_multiplier: 1.5, user_rate_multiplier: 0 })).toBe(0)
  })

  it('paid price = unit price × rate, shown per million tokens with at least 2 decimals', () => {
    expect(paidPerMillion({ rateMultiplier: 0.5 }, 0.000003)).toBe('$1.50')
    expect(paidPerMillion({ rateMultiplier: 1, userRateMultiplier: 2 }, 0.000015)).toBe('$30.00')
    expect(paidPerMillion({ rateMultiplier: 1 }, null)).toBe('-')
  })

  it('time-pricing rows multiply the effective rate by the period multiplier without float noise', () => {
    const ctx = { rateMultiplier: 0.3, userRateMultiplier: null }
    const period = { start_time: '00:30:00', end_time: '08:30:00', multiplier: 0.7 }
    expect(periodRate(ctx, period)).toBe(0.21)
    expect(paidPerMillion(ctx, 0.00001, period)).toBe('$2.10')
    expect(formatTimeWindow(period)).toBe('00:30–08:30')
    expect(formatTimeWindow({ ...period, end_time: '08:30:15' })).toBe('00:30–08:30:15')
  })

  it('image / video can use independent rates that override the group rate', () => {
    const img = model({
      name: 'img',
      pricing: { billing_mode: 'image', per_request_price: 0.04 } as PlazaModel['pricing']
    })
    const vid = model({
      name: 'vid',
      pricing: { billing_mode: 'video', per_request_price: 1 } as PlazaModel['pricing']
    })
    const ctx = {
      rateMultiplier: 2,
      imageRateIndependent: true,
      imageRateMultiplier: 0.5,
      videoRateIndependent: true,
      videoRateMultiplier: -3
    }
    expect(usesIndependentMediaRate(ctx, img)).toBe(true)
    expect(requestRate(ctx, img)).toBe(0.5)
    expect(requestRate(ctx, vid)).toBe(0) // 视频独立倍率不允许为负
    expect(paidRequestPrice(ctx, img, 0.04)).toBe('$0.02')
    expect(requestRate({ rateMultiplier: 2 }, img)).toBe(2)
    expect(usesIndependentMediaRate({ rateMultiplier: 2 }, img)).toBe(false)
  })
})

describe('sorting and rows', () => {
  it('puts token models first, then orders by official output price desc, then name desc', () => {
    const models = [
      model({
        name: 'cheap',
        official_pricing: { input_price: 1, output_price: 1, cache_write_price: null, cache_read_price: null }
      }),
      model({ name: 'img', pricing: { billing_mode: 'image' } as PlazaModel['pricing'] }),
      model({
        name: 'pricey',
        official_pricing: { input_price: 1, output_price: 9, cache_write_price: null, cache_read_price: null }
      }),
      model({ name: 'no-official', official_pricing: null }),
      model({
        name: 'v2',
        official_pricing: { input_price: 1, output_price: 1, cache_write_price: null, cache_read_price: null }
      })
    ]
    expect(sortModels(models).map((m) => m.name)).toEqual(['pricey', 'v2', 'cheap', 'no-official', 'img'])
  })

  it('adds one row per time-pricing period after the standard row', () => {
    const m = model({
      name: 'm',
      time_pricing: {
        timezone: 'UTC',
        periods: [
          { start_time: '00:00:00', end_time: '06:00:00', multiplier: 0.5 },
          { start_time: '22:00:00', end_time: '23:59:00', multiplier: 0.8 }
        ]
      }
    })
    expect(buildRows([m]).map((r) => r.key)).toEqual(['anthropic:m', 'anthropic:m:0', 'anthropic:m:1'])
  })
})

describe('tier labels', () => {
  const iv = (min: number, max: number | null, label?: string) =>
    ({ min_tokens: min, max_tokens: max, tier_label: label }) as never
  it('prefers the explicit label, else ≤max / >min with K / M units', () => {
    expect(tierLabel(iv(0, 200_000, 'Standard'))).toBe('Standard')
    expect(tierLabel(iv(0, 200_000))).toBe('≤200K')
    expect(tierLabel(iv(200_000, null))).toBe('>200K')
    expect(tierLabel(iv(1_000_000, null))).toBe('>1M')
    expect(tierLabel(iv(0, 1_500_000))).toBe('≤1.5M')
    expect(tierLabel(iv(0, 512))).toBe('≤512')
  })
})

describe('faceted filters', () => {
  const groups = [
    group({
      id: 1,
      platform: 'anthropic',
      rate_multiplier: 1,
      models: [model({ name: 'claude-a' }), model({ name: 'claude-b' })]
    }),
    group({
      id: 2,
      platform: 'openai',
      rate_multiplier: 2,
      user_rate_multiplier: 0.5,
      models: [model({ name: 'gpt-x', platform: 'openai' })]
    }),
    group({
      id: 3,
      platform: 'openai',
      rate_multiplier: 1,
      name: 'A-group',
      models: [model({ name: 'gpt-y', platform: 'openai' })]
    })
  ]
  const options = groups.map((g) => ({ id: g.id, platform: g.platform, rate: effectiveRateOf(g) }))
  const none = { platform: 'all', groupId: 'all' as const, rate: 'all' as const, search: '' }

  it('disables options that would produce no groups under the other selections', () => {
    expect(platformEnabled(options, { ...none, rate: 0.5 }, 'anthropic')).toBe(false)
    expect(platformEnabled(options, { ...none, rate: 0.5 }, 'openai')).toBe(true)
    expect(groupEnabled({ ...none, platform: 'openai' }, options[0])).toBe(false)
    expect(groupEnabled({ ...none, platform: 'openai' }, options[1])).toBe(true)
    expect(rateEnabled(options, { ...none, platform: 'anthropic' }, 0.5)).toBe(false)
    expect(rateEnabled(options, { ...none, platform: 'anthropic' }, 1)).toBe(true)
  })

  it('filters by platform / group / effective rate and sorts by effective rate then name', () => {
    expect(filterGroups(groups, none).map((g) => g.id)).toEqual([2, 3, 1])
    expect(filterGroups(groups, { ...none, platform: 'openai' }).map((g) => g.id)).toEqual([2, 3])
    expect(filterGroups(groups, { ...none, groupId: 1 }).map((g) => g.id)).toEqual([1])
    expect(filterGroups(groups, { ...none, rate: 0.5 }).map((g) => g.id)).toEqual([2])
  })

  it('search keeps only matching models and hides groups without matches', () => {
    const result = filterGroups(groups, { ...none, search: ' CLAUDE-b ' })
    expect(result.map((g) => g.id)).toEqual([1])
    expect(result[0].models.map((m) => m.name)).toEqual(['claude-b'])
    expect(filterGroups(groups, { ...none, search: 'nothing' })).toEqual([])
  })
})
