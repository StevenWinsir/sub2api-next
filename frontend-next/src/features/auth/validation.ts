/** 认证表单的纯校验函数（与 Vue 版规则一致），返回 i18n 键或 null。 */
import {
  isRegistrationEmailSuffixAllowed,
  normalizeRegistrationEmailSuffixWhitelist
} from '@/utils/registrationEmailPolicy'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email)
}

export function validateLoginFields(email: string, password: string): { email?: string; password?: string } {
  const errors: { email?: string; password?: string } = {}
  if (!email.trim()) errors.email = 'auth.emailRequired'
  else if (!isValidEmail(email)) errors.email = 'auth.invalidEmail'
  if (!password) errors.password = 'auth.passwordRequired'
  else if (password.length < 6) errors.password = 'auth.passwordMinLength'
  return errors
}

export interface RegisterFields {
  email: string
  password: string
  confirmPassword: string
  invitationCode: string
}

export interface RegisterRules {
  emailDomainQuotaEnabled: boolean
  emailSuffixWhitelist: string[]
  invitationCodeEnabled: boolean
}

export type RegisterErrors = Partial<
  Record<'email' | 'password' | 'confirmPassword' | 'invitationCode', string>
> & { emailSuffixNotAllowed?: boolean }

export function validateRegisterFields(fields: RegisterFields, rules: RegisterRules): RegisterErrors {
  const errors: RegisterErrors = {}
  if (!fields.email.trim()) errors.email = 'auth.emailRequired'
  else if (!isValidEmail(fields.email)) errors.email = 'auth.invalidEmail'
  else if (
    // 域名限量注册关闭时保持严格白名单预检；开启时交给后端按域名额度判定
    !rules.emailDomainQuotaEnabled &&
    !isRegistrationEmailSuffixAllowed(fields.email, rules.emailSuffixWhitelist)
  ) {
    errors.email = 'auth.emailSuffixNotAllowed'
    errors.emailSuffixNotAllowed = true
  }
  if (!fields.password) errors.password = 'auth.passwordRequired'
  else if (fields.password.length < 6) errors.password = 'auth.passwordMinLength'
  if (!fields.confirmPassword) errors.confirmPassword = 'auth.confirmPasswordRequired'
  else if (fields.password !== fields.confirmPassword) errors.confirmPassword = 'auth.passwordsDoNotMatch'
  if (rules.invitationCodeEnabled && !fields.invitationCode.trim())
    errors.invitationCode = 'auth.invitationCodeRequired'
  return errors
}

export function normalizeWhitelist(list: string[] | undefined): string[] {
  return normalizeRegistrationEmailSuffixWhitelist(list || [])
}

export function promoErrorKey(code?: string): string {
  switch (code) {
    case 'PROMO_CODE_NOT_FOUND':
      return 'auth.promoCodeNotFound'
    case 'PROMO_CODE_EXPIRED':
      return 'auth.promoCodeExpired'
    case 'PROMO_CODE_DISABLED':
      return 'auth.promoCodeDisabled'
    case 'PROMO_CODE_MAX_USED':
      return 'auth.promoCodeMaxUsed'
    case 'PROMO_CODE_ALREADY_USED':
      return 'auth.promoCodeAlreadyUsed'
    default:
      return 'auth.promoCodeInvalid'
  }
}
