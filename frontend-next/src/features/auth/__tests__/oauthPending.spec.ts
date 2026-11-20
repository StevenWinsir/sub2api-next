import { describe, expect, it } from 'vitest'
import {
  extractPendingAccountEmail,
  isCreateAccountRecoveryError,
  isTotpChallenge,
  parseFragmentParams,
  readLegacyFragmentLogin,
  requiresEmailCompletion,
  resolvePendingAccountAction,
  sanitizeOAuthRedirect,
  serializeAdoptionDecision
} from '../oauth/pending'

describe('fragment parsing', () => {
  it('accepts hashes with or without the # prefix', () => {
    expect(parseFragmentParams('#a=1&b=2').get('b')).toBe('2')
    expect(parseFragmentParams('a=1').get('a')).toBe('1')
    expect(parseFragmentParams('').get('a')).toBeNull()
  })

  it('reads the legacy token fragment', () => {
    const params = parseFragmentParams(
      '#access_token=%20tok%20&refresh_token=r1&expires_in=3600&token_type=Bearer'
    )
    expect(readLegacyFragmentLogin(params)).toEqual({
      access_token: 'tok',
      refresh_token: 'r1',
      expires_in: 3600,
      token_type: 'Bearer'
    })
  })

  it('ignores invalid optional fields and returns null without an access token', () => {
    expect(
      readLegacyFragmentLogin(parseFragmentParams('#access_token=t&expires_in=abc&refresh_token='))
    ).toEqual({
      access_token: 't'
    })
    expect(readLegacyFragmentLogin(parseFragmentParams('#expires_in=10&refresh_token=r'))).toBeNull()
    expect(readLegacyFragmentLogin(parseFragmentParams('#access_token=%20%20'))).toBeNull()
    expect(readLegacyFragmentLogin(parseFragmentParams('#access_token=t&expires_in=-5'))).toEqual({
      access_token: 't'
    })
  })
})

describe('sanitizeOAuthRedirect', () => {
  it.each([
    ['/keys', '/keys'],
    ['/admin/users?page=2', '/admin/users?page=2'],
    [undefined, '/dashboard'],
    ['', '/dashboard'],
    ['keys', '/dashboard'],
    ['//evil.com', '/dashboard'],
    ['/\\evil.com', '/dashboard'],
    ['/go?u=https://evil.com', '/dashboard'],
    ['/a\nb', '/dashboard']
  ])('%s -> %s', (input, expected) => {
    expect(sanitizeOAuthRedirect(input)).toBe(expected)
  })
})

describe('pending account state machine', () => {
  it.each([
    [{ step: 'choice' }, 'choose_account_action'],
    [{ step: 'choose_account_action_required' }, 'choose_account_action'],
    [{ status: 'choose' }, 'choose_account_action'],
    [{ step: 'email_required' }, 'create_account'],
    [{ error: 'create_account_required' }, 'create_account'],
    [{ intent: 'bind_login' }, 'bind_login'],
    [{ state: 'adopt_existing_user_by_email' }, 'bind_login'],
    [{ step: ' EXISTING_ACCOUNT ' }, 'bind_login'],
    [{ error: 'invitation_required' }, 'none'],
    [{}, 'none']
  ])('%j -> %s', (input, expected) => {
    expect(resolvePendingAccountAction(input)).toBe(expected)
  })

  it('prefers step over status over error over intent', () => {
    expect(resolvePendingAccountAction({ step: 'choice', error: 'bind_login' })).toBe('choose_account_action')
    expect(resolvePendingAccountAction({ error: 'create_account', intent: 'bind_login' })).toBe(
      'create_account'
    )
  })

  it('picks the most specific email', () => {
    expect(extractPendingAccountEmail({ pending_email: ' a@x.com ', email: 'b@x.com' })).toBe('a@x.com')
    expect(extractPendingAccountEmail({ email: 'b@x.com', suggested_email: 'c@x.com' })).toBe('b@x.com')
    expect(extractPendingAccountEmail({ suggested_email: 'c@x.com' }, 'resume@x.com')).toBe('resume@x.com')
    expect(extractPendingAccountEmail({})).toBe('')
  })

  it('detects create-account recovery errors from any response field', () => {
    const err = (data: object) => ({ response: { data } })
    expect(isCreateAccountRecoveryError(err({ reason: 'EMAIL_EXISTS' }))).toBe(true)
    expect(isCreateAccountRecoveryError(err({ code: 'bind_login_required' }))).toBe(true)
    expect(isCreateAccountRecoveryError(err({ step: 'adopt_existing_user_by_email' }))).toBe(true)
    expect(isCreateAccountRecoveryError(err({ reason: 'other' }))).toBe(false)
    expect(isCreateAccountRecoveryError(new Error('x'))).toBe(false)
  })

  it('detects DingTalk email completion and TOTP challenges', () => {
    expect(requiresEmailCompletion({ step: 'email_completion' })).toBe(true)
    expect(requiresEmailCompletion({ requires_email_completion: true })).toBe(true)
    expect(requiresEmailCompletion({ step: 'choice' })).toBe(false)
    expect(isTotpChallenge({ requires_2fa: true, temp_token: 't' })).toBe(true)
    expect(isTotpChallenge({ requires_2fa: true })).toBe(false)
  })

  it('serializes only boolean adoption flags', () => {
    expect(serializeAdoptionDecision({ adoptDisplayName: true, adoptAvatar: false })).toEqual({
      adopt_display_name: true,
      adopt_avatar: false
    })
    expect(serializeAdoptionDecision({})).toEqual({})
  })
})
