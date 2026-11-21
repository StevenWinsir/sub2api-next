import { describe, expect, it } from 'vitest'
import type { ContentModerationConfig } from '@/api/admin/riskControl'
import {
  buildRiskThresholdPayload,
  buildSavePayload,
  clampPercent,
  configToForm,
  defaultConfigForm,
  normalizeModelFilter,
  parseApiKeys,
  parseBlockedKeywords,
  riskThresholdDefaults
} from '../riskModel'

const MSG = 'blocked'
const baseConfig = (over: Partial<ContentModerationConfig> = {}): ContentModerationConfig =>
  ({
    enabled: true,
    mode: 'pre_block',
    base_url: 'https://api.openai.com',
    model: 'omni-moderation-latest',
    proxy_id: null,
    api_key_configured: true,
    api_key_masked: 'sk-***',
    api_key_count: 2,
    api_key_masks: ['a', 'b'],
    api_key_statuses: [],
    timeout_ms: 3000,
    sample_rate: 100,
    all_groups: true,
    group_ids: [],
    record_non_hits: false,
    thresholds: { harassment: 0.5 },
    worker_count: 4,
    queue_size: 32768,
    block_status: 403,
    block_message: '',
    email_on_hit: true,
    auto_ban_enabled: true,
    ban_threshold: 10,
    violation_window_hours: 720,
    retry_count: 2,
    hit_retention_days: 180,
    non_hit_retention_days: 9,
    pre_hash_check_enabled: false,
    blocked_keywords: ['a', 'b'],
    keyword_blocking_mode: 'weird' as never,
    model_filter: { type: 'include', models: ['gpt-4'] },
    cyber_policy_exclude_from_ban_count: false,
    ...over
  }) as ContentModerationConfig

describe('risk model helpers', () => {
  it('parses keys and keywords with de-duplication', () => {
    expect(parseApiKeys(' a \r\nb\na\n\n')).toEqual(['a', 'b'])
    expect(parseBlockedKeywords('Foo\nfoo\n bar \n')).toEqual(['Foo', 'bar'])
  })
  it('clamps percentages and converts thresholds to 0..1 with 4 decimals', () => {
    expect(clampPercent('abc')).toBe(0)
    expect(clampPercent(150)).toBe(100)
    const p = buildRiskThresholdPayload({ ...riskThresholdDefaults, harassment: 33.33333 })
    expect(p.harassment).toBe(0.3333)
    expect(p.hate).toBe(0.65)
  })
  it('normalizes model filters', () => {
    expect(normalizeModelFilter(null)).toEqual({ type: 'all', models: [] })
    expect(normalizeModelFilter({ type: 'include', models: ['A', 'a', ' ', 'B'] })).toEqual({
      type: 'include',
      models: ['A', 'B']
    })
    expect(normalizeModelFilter({ type: 'all', models: ['x'] })).toEqual({ type: 'all', models: [] })
  })
})

describe('configToForm', () => {
  it('maps server config to form with clamped retention and normalized enums', () => {
    const { form, drafts } = configToForm(baseConfig(), MSG)
    expect(form.non_hit_retention_days).toBe(3)
    expect(form.keyword_blocking_mode).toBe('keyword_and_api')
    expect(form.block_message).toBe(MSG)
    expect(form.thresholds.harassment).toBe(50)
    expect(form.blocked_keywords_text).toBe('a\nb')
    expect(drafts.typesafe.base_url).toBe('https://api.typesafe.ai')
  })
})

describe('buildSavePayload (payload parity with the Vue view)', () => {
  it('emits the exact field set', () => {
    const { form, drafts } = configToForm(baseConfig(), MSG)
    const res = buildSavePayload(form, drafts, MSG)
    expect(res.ok).toBe(true)
    if (!res.ok) return
    const { engine_configs, ...rest } = res.payload
    expect(Object.keys(rest).sort()).toEqual(
      [
        'engine',
        'enabled',
        'mode',
        'base_url',
        'model',
        'proxy_id',
        'timeout_ms',
        'retry_count',
        'sample_rate',
        'all_groups',
        'group_ids',
        'record_non_hits',
        'clear_api_key',
        'worker_count',
        'queue_size',
        'block_status',
        'block_message',
        'email_on_hit',
        'auto_ban_enabled',
        'cyber_policy_exclude_from_ban_count',
        'ban_threshold',
        'violation_window_hours',
        'hit_retention_days',
        'non_hit_retention_days',
        'pre_hash_check_enabled',
        'thresholds',
        'blocked_keywords',
        'keyword_blocking_mode',
        'model_filter'
      ].sort()
    )
    expect(rest.proxy_id).toBe(0) // 直连
    expect(rest.model_filter).toEqual({ type: 'include', models: ['gpt-4'] })
    expect(Object.keys(engine_configs ?? {}).sort()).toEqual(['openai', 'typesafe'])
    expect(engine_configs?.openai?.delete_api_key_hashes).toEqual([])
  })

  it('requires models for include/exclude filters and keys for replace mode', () => {
    const f = defaultConfigForm(MSG)
    expect(
      buildSavePayload({ ...f, model_filter_type: 'exclude', model_filter_models: [] }, {}, MSG)
    ).toEqual({ ok: false, error: 'modelFilterModelsRequired' })
    expect(buildSavePayload({ ...f, api_keys_mode: 'replace' }, {}, MSG)).toEqual({
      ok: false,
      error: 'apiKeysReplaceNoInput'
    })
  })

  it('writes keys, resets clear flag, and only sends pending deletes in append mode', () => {
    const f = {
      ...defaultConfigForm(MSG),
      api_keys_text: 'k1\nk1\nk2',
      clear_api_key: true,
      pendingDeletes: ['h1']
    }
    const res = buildSavePayload(f, {}, MSG)
    expect(res.ok && res.payload.api_keys).toEqual(['k1', 'k2'])
    expect(res.ok && res.payload.clear_api_key).toBe(false)
    expect(res.ok && res.payload.delete_api_key_hashes).toEqual(['h1'])
    const rep = buildSavePayload({ ...f, api_keys_mode: 'replace' }, {}, MSG)
    expect(rep.ok && rep.payload.delete_api_key_hashes).toBeUndefined()
  })

  it('all_groups clears group ids; numeric fallbacks match the Vue view', () => {
    const f = {
      ...defaultConfigForm(MSG),
      all_groups: true,
      group_ids: [1, 2],
      worker_count: 0,
      ban_threshold: NaN,
      non_hit_retention_days: 99
    }
    const res = buildSavePayload(f, {}, MSG)
    expect(res.ok && res.payload.group_ids).toEqual([])
    expect(res.ok && res.payload.worker_count).toBe(4)
    expect(res.ok && res.payload.ban_threshold).toBe(10)
    expect(res.ok && res.payload.non_hit_retention_days).toBe(3)
  })
})
