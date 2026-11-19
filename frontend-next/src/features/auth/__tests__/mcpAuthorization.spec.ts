import { describe, expect, it } from 'vitest'
import { parseMcpAuthorization, validateMcpPreview } from '../mcpAuthorization'

const t = (k: string) => k
const challenge = 'A'.repeat(43)
const base = {
  response_type: 'code',
  client_id: 'c1',
  redirect_uri: 'https://client.example/cb',
  code_challenge: challenge,
  code_challenge_method: 'S256',
  resource: 'https://mcp.example/mcp'
}
const q = (o: Record<string, string>) => new URLSearchParams(o)

describe('parseMcpAuthorization', () => {
  it('accepts a complete PKCE request, with optional scope and state', () => {
    expect(parseMcpAuthorization(q(base), t)).toEqual(base)
    expect(parseMcpAuthorization(q({ ...base, scope: 'mcp', state: 's' }), t)).toMatchObject({
      scope: 'mcp',
      state: 's'
    })
    expect(parseMcpAuthorization(q({ ...base, scope: '' }), t)).toBeTruthy()
  })

  it.each([
    ['missing client_id', { ...base, client_id: '' }],
    ['wrong response_type', { ...base, response_type: 'token' }],
    ['plain PKCE', { ...base, code_challenge_method: 'plain' }],
    ['short challenge', { ...base, code_challenge: 'abc' }],
    ['unknown scope', { ...base, scope: 'admin' }],
    ['unexpected parameter', { ...base, extra: '1' }],
    ['oversized value', { ...base, state: 'x'.repeat(4097) }]
  ])('rejects %s', (_name, params) => {
    expect(() => parseMcpAuthorization(q(params), t)).toThrow('mcp.invalidRequest')
  })

  it('rejects duplicated parameters (parameter pollution)', () => {
    const dup = new URLSearchParams(base)
    dup.append('client_id', 'other')
    expect(() => parseMcpAuthorization(dup, t)).toThrow('mcp.invalidRequest')
  })
})

describe('validateMcpPreview', () => {
  const request = parseMcpAuthorization(q(base), t)
  const preview = {
    client_id: 'c1',
    client_name: 'App',
    redirect_uri: base.redirect_uri,
    resource: base.resource,
    scope: 'mcp' as const
  }

  it('accepts a preview that matches the request', () => {
    expect(() => validateMcpPreview(preview, request, t)).not.toThrow()
  })

  it.each([
    ['client mismatch', { client_id: 'other' }],
    ['redirect mismatch', { redirect_uri: 'https://evil.example/cb' }],
    ['resource mismatch', { resource: 'https://other.example/mcp' }],
    ['wrong scope', { scope: 'user' as unknown as 'mcp' }]
  ])('rejects %s', (_name, patch) => {
    expect(() => validateMcpPreview({ ...preview, ...patch }, request, t)).toThrow('mcp.invalidRequest')
  })

  it('rejects non-http(s) redirect schemes even when the request agrees', () => {
    const uri = 'javascript:alert(1)'
    expect(() =>
      validateMcpPreview({ ...preview, redirect_uri: uri }, { ...request, redirect_uri: uri }, t)
    ).toThrow('mcp.invalidRequest')
  })

  it('rejects redirect URIs with credentials or fragments', () => {
    for (const uri of ['https://u:p@client.example/cb', 'https://client.example/cb#frag']) {
      expect(() =>
        validateMcpPreview({ ...preview, redirect_uri: uri }, { ...request, redirect_uri: uri }, t)
      ).toThrow()
    }
  })
})
