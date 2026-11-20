/** 第三方身份绑定状态解析（对应 ProfileIdentityBindingsSection / ProfileInfoCard 的纯逻辑）。 */
import type { User, UserAuthBindingStatus, UserAuthProvider, UserProfileSourceContext } from '@/types'

export type BindableProvider = Exclude<UserAuthProvider, 'email'>

function normalizeBindingStatus(binding: boolean | UserAuthBindingStatus | undefined): boolean | null {
  if (typeof binding === 'boolean') return binding
  if (!binding) return null
  if (typeof binding.bound === 'boolean') return binding.bound
  return Boolean(binding.provider_subject || binding.issuer || binding.provider_key)
}

export function isBound(user: User | null | undefined, provider: UserAuthProvider): boolean {
  if (provider === 'email') {
    if (typeof user?.email_bound === 'boolean') return user.email_bound
    return normalizeBindingStatus(user?.auth_bindings?.email ?? user?.identity_bindings?.email) ?? false
  }
  const direct = user?.[`${provider}_bound` as keyof User]
  if (typeof direct === 'boolean') return direct
  return (
    normalizeBindingStatus(user?.auth_bindings?.[provider] ?? user?.identity_bindings?.[provider]) ?? false
  )
}

export function bindingDetails(
  user: User | null | undefined,
  provider: UserAuthProvider
): UserAuthBindingStatus | null {
  const binding = user?.auth_bindings?.[provider] ?? user?.identity_bindings?.[provider]
  return !binding || typeof binding === 'boolean' ? null : binding
}

/** `.invalid` 结尾且未绑定邮箱的占位地址不展示。 */
export function displayableEmail(user: User | null | undefined): string {
  const email = user?.email?.trim() || ''
  if (!email) return ''
  if (email.endsWith('.invalid') && !isBound(user, 'email')) return ''
  return email
}

export function normalizeProvider(value: string): UserAuthProvider | null {
  const v = value.trim().toLowerCase()
  if (['email', 'linuxdo', 'dingtalk', 'wechat', 'github', 'google'].includes(v)) return v as UserAuthProvider
  if (v === 'oidc' || v.startsWith('oidc:') || v.startsWith('oidc/')) return 'oidc'
  return null
}

const readString = (source: Record<string, unknown>, ...keys: string[]): string => {
  for (const k of keys) {
    const v = source[k]
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  return ''
}

/** 头像 / 昵称的第三方来源：返回 provider 与展示名（email 不算第三方）。 */
export function resolveThirdPartySource(
  raw: string | UserProfileSourceContext | null | undefined,
  labels: Record<UserAuthProvider, string>
): { provider: UserAuthProvider; label: string } | null {
  if (!raw) return null
  if (typeof raw === 'string') {
    const p = normalizeProvider(raw)
    return !p || p === 'email' ? null : { provider: p, label: labels[p] }
  }
  const rec = raw as Record<string, unknown>
  const p = normalizeProvider(readString(rec, 'provider', 'source', 'provider_type', 'auth_provider'))
  if (!p || p === 'email') return null
  return {
    provider: p,
    label: readString(rec, 'provider_label', 'label', 'provider_name', 'providerName') || labels[p]
  }
}
