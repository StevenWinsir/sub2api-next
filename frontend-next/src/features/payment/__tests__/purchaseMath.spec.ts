import { describe, expect, it } from 'vitest'
import type { MethodLimit } from '@/types/payment'
import {
  amountFitsMethod,
  ceilPaymentAmount,
  globalMaxAmount,
  globalMinAmount,
  rechargeFee,
  roundPaymentAmount,
  subscriptionFee,
  subscriptionPaymentAmount
} from '../purchaseMath'

const limit = (over: Partial<MethodLimit> = {}): MethodLimit => ({
  daily_limit: 0,
  daily_used: 0,
  daily_remaining: 0,
  single_min: 0,
  single_max: 0,
  fee_rate: 0,
  available: true,
  ...over
})

describe('amountFitsMethod', () => {
  it('treats 0 as unlimited and unknown methods as not fitting', () => {
    expect(amountFitsMethod(0, undefined)).toBe(true)
    expect(amountFitsMethod(10, undefined)).toBe(false)
    expect(amountFitsMethod(10, limit())).toBe(true)
    expect(amountFitsMethod(5, limit({ single_min: 10 }))).toBe(false)
    expect(amountFitsMethod(50, limit({ single_max: 20 }))).toBe(false)
    expect(amountFitsMethod(15, limit({ single_min: 10, single_max: 20 }))).toBe(true)
  })
})

describe('global range', () => {
  it('is unlimited if any method is unlimited, otherwise the widest range', () => {
    expect(globalMinAmount([])).toBe(0)
    expect(globalMinAmount([limit({ single_min: 5 }), limit()])).toBe(0)
    expect(globalMinAmount([limit({ single_min: 5 }), limit({ single_min: 2 })])).toBe(2)
    expect(globalMaxAmount([limit({ single_max: 100 }), limit({ single_max: 500 })])).toBe(500)
    expect(globalMaxAmount([limit({ single_max: 100 }), limit()])).toBe(0)
  })
})

describe('fees', () => {
  it('rounds recharge fee up to the cent', () => {
    expect(rechargeFee(100, 2.5)).toEqual({ fee: 2.5, total: 102.5 })
    expect(rechargeFee(33.33, 3)).toEqual({ fee: 1, total: 34.33 })
    expect(rechargeFee(100, 0)).toEqual({ fee: 0, total: 100 })
  })
  it('applies currency precision to subscription fees', () => {
    expect(subscriptionFee(99, 3, 'CNY')).toEqual({ fee: 2.97, total: 101.97 })
    expect(subscriptionFee(100, 0, 'CNY')).toEqual({ fee: 0, total: 100 })
    expect(subscriptionFee(0, 5, 'CNY')).toEqual({ fee: 0, total: 0 })
  })
  it('converts subscription price only for CNY with a configured rate', () => {
    expect(subscriptionPaymentAmount(10, 'CNY', 7.2)).toBe(72)
    expect(subscriptionPaymentAmount(10, 'CNY', 0)).toBe(10)
    expect(subscriptionPaymentAmount(10, 'USD', 7.2)).toBe(10)
  })
  it('rounds and ceils with currency digits', () => {
    expect(roundPaymentAmount(1.005 + 0.001, 'USD')).toBe(1.01)
    expect(ceilPaymentAmount(1.001, 'USD')).toBe(1.01)
    expect(ceilPaymentAmount(10.2, 'JPY')).toBe(11)
    expect(roundPaymentAmount(Number.NaN, 'USD')).toBe(0)
  })
})
