import { describe, expect, it } from 'vitest'
import type { User, UserAuthProvider } from '@/types'
import {
  bindingDetails,
  displayableEmail,
  isBound,
  normalizeProvider,
  resolveThirdPartySource
} from '../bindings'

const u = (over: Partial<User>): User => ({ id: 1, username: 'a', email: 'a@x.com', ...over }) as User
const labels = {
  email: 'E',
  linuxdo: 'L',
  dingtalk: 'D',
  oidc: 'O',
  wechat: 'W',
  github: 'G',
  google: 'Go'
} as Record<UserAuthProvider, string>

describe('binding status', () => {
  it('prefers direct flags, then nested status objects', () => {
    expect(isBound(u({ email_bound: true }), 'email')).toBe(true)
    expect(isBound(u({ linuxdo_bound: false, auth_bindings: { linuxdo: true } }), 'linuxdo')).toBe(false)
    expect(isBound(u({ auth_bindings: { wechat: { bound: true } } }), 'wechat')).toBe(true)
    expect(isBound(u({ identity_bindings: { oidc: { provider_subject: 'x' } } }), 'oidc')).toBe(true)
    expect(isBound(u({}), 'dingtalk')).toBe(false)
  })
  it('exposes detail objects only', () => {
    expect(bindingDetails(u({ auth_bindings: { oidc: true } }), 'oidc')).toBeNull()
    expect(
      bindingDetails(u({ auth_bindings: { oidc: { bound: true, can_unbind: true } } }), 'oidc')?.can_unbind
    ).toBe(true)
  })
  it('hides placeholder .invalid emails unless bound', () => {
    expect(displayableEmail(u({ email: 'x@y.invalid' }))).toBe('')
    expect(displayableEmail(u({ email: 'x@y.invalid', email_bound: true }))).toBe('x@y.invalid')
    expect(displayableEmail(u({ email: ' a@b.c ' }))).toBe('a@b.c')
  })
})

describe('profile sources', () => {
  it('normalizes provider ids', () => {
    expect(normalizeProvider(' LinuxDo ')).toBe('linuxdo')
    expect(normalizeProvider('oidc:acme')).toBe('oidc')
    expect(normalizeProvider('unknown')).toBeNull()
  })
  it('ignores email sources and resolves labels', () => {
    expect(resolveThirdPartySource('email', labels)).toBeNull()
    expect(resolveThirdPartySource('wechat', labels)).toEqual({ provider: 'wechat', label: 'W' })
    expect(resolveThirdPartySource({ provider: 'oidc', provider_label: 'Acme' }, labels)).toEqual({
      provider: 'oidc',
      label: 'Acme'
    })
    expect(resolveThirdPartySource(null, labels)).toBeNull()
  })
})
