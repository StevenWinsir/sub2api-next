/**
 * OAuth 回调页共用的纯逻辑（与 Vue 版 LinuxDo / OIDC / 微信 / 钉钉 回调页逐条对应）。
 * 这里不触碰 window / store，便于表驱动单测（fragment 与 query 的各种组合、legacy 格式）。
 */
import type { OAuthAdoptionDecision, OAuthTokenResponse, PendingOAuthExchangeResponse } from '@/api/auth'

export type PendingAccountAction = 'none' | 'choose_account_action' | 'create_account' | 'bind_login'

/** 回调页能读到的 pending 响应（各 provider 字段的并集）。 */
export type PendingCompletion = PendingOAuthExchangeResponse & {
  step?: string
  status?: string
  state?: string
  intent?: string
  email?: string
  resolved_email?: string
  pending_email?: string
  existing_account_email?: string
  suggested_email?: string
  compat_email?: string
  requires_email_completion?: boolean
}

/** 令牌在 URL fragment（#）里传递；`#` 前缀可有可无。 */
export function parseFragmentParams(hash: string): URLSearchParams {
  return new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash)
}

/** legacy：后端直接把令牌放进 fragment（access_token / refresh_token / expires_in / token_type）。 */
export function readLegacyFragmentLogin(params: URLSearchParams): OAuthTokenResponse | null {
  const accessToken = params.get('access_token')?.trim() || ''
  if (!accessToken) return null
  const completion: OAuthTokenResponse = { access_token: accessToken }
  const refreshToken = params.get('refresh_token')?.trim() || ''
  if (refreshToken) completion.refresh_token = refreshToken
  const expiresIn = Number.parseInt(params.get('expires_in')?.trim() || '', 10)
  if (Number.isFinite(expiresIn) && expiresIn > 0) completion.expires_in = expiresIn
  const tokenType = params.get('token_type')?.trim() || ''
  if (tokenType) completion.token_type = tokenType
  return completion
}

/** OAuth 回调的 redirect 只接受站内相对路径（比通用 sanitizeRedirect 额外拒绝 `://` 与换行）。 */
export function sanitizeOAuthRedirect(path: string | null | undefined): string {
  if (!path) return '/dashboard'
  if (!path.startsWith('/')) return '/dashboard'
  if (path.startsWith('//')) return '/dashboard'
  if (path.includes('://')) return '/dashboard'
  if (/[\r\n\t\\]/.test(path)) return '/dashboard'
  return path
}

export function serializeAdoptionDecision(decision: OAuthAdoptionDecision): Record<string, boolean> {
  const payload: Record<string, boolean> = {}
  if (typeof decision.adoptDisplayName === 'boolean') payload.adopt_display_name = decision.adoptDisplayName
  if (typeof decision.adoptAvatar === 'boolean') payload.adopt_avatar = decision.adoptAvatar
  return payload
}

export function hasSuggestedProfile(c: {
  suggested_display_name?: string
  suggested_avatar_url?: string
}): boolean {
  return Boolean(c.suggested_display_name || c.suggested_avatar_url)
}

function norm(value: string | null | undefined): string {
  return value?.trim().toLowerCase() || ''
}

export function extractPendingAccountEmail(c: PendingCompletion, resumeEmail = ''): string {
  return (
    c.pending_email ||
    c.existing_account_email ||
    c.compat_email ||
    c.email ||
    c.resolved_email ||
    resumeEmail ||
    c.suggested_email ||
    ''
  ).trim()
}

const CHOOSER_STATES = new Set([
  'choice',
  'choose_account_action_required',
  'choose_account_action',
  'choose_account',
  'choose'
])
const CREATE_STATES = new Set(['email_required', 'create_account_required', 'create_account'])
const BIND_STATES = new Set([
  'bind_login_required',
  'bind_login',
  'existing_account',
  'existing_account_required',
  'existing_account_binding_required',
  'adopt_existing_user_by_email'
])

/** 由 step / status / state / error / intent 推断下一步（与 Vue 版优先级一致）。 */
export function resolvePendingAccountAction(c: PendingCompletion): PendingAccountAction {
  const raw = norm(c.step || c.status || c.state || c.error || c.intent)
  if (CHOOSER_STATES.has(raw)) return 'choose_account_action'
  if (CREATE_STATES.has(raw)) return 'create_account'
  if (BIND_STATES.has(raw)) return 'bind_login'
  return 'none'
}

/** create-account 失败后应切换到“绑定已有账号”的错误状态。 */
export function isCreateAccountRecoveryError(error: unknown): boolean {
  const data = (
    error as {
      response?: { data?: { reason?: string; error?: string; code?: string; step?: string; intent?: string } }
    }
  ).response?.data
  const states = [data?.reason, data?.error, data?.code, data?.step, data?.intent]
    .map((v) => v?.trim().toLowerCase())
    .filter((v): v is string => Boolean(v))
  return [
    'email_exists',
    'bind_login_required',
    'bind_login',
    'adopt_existing_user_by_email',
    'existing_account_required',
    'existing_account_binding_required'
  ].some((s) => states.includes(s))
}

export function getRequestErrorMessage(error: unknown, fallback: string): string {
  const err = error as { message?: string; response?: { data?: { detail?: string; message?: string } } }
  return err.response?.data?.detail || err.response?.data?.message || err.message || fallback
}

/** 钉钉：用户无邮箱，需要跳到补邮箱页面。 */
export function requiresEmailCompletion(c: PendingCompletion): boolean {
  return c.step === 'email_completion' || c.requires_email_completion === true
}

/** 密码类 TOTP 挑战：后端返回 requires_2fa + temp_token。 */
export function isTotpChallenge(c: PendingCompletion): boolean {
  return c.requires_2fa === true && Boolean(c.temp_token)
}
