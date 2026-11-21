import { describe, expect, it } from 'vitest'
import { createPaymentRecoverySnapshot, writePaymentRecoverySnapshot } from '../paymentFlow'
import {
  isPendingStatus,
  isSuccessStatus,
  matchRecoverySnapshot,
  orderBonusAmount,
  splitOrderAmount
} from '../resultLogic'

const snapshot = (over = {}) =>
  createPaymentRecoverySnapshot(
    {
      orderId: 7,
      amount: 10,
      qrCode: '',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      paymentType: 'alipay',
      payUrl: '',
      outTradeNo: 'T1',
      clientSecret: '',
      intentId: '',
      currency: 'CNY',
      countryCode: '',
      paymentEnv: '',
      payAmount: 10,
      orderType: 'balance',
      paymentMode: '',
      resumeToken: 'tok',
      ...over
    },
    Date.now()
  )
const raw = (s = snapshot()) => {
  let out = ''
  writePaymentRecoverySnapshot({ setItem: (_k, v) => (out = v), removeItem: () => {} }, s)
  return out
}

describe('status helpers', () => {
  it('normalizes case and whitespace', () => {
    expect(isSuccessStatus(' completed ')).toBe(true)
    expect(isSuccessStatus('FAILED')).toBe(false)
    expect(isPendingStatus('processing')).toBe(true)
    expect(isPendingStatus(undefined)).toBe(false)
  })
})

describe('amount helpers', () => {
  it('splits base amount and fee', () => {
    expect(splitOrderAmount({ pay_amount: 103, fee_rate: 3 })).toEqual({ base: 100, fee: 3 })
    expect(splitOrderAmount({ pay_amount: 50, fee_rate: 0 })).toEqual({ base: 50, fee: 0 })
  })
  it('reads the bonus defensively', () => {
    expect(orderBonusAmount({ bonus_amount: 2.5 })).toBe(2.5)
    expect(orderBonusAmount({ bonus_amount: -1 })).toBe(0)
    expect(orderBonusAmount(null)).toBe(0)
  })
})

describe('matchRecoverySnapshot', () => {
  it('requires a matching resume token when one is given', () => {
    expect(
      matchRecoverySnapshot(raw(), { resumeToken: 'tok', routeOrderId: 0, routeOutTradeNo: '' })?.orderId
    ).toBe(7)
    expect(
      matchRecoverySnapshot(raw(), { resumeToken: 'other', routeOrderId: 0, routeOutTradeNo: '' })
    ).toBeNull()
  })
  it('falls back to order id / out_trade_no and never matches with neither', () => {
    expect(
      matchRecoverySnapshot(raw(), { resumeToken: '', routeOrderId: 7, routeOutTradeNo: '' })?.orderId
    ).toBe(7)
    expect(matchRecoverySnapshot(raw(), { resumeToken: '', routeOrderId: 8, routeOutTradeNo: '' })).toBeNull()
    expect(
      matchRecoverySnapshot(raw(), { resumeToken: '', routeOrderId: 0, routeOutTradeNo: 'X' })
    ).toBeNull()
    expect(matchRecoverySnapshot(raw(), { resumeToken: '', routeOrderId: 0, routeOutTradeNo: '' })).toBeNull()
    expect(
      matchRecoverySnapshot(null, { resumeToken: 'tok', routeOrderId: 0, routeOutTradeNo: '' })
    ).toBeNull()
  })
  it('ignores expired snapshots', () => {
    expect(
      matchRecoverySnapshot(raw(snapshot({ expiresAt: new Date(Date.now() - 1000).toISOString() })), {
        resumeToken: 'tok',
        routeOrderId: 0,
        routeOutTradeNo: ''
      })
    ).toBeNull()
  })
})
