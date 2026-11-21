import { describe, expect, it } from 'vitest'
import { createPaymentRecoverySnapshot } from '../paymentFlow'
import { buildAirwallexSuccessUrl, matchAirwallexSnapshot } from '../AirwallexPaymentPage'
import { isTrustedInitMessage } from '../StripePopupPage'
import { normalizeRedirectPath, parseWechatPaymentCallback } from '../WeChatPaymentCallbackPage'

const ORIGIN = 'https://app.example.com'

describe('wechat payment callback', () => {
  it('normalizes the redirect path and rejects open redirects', () => {
    expect(normalizeRedirectPath('')).toBe('/purchase')
    expect(normalizeRedirectPath('https://evil.com')).toBe('/purchase')
    expect(normalizeRedirectPath('//evil.com')).toBe('/purchase')
    expect(normalizeRedirectPath('/payment')).toBe('/purchase')
    expect(normalizeRedirectPath('/payment?tab=subscription')).toBe('/purchase?tab=subscription')
    expect(normalizeRedirectPath('/purchase?plan_id=3')).toBe('/purchase?plan_id=3')
  })

  it('prefers the opaque resume token (fragment over query) and carries redirect query', () => {
    const r = parseWechatPaymentCallback(
      '?redirect=/purchase%3Ftab%3Dsubscription',
      '#wechat_resume_token=abc',
      ORIGIN,
      'missing'
    )
    expect(r).toEqual({
      pathname: '/purchase',
      query: { tab: 'subscription', wechat_resume: '1', wechat_resume_token: 'abc' }
    })
  })

  it('legacy openid flow passes payment context through', () => {
    const r = parseWechatPaymentCallback(
      '?openid=o1&payment_type=wxpay&amount=12&order_type=balance&state=s',
      '',
      ORIGIN,
      'missing'
    )
    expect(r.query).toMatchObject({
      wechat_resume: '1',
      openid: 'o1',
      payment_type: 'wxpay',
      amount: '12',
      order_type: 'balance',
      state: 's'
    })
  })

  it('reports errors and missing credentials', () => {
    expect(
      parseWechatPaymentCallback('?error=access_denied&error_description=nope', '', ORIGIN, 'missing').error
    ).toBe('nope')
    expect(parseWechatPaymentCallback('', '#errmsg=bad', ORIGIN, 'missing').error).toBe('bad')
    expect(parseWechatPaymentCallback('', '', ORIGIN, 'missing').error).toBe('missing')
  })
})

describe('stripe popup handshake', () => {
  const opener = {}
  const msg = (over: Partial<MessageEvent> = {}) =>
    ({
      origin: ORIGIN,
      source: opener as MessageEventSource,
      data: { type: 'STRIPE_POPUP_INIT' },
      ...over
    }) as MessageEvent
  it('only trusts same-origin INIT messages from the opener', () => {
    expect(isTrustedInitMessage(msg(), ORIGIN, opener)).toBe(true)
    expect(isTrustedInitMessage(msg({ origin: 'https://evil.com' }), ORIGIN, opener)).toBe(false)
    expect(isTrustedInitMessage(msg({ source: {} as MessageEventSource }), ORIGIN, opener)).toBe(false)
    expect(isTrustedInitMessage(msg({ data: { type: 'OTHER' } }), ORIGIN, opener)).toBe(false)
    expect(isTrustedInitMessage(msg(), ORIGIN, null)).toBe(false)
  })
})

describe('airwallex snapshot', () => {
  const snap = (over = {}) =>
    createPaymentRecoverySnapshot({
      orderId: 9,
      amount: 5,
      qrCode: '',
      expiresAt: new Date(Date.now() + 60000).toISOString(),
      paymentType: 'airwallex',
      payUrl: '',
      outTradeNo: 'T9',
      clientSecret: 's',
      intentId: 'i',
      currency: 'CNY',
      countryCode: 'CN',
      paymentEnv: 'demo',
      payAmount: 5,
      orderType: 'balance',
      paymentMode: '',
      resumeToken: 'rt',
      ...over
    })
  const raw = (s = snap()) => JSON.stringify(s)
  const p = { orderId: 9, outTradeNo: '', resumeToken: '' }
  it('requires a matching airwallex snapshot with intent and secret', () => {
    expect(matchAirwallexSnapshot(raw(), p)?.orderId).toBe(9)
    expect(matchAirwallexSnapshot(raw(snap({ paymentType: 'stripe' })), p)).toBeNull()
    expect(matchAirwallexSnapshot(raw(), { ...p, orderId: 10 })).toBeNull()
    expect(matchAirwallexSnapshot(raw(), { ...p, outTradeNo: 'zzz' })).toBeNull()
    expect(matchAirwallexSnapshot(raw(snap({ intentId: '' })), p)).toBeNull()
    expect(matchAirwallexSnapshot(null, p)).toBeNull()
  })
  it('builds the success url from params with snapshot fallbacks', () => {
    const url = new URL(
      buildAirwallexSuccessUrl(snap(), { orderId: 0, outTradeNo: '', resumeToken: '' }, ORIGIN)
    )
    expect(url.pathname).toBe('/payment/result')
    expect(url.searchParams.get('order_id')).toBe('9')
    expect(url.searchParams.get('out_trade_no')).toBe('T9')
    expect(url.searchParams.get('resume_token')).toBe('rt')
  })
})
