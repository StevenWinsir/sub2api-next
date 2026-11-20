import { describe, expect, it } from 'vitest'
import type { Account } from '@/types'
import {
  accountFormFields,
  accountTypeOptions,
  buildCreatePayload,
  buildUpdatePayload,
  type FormState
} from '../accountFormModel'
import { accountDisplayStatus } from '../accountStatus'
import { parseSSEChunk } from '../testStream'

const form = (over: Partial<FormState> = {}): FormState => ({
  name: 'acc',
  notes: '',
  platform: 'anthropic',
  type: 'apikey',
  baseUrl: '',
  apiKey: 'sk-1',
  credentialsJson: '',
  proxyId: '',
  concurrency: '10',
  loadFactor: '',
  priority: '1',
  rateMultiplier: '1',
  groupIds: [1],
  expiresAt: '',
  autoPauseOnExpired: false,
  schedulable: true,
  status: 'active',
  ...over
})

describe('account form field visibility (platform × type)', () => {
  it('matches the parity table', () => {
    const table = (['anthropic', 'openai', 'gemini', 'antigravity', 'grok', 'deepseek'] as const).flatMap(
      (p) => accountTypeOptions(p).map((type) => ({ p, type, ...accountFormFields(p, type, false) }))
    )
    expect(table).toMatchInlineSnapshot(`
      [
        {
          "apiKey": true,
          "baseUrl": true,
          "credentialsJson": false,
          "oauthFlow": false,
          "p": "anthropic",
          "type": "apikey",
        },
        {
          "apiKey": false,
          "baseUrl": false,
          "credentialsJson": false,
          "oauthFlow": true,
          "p": "anthropic",
          "type": "oauth",
        },
        {
          "apiKey": false,
          "baseUrl": false,
          "credentialsJson": false,
          "oauthFlow": true,
          "p": "anthropic",
          "type": "setup-token",
        },
        {
          "apiKey": false,
          "baseUrl": false,
          "credentialsJson": true,
          "oauthFlow": false,
          "p": "anthropic",
          "type": "bedrock",
        },
        {
          "apiKey": false,
          "baseUrl": false,
          "credentialsJson": true,
          "oauthFlow": false,
          "p": "openai",
          "type": "oauth",
        },
        {
          "apiKey": true,
          "baseUrl": true,
          "credentialsJson": false,
          "oauthFlow": false,
          "p": "openai",
          "type": "apikey",
        },
        {
          "apiKey": true,
          "baseUrl": true,
          "credentialsJson": false,
          "oauthFlow": false,
          "p": "openai",
          "type": "upstream",
        },
        {
          "apiKey": false,
          "baseUrl": false,
          "credentialsJson": true,
          "oauthFlow": false,
          "p": "gemini",
          "type": "oauth",
        },
        {
          "apiKey": true,
          "baseUrl": true,
          "credentialsJson": false,
          "oauthFlow": false,
          "p": "gemini",
          "type": "apikey",
        },
        {
          "apiKey": false,
          "baseUrl": false,
          "credentialsJson": true,
          "oauthFlow": false,
          "p": "gemini",
          "type": "service_account",
        },
        {
          "apiKey": false,
          "baseUrl": false,
          "credentialsJson": true,
          "oauthFlow": false,
          "p": "antigravity",
          "type": "oauth",
        },
        {
          "apiKey": true,
          "baseUrl": true,
          "credentialsJson": false,
          "oauthFlow": false,
          "p": "antigravity",
          "type": "upstream",
        },
        {
          "apiKey": false,
          "baseUrl": false,
          "credentialsJson": true,
          "oauthFlow": false,
          "p": "grok",
          "type": "oauth",
        },
        {
          "apiKey": true,
          "baseUrl": true,
          "credentialsJson": false,
          "oauthFlow": false,
          "p": "grok",
          "type": "apikey",
        },
        {
          "apiKey": true,
          "baseUrl": true,
          "credentialsJson": false,
          "oauthFlow": false,
          "p": "deepseek",
          "type": "apikey",
        },
      ]
    `)
  })
  it('hides the oauth flow when editing', () => {
    expect(accountFormFields('anthropic', 'oauth', true).oauthFlow).toBe(false)
  })
})

describe('buildCreatePayload', () => {
  it('requires a name and an api key for api-key accounts', () => {
    expect(buildCreatePayload(form({ name: ' ' }))).toEqual({ error: 'adminUi.accounts.nameRequired' })
    expect(buildCreatePayload(form({ apiKey: '' }))).toEqual({ error: 'admin.accounts.apiKeyIsRequired' })
  })
  it('builds credentials and converts expiry to unix seconds', () => {
    const r = buildCreatePayload(form({ baseUrl: ' https://x ', expiresAt: '2030-01-01T00:00' }))
    if ('error' in r) throw new Error(r.error)
    expect(r.payload.credentials).toEqual({ api_key: 'sk-1', base_url: 'https://x' })
    expect(typeof r.payload.expires_at).toBe('number')
    expect(r.payload.group_ids).toEqual([1])
  })
  it('requires a JSON object for json-credential types', () => {
    expect(buildCreatePayload(form({ type: 'bedrock', credentialsJson: '[1]' }))).toEqual({
      error: 'adminUi.accounts.credentialsJsonInvalid'
    })
    const r = buildCreatePayload(form({ type: 'bedrock', credentialsJson: '{"aws_region":"us-east-1"}' }))
    if ('error' in r) throw new Error(r.error)
    expect(r.payload.credentials).toEqual({ aws_region: 'us-east-1' })
  })
})

describe('buildUpdatePayload', () => {
  const account = {
    id: 1,
    type: 'apikey',
    platform: 'anthropic',
    credentials: { base_url: 'https://old', model_mapping: { a: 'b' } },
    credentials_status: { has_api_key: true }
  } as unknown as Account
  it('keeps existing credentials and secret when the key is left empty', () => {
    const r = buildUpdatePayload(account, form({ apiKey: '', baseUrl: 'https://new' }))
    if ('error' in r) throw new Error(r.error)
    expect(r.payload.credentials).toEqual({ base_url: 'https://new', model_mapping: { a: 'b' } })
  })
  it('overrides the key only when provided', () => {
    const r = buildUpdatePayload(account, form({ apiKey: 'sk-2', baseUrl: 'https://old' }))
    if ('error' in r) throw new Error(r.error)
    expect((r.payload.credentials as Record<string, unknown>).api_key).toBe('sk-2')
  })
  it('errors when there is no existing secret and none is provided', () => {
    const noKey = {
      ...account,
      credentials_status: { has_api_key: false },
      credentials: {}
    } as unknown as Account
    expect(buildUpdatePayload(noKey, form({ apiKey: '' }))).toEqual({
      error: 'admin.accounts.apiKeyIsRequired'
    })
  })
})

describe('accountDisplayStatus', () => {
  const base = {
    status: 'active',
    schedulable: true,
    rate_limit_reset_at: null,
    overload_until: null,
    temp_unschedulable_until: null
  } as unknown as Account
  const now = Date.parse('2030-01-01T00:00:00Z')
  it('prioritises error > inactive > rate limit > overload > temp > unschedulable', () => {
    expect(accountDisplayStatus({ ...base, status: 'error' }, now)).toBe('error')
    expect(accountDisplayStatus({ ...base, status: 'inactive' }, now)).toBe('inactive')
    expect(accountDisplayStatus({ ...base, rate_limit_reset_at: '2030-01-01T01:00:00Z' }, now)).toBe(
      'rate_limited'
    )
    expect(accountDisplayStatus({ ...base, overload_until: '2030-01-01T01:00:00Z' }, now)).toBe('overloaded')
    expect(accountDisplayStatus({ ...base, temp_unschedulable_until: '2030-01-01T01:00:00Z' }, now)).toBe(
      'temp_unschedulable'
    )
    expect(accountDisplayStatus({ ...base, schedulable: false }, now)).toBe('unschedulable')
    expect(accountDisplayStatus({ ...base, rate_limit_reset_at: '2029-01-01T00:00:00Z' }, now)).toBe('active')
  })
})

describe('parseSSEChunk', () => {
  it('returns complete events and keeps the partial tail', () => {
    const r = parseSSEChunk('data: {"type":"content","text":"a"}\n\ndata: {"type":"test_comp')
    expect(r.events).toEqual([{ type: 'content', text: 'a' }])
    expect(r.rest).toBe('data: {"type":"test_comp')
  })
  it('ignores malformed json and non-data lines', () => {
    const spy = (console.error = () => undefined)
    void spy
    expect(parseSSEChunk(': keep-alive\ndata: {bad\ndata: {"type":"error","error":"x"}\n').events).toEqual([
      { type: 'error', error: 'x' }
    ])
  })
})
