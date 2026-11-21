import { describe, expect, it } from 'vitest'
import { parseBatchInput, parseProxyUrl } from '../parseProxy'

describe('parseProxyUrl', () => {
  it('parses auth, ipv6 and protocol casing', () => {
    expect(parseProxyUrl('SOCKS5://u:p@10.0.0.1:1080')).toEqual({
      protocol: 'socks5',
      host: '10.0.0.1',
      port: 1080,
      username: 'u',
      password: 'p'
    })
    expect(parseProxyUrl('http://[::1]:8080')?.host).toBe('::1')
  })
  it('rejects malformed lines and out-of-range ports', () => {
    expect(parseProxyUrl('ftp://a:1')).toBeNull()
    expect(parseProxyUrl('http://host:70000')).toBeNull()
    expect(parseProxyUrl('http://host')).toBeNull()
    expect(parseProxyUrl('')).toBeNull()
  })
})

describe('parseBatchInput', () => {
  it('counts valid, invalid and duplicate lines', () => {
    const r = parseBatchInput('http://a:1\nhttp://a:1\nbad\n\nsocks5://b:2')
    expect(r.proxies).toHaveLength(2)
    expect(r.duplicate).toBe(1)
    expect(r.invalid).toBe(1)
  })
})
