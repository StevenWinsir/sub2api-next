import { describe, expect, it } from 'vitest'
import { resolveNavTarget, sanitizeRedirect } from '../safeNavigation'

describe('sanitizeRedirect (open redirect protection)', () => {
  it('accepts in-site relative paths', () => {
    expect(sanitizeRedirect('/keys?page=2#x')).toBe('/keys?page=2#x')
    expect(sanitizeRedirect('/admin/users')).toBe('/admin/users')
  })
  it('rejects everything else', () => {
    const fallback = '/dashboard'
    for (const bad of [
      '//evil.com',
      'https://evil.com',
      'javascript:alert(1)',
      '/\\evil.com',
      '/\t/evil.com',
      '/\n/evil.com',
      'evil.com',
      '',
      null,
      undefined,
      42
    ]) {
      expect(sanitizeRedirect(bad, fallback), String(bad)).toBe(fallback)
    }
  })
})

describe('resolveNavTarget', () => {
  it('classifies internal known / unknown paths', () => {
    expect(resolveNavTarget('/keys')).toEqual({ kind: 'internal', href: '/keys', known: true })
    expect(resolveNavTarget('/nope')).toEqual({ kind: 'internal', href: '/nope', known: false })
  })
  it('treats same-origin absolute URLs as internal and others as external', () => {
    expect(resolveNavTarget('https://a.com/keys?x=1', 'https://a.com')).toEqual({
      kind: 'internal',
      href: '/keys?x=1',
      known: true
    })
    expect(resolveNavTarget('https://b.com/x', 'https://a.com')).toEqual({
      kind: 'external',
      href: 'https://b.com/x'
    })
  })
  it('rejects dangerous schemes and protocol-relative links', () => {
    expect(resolveNavTarget('javascript:alert(1)')).toEqual({ kind: 'invalid' })
    expect(resolveNavTarget('data:text/html,hi')).toEqual({ kind: 'invalid' })
    expect(resolveNavTarget('')).toEqual({ kind: 'invalid' })
  })
})
