/** 风控（内容审核）配置：表单 ↔ 提交负载的纯函数（与 Vue 版 RiskControlView 逐字段一致）。 */
import type {
  ContentModerationAPIKeyStatus,
  ContentModerationConfig,
  ContentModerationModelFilter,
  ContentModerationModelFilterType,
  KeywordBlockingMode,
  ModerationEngine,
  ModerationMode,
  UpdateContentModerationConfig,
  UpdateModerationEngineConfig
} from '@/api/admin/riskControl'

export type APIKeysWriteMode = 'append' | 'replace'

export const riskThresholdDefaults: Record<string, number> = {
  harassment: 98,
  'harassment/threatening': 90,
  hate: 65,
  'hate/threatening': 65,
  illicit: 95,
  'illicit/violent': 95,
  'self-harm': 65,
  'self-harm/intent': 85,
  'self-harm/instructions': 65,
  sexual: 65,
  'sexual/minors': 65,
  violence: 95,
  'violence/graphic': 95
}
export const riskThresholdCategories = Object.keys(riskThresholdDefaults)
export const blockedKeywordMax = 10000

export interface EngineDraft {
  base_url: string
  model: string
  proxy_id: number | null
  api_keys_text: string
  api_key_configured: boolean
  api_key_masked: string
  api_key_count: number
  api_key_masks: string[]
  api_key_statuses: ContentModerationAPIKeyStatus[]
  api_keys_mode: APIKeysWriteMode
  clear_api_key: boolean
  timeout_ms: number
  retry_count: number
  thresholds: Record<string, number>
  pendingDeletes: string[]
}

export interface ConfigForm extends EngineDraft {
  engine: ModerationEngine
  enabled: boolean
  mode: ModerationMode
  sample_rate: number
  all_groups: boolean
  group_ids: number[]
  record_non_hits: boolean
  worker_count: number
  queue_size: number
  block_status: number
  block_message: string
  email_on_hit: boolean
  auto_ban_enabled: boolean
  cyber_policy_exclude_from_ban_count: boolean
  ban_threshold: number
  violation_window_hours: number
  hit_retention_days: number
  non_hit_retention_days: number
  pre_hash_check_enabled: boolean
  blocked_keywords_text: string
  keyword_blocking_mode: KeywordBlockingMode
  model_filter_type: ContentModerationModelFilterType
  model_filter_models: string[]
}

export const ENGINE_FIELDS = [
  'base_url',
  'model',
  'proxy_id',
  'api_keys_text',
  'api_key_configured',
  'api_key_masked',
  'api_key_count',
  'api_key_masks',
  'api_key_statuses',
  'api_keys_mode',
  'clear_api_key',
  'timeout_ms',
  'retry_count',
  'thresholds'
] as const

export function clampPercent(value: unknown): number {
  const n = Number(value)
  if (!Number.isFinite(n)) return 0
  return Math.min(100, Math.max(0, n))
}

export function parseApiKeys(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter((s, i, arr) => s && arr.indexOf(s) === i)
}

export function parseBlockedKeywords(value: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const line of value.split(/\r?\n/)) {
    const kw = line.trim()
    if (!kw) continue
    const key = kw.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(kw)
  }
  return out
}

export function normalizeModelNames(models: unknown): string[] {
  if (!Array.isArray(models)) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const item of models) {
    const model = String(item ?? '').trim()
    if (!model) continue
    const key = model.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(model)
  }
  return out
}

export function normalizeKeywordBlockingMode(v: unknown): KeywordBlockingMode {
  return v === 'keyword_only' || v === 'api_only' || v === 'keyword_and_api' ? v : 'keyword_and_api'
}

export function normalizeModelFilterType(v: unknown): ContentModerationModelFilterType {
  return v === 'include' || v === 'exclude' || v === 'all' ? v : 'all'
}

export function normalizeModelFilter(v: unknown): ContentModerationModelFilter {
  if (!v || typeof v !== 'object') return { type: 'all', models: [] }
  const raw = v as Partial<ContentModerationModelFilter>
  const type = normalizeModelFilterType(raw.type)
  return { type, models: type === 'all' ? [] : normalizeModelNames(raw.models) }
}

export function riskThresholdsFromConfig(
  t: Record<string, number> | null | undefined
): Record<string, number> {
  const out: Record<string, number> = { ...riskThresholdDefaults }
  for (const c of riskThresholdCategories) {
    const v = t?.[c]
    if (Number.isFinite(v)) out[c] = clampPercent(Number(v) * 100)
  }
  return out
}

export function buildRiskThresholdPayload(thresholds: Record<string, number>): Record<string, number> {
  const payload: Record<string, number> = {}
  for (const c of riskThresholdCategories) payload[c] = Number((clampPercent(thresholds[c]) / 100).toFixed(4))
  return payload
}

export function engineDraftFromConfig(
  config: ContentModerationConfig | undefined,
  engine: ModerationEngine
): EngineDraft {
  return {
    base_url:
      config?.base_url || (engine === 'typesafe' ? 'https://api.typesafe.ai' : 'https://api.openai.com'),
    model: config?.model || (engine === 'typesafe' ? 'jev-latest' : 'omni-moderation-latest'),
    proxy_id: config?.proxy_id ?? null,
    api_keys_text: '',
    api_key_configured: config?.api_key_configured ?? false,
    api_key_masked: config?.api_key_masked ?? '',
    api_key_count: config?.api_key_count ?? 0,
    api_key_masks: [...(config?.api_key_masks ?? [])],
    api_key_statuses: [...(config?.api_key_statuses ?? [])],
    api_keys_mode: 'append',
    clear_api_key: false,
    pendingDeletes: [],
    timeout_ms: config?.timeout_ms ?? 3000,
    retry_count: config?.retry_count ?? 2,
    thresholds: riskThresholdsFromConfig(config?.thresholds)
  }
}

export function engineDraftPayload(d: EngineDraft): UpdateModerationEngineConfig {
  const keys = parseApiKeys(d.api_keys_text)
  if (!d.clear_api_key && d.api_keys_mode === 'replace' && keys.length === 0) {
    throw new Error('empty replacement keys')
  }
  return {
    base_url: d.base_url,
    model: d.model,
    proxy_id: d.proxy_id ?? 0,
    timeout_ms: d.timeout_ms,
    retry_count: d.retry_count,
    thresholds: Object.fromEntries(
      riskThresholdCategories.map((k) => [k, clampPercent(d.thresholds[k]) / 100])
    ),
    clear_api_key: d.clear_api_key,
    api_keys: keys.length ? keys : undefined,
    api_keys_mode: d.api_keys_mode,
    delete_api_key_hashes: d.pendingDeletes
  }
}

export function defaultConfigForm(defaultBlockMessage: string): ConfigForm {
  return {
    engine: 'openai',
    enabled: false,
    mode: 'pre_block',
    ...engineDraftFromConfig(undefined, 'openai'),
    sample_rate: 100,
    all_groups: true,
    group_ids: [],
    record_non_hits: false,
    worker_count: 4,
    queue_size: 32768,
    block_status: 403,
    block_message: defaultBlockMessage,
    email_on_hit: true,
    auto_ban_enabled: true,
    cyber_policy_exclude_from_ban_count: false,
    ban_threshold: 10,
    violation_window_hours: 720,
    hit_retention_days: 180,
    non_hit_retention_days: 3,
    pre_hash_check_enabled: false,
    blocked_keywords_text: '',
    keyword_blocking_mode: 'keyword_and_api',
    model_filter_type: 'all',
    model_filter_models: []
  }
}

/** 服务端配置 → 表单（含当前引擎草稿与全部引擎草稿）。 */
export function configToForm(
  config: ContentModerationConfig,
  defaultBlockMessage: string
): { form: ConfigForm; drafts: Record<ModerationEngine, EngineDraft>; savedEngine: ModerationEngine } {
  const savedEngine: ModerationEngine = config.engine ?? 'openai'
  const drafts: Record<ModerationEngine, EngineDraft> = {
    openai: engineDraftFromConfig(
      config.engine_configs?.openai ?? (savedEngine === 'openai' ? config : undefined),
      'openai'
    ),
    typesafe: engineDraftFromConfig(
      config.engine_configs?.typesafe ?? (savedEngine === 'typesafe' ? config : undefined),
      'typesafe'
    )
  }
  const mf = normalizeModelFilter(config.model_filter)
  const form: ConfigForm = {
    ...defaultConfigForm(defaultBlockMessage),
    ...structuredClone(drafts[savedEngine]),
    engine: savedEngine,
    enabled: config.enabled,
    mode: config.mode,
    sample_rate: config.sample_rate ?? 100,
    all_groups: config.all_groups,
    group_ids: Array.isArray(config.group_ids) ? [...config.group_ids] : [],
    record_non_hits: config.record_non_hits,
    worker_count: config.worker_count || 4,
    queue_size: config.queue_size || 32768,
    block_status: config.block_status || 403,
    block_message: config.block_message || defaultBlockMessage,
    email_on_hit: config.email_on_hit ?? true,
    auto_ban_enabled: config.auto_ban_enabled ?? true,
    cyber_policy_exclude_from_ban_count: config.cyber_policy_exclude_from_ban_count ?? false,
    ban_threshold: config.ban_threshold || 10,
    violation_window_hours: config.violation_window_hours || 720,
    hit_retention_days: config.hit_retention_days || 180,
    non_hit_retention_days: Math.min(Math.max(config.non_hit_retention_days || 3, 1), 3),
    pre_hash_check_enabled: config.pre_hash_check_enabled ?? false,
    blocked_keywords_text: Array.isArray(config.blocked_keywords) ? config.blocked_keywords.join('\n') : '',
    keyword_blocking_mode: normalizeKeywordBlockingMode(config.keyword_blocking_mode),
    model_filter_type: mf.type,
    model_filter_models: mf.models
  }
  return { form, drafts, savedEngine }
}

export function captureEngineDraft(form: ConfigForm): EngineDraft {
  return structuredClone({
    ...(Object.fromEntries(ENGINE_FIELDS.map((k) => [k, form[k]])) as Omit<EngineDraft, 'pendingDeletes'>),
    pendingDeletes: [...form.pendingDeletes]
  })
}

export type SavePayloadResult =
  | { ok: true; payload: UpdateContentModerationConfig }
  | { ok: false; error: 'modelFilterModelsRequired' | 'apiKeysReplaceNoInput' }

/** 表单 → PUT /admin/risk-control/config 负载。 */
export function buildSavePayload(
  form: ConfigForm,
  drafts: Partial<Record<ModerationEngine, EngineDraft>>,
  defaultBlockMessage: string
): SavePayloadResult {
  const type = normalizeModelFilterType(form.model_filter_type)
  const modelFilter: ContentModerationModelFilter =
    type === 'all'
      ? { type: 'all', models: [] }
      : { type, models: normalizeModelNames(form.model_filter_models) }
  if (modelFilter.type !== 'all' && modelFilter.models.length === 0) {
    return { ok: false, error: 'modelFilterModelsRequired' }
  }
  const payload: UpdateContentModerationConfig = {
    engine: form.engine,
    enabled: form.enabled,
    mode: form.mode,
    base_url: form.base_url,
    model: form.model,
    // 后端语义：0 清除代理（直连），>0 指定代理
    proxy_id: form.proxy_id ?? 0,
    timeout_ms: Number(form.timeout_ms) || 3000,
    retry_count: Number(form.retry_count) || 0,
    sample_rate: Number(form.sample_rate) || 0,
    all_groups: form.all_groups,
    group_ids: form.all_groups ? [] : [...form.group_ids],
    record_non_hits: form.record_non_hits,
    clear_api_key: form.clear_api_key,
    worker_count: Number(form.worker_count) || 4,
    queue_size: Number(form.queue_size) || 32768,
    block_status: Number(form.block_status) || 403,
    block_message: form.block_message || defaultBlockMessage,
    email_on_hit: form.email_on_hit,
    auto_ban_enabled: form.auto_ban_enabled,
    cyber_policy_exclude_from_ban_count: form.cyber_policy_exclude_from_ban_count,
    ban_threshold: Number(form.ban_threshold) || 10,
    violation_window_hours: Number(form.violation_window_hours) || 720,
    hit_retention_days: Number(form.hit_retention_days) || 180,
    non_hit_retention_days: Math.min(Math.max(Number(form.non_hit_retention_days) || 3, 1), 3),
    pre_hash_check_enabled: form.pre_hash_check_enabled,
    thresholds: buildRiskThresholdPayload(form.thresholds),
    blocked_keywords: parseBlockedKeywords(form.blocked_keywords_text),
    keyword_blocking_mode: form.keyword_blocking_mode,
    model_filter: modelFilter
  }
  const keys = parseApiKeys(form.api_keys_text)
  if (!payload.clear_api_key && form.api_keys_mode === 'replace' && keys.length === 0) {
    return { ok: false, error: 'apiKeysReplaceNoInput' }
  }
  if (keys.length > 0) {
    payload.api_keys = keys
    payload.api_keys_mode = form.api_keys_mode
    payload.clear_api_key = false
  }
  if (!payload.clear_api_key && form.api_keys_mode !== 'replace' && form.pendingDeletes.length > 0) {
    payload.delete_api_key_hashes = [...form.pendingDeletes]
  }
  const merged = { ...drafts, [form.engine]: captureEngineDraft(form) }
  payload.engine_configs = Object.fromEntries(
    Object.entries(merged).map(([engine, d]) => [engine, engineDraftPayload(d as EngineDraft)])
  )
  return { ok: true, payload }
}

export function normalizeDateTimeLocal(v: string): string | undefined {
  if (!v) return undefined
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString()
}
