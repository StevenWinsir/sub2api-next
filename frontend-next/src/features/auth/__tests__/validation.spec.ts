import { describe, expect, it } from 'vitest'
import {
  isValidEmail,
  normalizeWhitelist,
  promoErrorKey,
  validateLoginFields,
  validateRegisterFields
} from '../validation'

describe('isValidEmail', () => {
  it.each([
    ['a@b.co', true],
    ['user+tag@example.com', true],
    ['no-at.example.com', false],
    ['a@b', false],
    ['a b@c.de', false],
    ['', false]
  ])('%s -> %s', (value, expected) => {
    expect(isValidEmail(value)).toBe(expected)
  })
})

describe('validateLoginFields', () => {
  it('requires email and password with the same rules as the Vue login page', () => {
    expect(validateLoginFields('', '')).toEqual({
      email: 'auth.emailRequired',
      password: 'auth.passwordRequired'
    })
    expect(validateLoginFields('bad', '12345')).toEqual({
      email: 'auth.invalidEmail',
      password: 'auth.passwordMinLength'
    })
    expect(validateLoginFields('a@b.co', '123456')).toEqual({})
    expect(validateLoginFields('  ', 'x')).toMatchObject({ email: 'auth.emailRequired' })
  })
})

const rules = {
  emailDomainQuotaEnabled: false,
  emailSuffixWhitelist: [] as string[],
  invitationCodeEnabled: false
}
const ok = { email: 'a@b.co', password: 'secret1', confirmPassword: 'secret1', invitationCode: '' }

describe('validateRegisterFields', () => {
  it('accepts a valid form', () => {
    expect(validateRegisterFields(ok, rules)).toEqual({})
  })

  it('checks passwords and confirmation', () => {
    expect(validateRegisterFields({ ...ok, password: '', confirmPassword: '' }, rules)).toMatchObject({
      password: 'auth.passwordRequired',
      confirmPassword: 'auth.confirmPasswordRequired'
    })
    expect(validateRegisterFields({ ...ok, password: '123' }, rules).password).toBe('auth.passwordMinLength')
    expect(validateRegisterFields({ ...ok, confirmPassword: 'other' }, rules).confirmPassword).toBe(
      'auth.passwordsDoNotMatch'
    )
  })

  it('requires an invitation code only when the feature is enabled', () => {
    expect(validateRegisterFields(ok, { ...rules, invitationCodeEnabled: true }).invitationCode).toBe(
      'auth.invitationCodeRequired'
    )
    expect(
      validateRegisterFields({ ...ok, invitationCode: ' X ' }, { ...rules, invitationCodeEnabled: true })
    ).toEqual({})
  })

  it('enforces the email suffix whitelist (with wildcards) unless domain quota mode is on', () => {
    const wl = normalizeWhitelist(['@company.com', '*.edu.cn'])
    const strict = { ...rules, emailSuffixWhitelist: wl }
    expect(validateRegisterFields({ ...ok, email: 'a@company.com' }, strict)).toEqual({})
    expect(validateRegisterFields({ ...ok, email: 'a@cs.pku.edu.cn' }, strict)).toEqual({})
    const blocked = validateRegisterFields({ ...ok, email: 'a@gmail.com' }, strict)
    expect(blocked.email).toBe('auth.emailSuffixNotAllowed')
    expect(blocked.emailSuffixNotAllowed).toBe(true)
    // 域名限量注册开启：前端不做白名单预检，交给后端
    expect(
      validateRegisterFields({ ...ok, email: 'a@gmail.com' }, { ...strict, emailDomainQuotaEnabled: true })
    ).toEqual({})
  })
})

describe('promoErrorKey', () => {
  it('maps backend error codes to locale keys', () => {
    expect(promoErrorKey('PROMO_CODE_NOT_FOUND')).toBe('auth.promoCodeNotFound')
    expect(promoErrorKey('PROMO_CODE_EXPIRED')).toBe('auth.promoCodeExpired')
    expect(promoErrorKey('PROMO_CODE_DISABLED')).toBe('auth.promoCodeDisabled')
    expect(promoErrorKey('PROMO_CODE_MAX_USED')).toBe('auth.promoCodeMaxUsed')
    expect(promoErrorKey('PROMO_CODE_ALREADY_USED')).toBe('auth.promoCodeAlreadyUsed')
    expect(promoErrorKey('SOMETHING_ELSE')).toBe('auth.promoCodeInvalid')
    expect(promoErrorKey()).toBe('auth.promoCodeInvalid')
  })
})
