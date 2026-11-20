import { describe, expect, it } from 'vitest'
import type { ChannelModelPricing } from '@/api/admin/channels'
import {
  draftToPricing,
  emptyDraft,
  mTokToPerToken,
  parseModels,
  perTokenToMTok,
  pricingToDraft,
  validateDrafts
} from '../channelPricingModel'

describe('price unit conversion', () => {
  it('round-trips per-token ⇄ $/MTok without float noise', () => {
    expect(perTokenToMTok(5e-8)).toBe(0.05)
    expect(mTokToPerToken('0.05')).toBe(5e-8)
    expect(mTokToPerToken('')).toBeNull()
    expect(perTokenToMTok(null)).toBeNull()
  })
})

describe('draft ⇄ pricing', () => {
  const base: ChannelModelPricing = {
    platform: 'openai',
    models: ['gpt-5', 'gpt-5-mini'],
    billing_mode: 'token',
    input_price: 1e-6,
    output_price: 4e-6,
    cache_write_price: null,
    cache_read_price: 1e-7,
    image_input_price: null,
    image_output_price: null,
    per_request_price: null,
    fast_multiplier: 2,
    intervals: [
      {
        min_tokens: 0,
        max_tokens: 200000,
        tier_label: 'a',
        input_price: 1e-6,
        output_price: 4e-6,
        cache_write_price: null,
        cache_read_price: null,
        input_multiplier: null,
        output_multiplier: null,
        cache_write_multiplier: null,
        cache_read_multiplier: null,
        per_request_price: null,
        sort_order: 0
      }
    ],
    time_pricing: { timezone: 'UTC', periods: [] }
  }

  it('preserves fields the form does not edit (intervals / time pricing / multipliers)', () => {
    const d = pricingToDraft(base)
    expect(d.input).toBe('1')
    const out = draftToPricing({ ...d, output: '8' })
    expect(out.output_price).toBe(8e-6)
    expect(out.fast_multiplier).toBe(2)
    expect(out.intervals).toHaveLength(1)
    expect(out.time_pricing).toEqual({ timezone: 'UTC', periods: [] })
  })

  it('parses models from newlines and commas, deduplicated', () => {
    expect(parseModels('a, b\nb\n\n c ')).toEqual(['a', 'b', 'c'])
  })
})

describe('validateDrafts', () => {
  it('rejects empty and duplicated models, requires per-request price', () => {
    expect(validateDrafts([emptyDraft()])?.key).toBe('admin.channels.emptyModelsInPricing')
    const a = { ...emptyDraft('openai'), modelsText: 'x' }
    const b = { ...emptyDraft('openai'), modelsText: 'X' }
    expect(validateDrafts([a, b])?.key).toBe('admin.channels.duplicateModels')
    expect(validateDrafts([{ ...a, billingMode: 'per_request' }])?.key).toBe(
      'admin.channels.form.perRequestPriceRequired'
    )
    expect(validateDrafts([{ ...a, billingMode: 'per_request', perRequest: '0.1' }])).toBeNull()
  })
})
