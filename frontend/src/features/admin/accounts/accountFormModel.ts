/**
 * 账号表单的纯逻辑：平台 × 类型 → 可见字段、载荷构造（与 UI 分离，便于快照测试）。
 * 凭据策略（与 Vue 版一致）：
 *  - 编辑 API Key 账号：以现有（已脱敏）凭据为底，覆盖 base_url，仅在填写新密钥时覆盖 api_key；
 *  - 创建 / 编辑其他类型：凭据 JSON 必须是对象；编辑时留空表示不修改凭据。
 */
import { numOrNull, numOrUndef, fromLocalInput } from '@/features/admin/common/fieldUtils'
import type { Account, AccountType, CreateAccountRequest, UpdateAccountRequest } from '@/types'

export interface FormState {
  name: string
  notes: string
  platform: string
  type: AccountType
  baseUrl: string
  apiKey: string
  credentialsJson: string
  proxyId: string
  concurrency: string
  loadFactor: string
  priority: string
  rateMultiplier: string
  groupIds: number[]
  expiresAt: string
  autoPauseOnExpired: boolean
  schedulable: boolean
  status: 'active' | 'inactive'
}

export interface FieldVisibility {
  baseUrl: boolean
  apiKey: boolean
  credentialsJson: boolean
  oauthFlow: boolean
}

/** 每个平台可添加的账号类型（首项为默认）。 */
export function accountTypeOptions(platform: string): AccountType[] {
  switch (platform) {
    case 'anthropic':
      return ['apikey', 'oauth', 'setup-token', 'bedrock']
    case 'openai':
      return ['oauth', 'apikey', 'upstream']
    case 'gemini':
      return ['oauth', 'apikey', 'service_account']
    case 'antigravity':
      return ['oauth', 'upstream']
    case 'grok':
      return ['oauth', 'apikey']
    default:
      return ['apikey']
  }
}

export function accountFormFields(platform: string, type: AccountType, editing: boolean): FieldVisibility {
  const apikeyLike = type === 'apikey' || type === 'upstream'
  const anthropicOAuth = platform === 'anthropic' && (type === 'oauth' || type === 'setup-token')
  return {
    baseUrl: apikeyLike,
    apiKey: apikeyLike,
    // Anthropic 的 OAuth / Setup Token 走授权流程；其余非 API Key 类型直接粘贴凭据 JSON
    oauthFlow: anthropicOAuth && !editing,
    credentialsJson: !apikeyLike && !(anthropicOAuth && !editing)
  }
}

type Built<T> = { payload: T } | { error: string }

function parseCredentials(raw: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(raw)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

function expiresSeconds(v: string): number | null {
  const iso = fromLocalInput(v)
  return iso ? Math.floor(new Date(iso).getTime() / 1000) : null
}

function common(form: FormState) {
  return {
    name: form.name.trim(),
    notes: form.notes.trim() ? form.notes.trim() : null,
    proxy_id: numOrNull(form.proxyId),
    concurrency: numOrUndef(form.concurrency),
    load_factor: numOrNull(form.loadFactor),
    priority: numOrUndef(form.priority),
    rate_multiplier: numOrUndef(form.rateMultiplier),
    group_ids: form.groupIds,
    expires_at: expiresSeconds(form.expiresAt),
    auto_pause_on_expired: form.autoPauseOnExpired
  }
}

export function buildCreatePayload(form: FormState): Built<CreateAccountRequest> {
  if (!form.name.trim()) return { error: 'adminUi.accounts.nameRequired' }
  const fields = accountFormFields(form.platform, form.type, false)
  let credentials: Record<string, unknown> = {}
  if (fields.apiKey) {
    if (!form.apiKey.trim()) return { error: 'admin.accounts.apiKeyIsRequired' }
    credentials = {
      api_key: form.apiKey.trim(),
      ...(form.baseUrl.trim() ? { base_url: form.baseUrl.trim() } : {})
    }
  } else if (fields.credentialsJson) {
    const parsed = parseCredentials(form.credentialsJson)
    if (!parsed) return { error: 'adminUi.accounts.credentialsJsonInvalid' }
    credentials = parsed
  }
  return {
    payload: { ...common(form), platform: form.platform, type: form.type, credentials }
  }
}

export function buildUpdatePayload(account: Account, form: FormState): Built<UpdateAccountRequest> {
  if (!form.name.trim()) return { error: 'adminUi.accounts.nameRequired' }
  const payload: UpdateAccountRequest = {
    ...common(form),
    schedulable: form.schedulable,
    status: form.status
  }
  const current = (account.credentials as Record<string, unknown> | undefined) ?? {}
  if (account.type === 'apikey' || account.type === 'upstream') {
    const hasKey = account.credentials_status?.has_api_key ?? Boolean(current.api_key)
    if (!form.apiKey.trim() && !hasKey) return { error: 'admin.accounts.apiKeyIsRequired' }
    const next: Record<string, unknown> = { ...current }
    if (form.baseUrl.trim()) next.base_url = form.baseUrl.trim()
    else delete next.base_url
    if (form.apiKey.trim()) next.api_key = form.apiKey.trim()
    payload.credentials = next
  } else if (form.credentialsJson.trim()) {
    const parsed = parseCredentials(form.credentialsJson)
    if (!parsed) return { error: 'adminUi.accounts.credentialsJsonInvalid' }
    payload.credentials = parsed
  }
  return { payload }
}
