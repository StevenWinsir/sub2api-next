/** 密钥表单的纯逻辑（校验 / 载荷构建），行为与 Vue 版 KeysView 一致。 */
import type { ApiKey, UpdateApiKeyRequest } from '@/types'

export interface KeyFormData {
  name: string
  group_id: number | null
  status: 'active' | 'inactive'
  use_custom_key: boolean
  custom_key: string
  enable_ip_restriction: boolean
  ip_whitelist: string
  ip_blacklist: string
  enable_quota: boolean
  quota: number | null
  enable_rate_limit: boolean
  rate_limit_5h: number | null
  rate_limit_1d: number | null
  rate_limit_7d: number | null
  enable_expiration: boolean
  expiration_preset: '7' | '30' | '90' | 'custom'
  expiration_date: string
}

export const EMPTY_KEY_FORM: KeyFormData = {
  name: '',
  group_id: null,
  status: 'active',
  use_custom_key: false,
  custom_key: '',
  enable_ip_restriction: false,
  ip_whitelist: '',
  ip_blacklist: '',
  enable_quota: false,
  quota: null,
  enable_rate_limit: false,
  rate_limit_5h: null,
  rate_limit_1d: null,
  rate_limit_7d: null,
  enable_expiration: false,
  expiration_preset: '30',
  expiration_date: ''
}

/** datetime-local 控件值（本地时区）。 */
export function formatDateTimeLocal(isoDate: string): string {
  const date = new Date(isoDate)
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** 自定义密钥校验：返回 i18n 键或空串。 */
export function customKeyErrorKey(form: Pick<KeyFormData, 'use_custom_key' | 'custom_key'>): string {
  if (!form.use_custom_key || !form.custom_key) return ''
  if (form.custom_key.length < 16) return 'keys.customKeyTooShort'
  if (!/^[a-zA-Z0-9_-]+$/.test(form.custom_key)) return 'keys.customKeyInvalidChars'
  return ''
}

export function keyToForm(key: ApiKey): KeyFormData {
  const hasIPRestriction = (key.ip_whitelist?.length ?? 0) > 0 || (key.ip_blacklist?.length ?? 0) > 0
  return {
    name: key.name,
    group_id: key.group_id,
    status: key.status === 'quota_exhausted' || key.status === 'expired' ? 'inactive' : key.status,
    use_custom_key: false,
    custom_key: '',
    enable_ip_restriction: hasIPRestriction,
    ip_whitelist: (key.ip_whitelist || []).join('\n'),
    ip_blacklist: (key.ip_blacklist || []).join('\n'),
    enable_quota: key.quota > 0,
    quota: key.quota > 0 ? key.quota : null,
    enable_rate_limit: key.rate_limit_5h > 0 || key.rate_limit_1d > 0 || key.rate_limit_7d > 0,
    rate_limit_5h: key.rate_limit_5h || null,
    rate_limit_1d: key.rate_limit_1d || null,
    rate_limit_7d: key.rate_limit_7d || null,
    enable_expiration: !!key.expires_at,
    expiration_preset: 'custom',
    expiration_date: key.expires_at ? formatDateTimeLocal(key.expires_at) : ''
  }
}

/** 已耗尽 / 已过期的密钥，仅当用户选择“启用”时才提交 status。 */
export function shouldSubmitEditStatus(key: ApiKey, status: 'active' | 'inactive'): boolean {
  if (key.status === 'quota_exhausted' || key.status === 'expired') return status === 'active'
  return true
}

export const parseIPList = (text: string): string[] =>
  text
    .split('\n')
    .map((ip) => ip.trim())
    .filter((ip) => ip.length > 0)

export interface KeySubmitPlan {
  ipWhitelist: string[]
  ipBlacklist: string[]
  quota: number
  expiresInDays?: number
  expiresAt?: string | null
  rateLimit: { rate_limit_5h: number; rate_limit_1d: number; rate_limit_7d: number }
}

/** 由表单计算提交所需的各字段（创建 / 编辑共用）。 */
export function buildSubmitPlan(form: KeyFormData, isEdit: boolean, now = new Date()): KeySubmitPlan {
  const ipWhitelist = form.enable_ip_restriction ? parseIPList(form.ip_whitelist) : []
  const ipBlacklist = form.enable_ip_restriction ? parseIPList(form.ip_blacklist) : []
  const quota = form.quota && form.quota > 0 ? form.quota : 0

  let expiresInDays: number | undefined
  let expiresAt: string | null | undefined
  if (form.enable_expiration && form.expiration_date) {
    if (!isEdit) {
      const diffDays = Math.ceil((new Date(form.expiration_date).getTime() - now.getTime()) / 86400000)
      expiresInDays = diffDays > 0 ? diffDays : 1
    } else {
      expiresAt = new Date(form.expiration_date).toISOString()
    }
  } else if (isEdit) {
    // 编辑模式：关闭或清空到期时间 → 发送空串以清除
    expiresAt = ''
  }

  const pos = (v: number | null) => (v && v > 0 ? v : 0)
  const rateLimit = form.enable_rate_limit
    ? {
        rate_limit_5h: pos(form.rate_limit_5h),
        rate_limit_1d: pos(form.rate_limit_1d),
        rate_limit_7d: pos(form.rate_limit_7d)
      }
    : { rate_limit_5h: 0, rate_limit_1d: 0, rate_limit_7d: 0 }

  return { ipWhitelist, ipBlacklist, quota, expiresInDays, expiresAt, rateLimit }
}

export function buildUpdatePayload(form: KeyFormData, plan: KeySubmitPlan, key: ApiKey): UpdateApiKeyRequest {
  const updates: UpdateApiKeyRequest = {
    name: form.name,
    group_id: form.group_id,
    ip_whitelist: plan.ipWhitelist,
    ip_blacklist: plan.ipBlacklist,
    quota: plan.quota,
    expires_at: plan.expiresAt,
    rate_limit_5h: plan.rateLimit.rate_limit_5h,
    rate_limit_1d: plan.rateLimit.rate_limit_1d,
    rate_limit_7d: plan.rateLimit.rate_limit_7d
  }
  if (shouldSubmitEditStatus(key, form.status)) updates.status = form.status
  return updates
}

/** 重置倍率窗口的剩余时间文案（d/h/m）。 */
export function formatResetCountdown(resetAt: string | null, now: number, resetNowLabel: string): string {
  if (!resetAt) return ''
  const diff = new Date(resetAt).getTime() - now
  if (diff <= 0) return resetNowLabel
  const days = Math.floor(diff / 86400000)
  const hours = Math.floor((diff % 86400000) / 3600000)
  const mins = Math.floor((diff % 3600000) / 60000)
  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${mins}m`
  return `${mins}m`
}
