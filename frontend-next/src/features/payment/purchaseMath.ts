/** 充值 / 订阅购买页的金额计算（纯函数，行为与 Vue 版 PaymentView 一致）。 */
import type { MethodLimit } from '@/types/payment'
import { DEFAULT_PAYMENT_CURRENCY } from './currency'

export function currencyFractionDigits(currency: string): number {
  try {
    return (
      new Intl.NumberFormat(undefined, { style: 'currency', currency }).resolvedOptions()
        .maximumFractionDigits ?? 2
    )
  } catch {
    return 2
  }
}

export function roundPaymentAmount(value: number, currency: string): number {
  if (!Number.isFinite(value)) return 0
  const factor = 10 ** currencyFractionDigits(currency)
  return Math.round(value * factor) / factor
}

export function ceilPaymentAmount(value: number, currency: string): number {
  if (!Number.isFinite(value)) return 0
  const factor = 10 ** currencyFractionDigits(currency)
  return Math.ceil(value * factor) / factor
}

/** 订阅价按 CNY 汇率换算（rate=0 或非 CNY 币种：价格直付）。 */
export function subscriptionPaymentAmount(price: number, currency: string, usdToCnyRate: number): number {
  if (usdToCnyRate <= 0 || currency !== DEFAULT_PAYMENT_CURRENCY) return roundPaymentAmount(price, currency)
  return roundPaymentAmount(price * usdToCnyRate, currency)
}

/** 金额是否落在某支付方式的 [min, max] 内；0 = 不限；金额 ≤ 0 视为合法。 */
export function amountFitsMethod(amount: number, limit: MethodLimit | undefined): boolean {
  if (amount <= 0) return true
  if (!limit) return false
  if (limit.single_min > 0 && amount < limit.single_min) return false
  if (limit.single_max > 0 && amount > limit.single_max) return false
  return true
}

/** 展示给用户的全局最小 / 最大金额：任一方式不限则不限，否则取最宽。 */
export function globalMinAmount(limits: MethodLimit[]): number {
  if (limits.length === 0) return 0
  if (limits.some((l) => l.single_min <= 0)) return 0
  return Math.min(...limits.map((l) => l.single_min))
}

export function globalMaxAmount(limits: MethodLimit[]): number {
  if (limits.length === 0) return 0
  if (limits.some((l) => l.single_max <= 0)) return 0
  return Math.max(...limits.map((l) => l.single_max))
}

/** 充值手续费（向上取整到分）与应付总额。 */
export function rechargeFee(payBase: number, feeRate: number): { fee: number; total: number } {
  const fee = feeRate > 0 && payBase > 0 ? Math.ceil(((payBase * feeRate) / 100) * 100) / 100 : 0
  const total = feeRate > 0 && payBase > 0 ? Math.round((payBase + fee) * 100) / 100 : payBase
  return { fee, total }
}

/** 订阅手续费与应付总额（按币种精度）。 */
export function subscriptionFee(
  paymentAmount: number,
  feeRate: number,
  currency: string
): { fee: number; total: number } {
  if (feeRate <= 0 || paymentAmount <= 0) return { fee: 0, total: paymentAmount }
  const fee = ceilPaymentAmount((paymentAmount * feeRate) / 100, currency)
  return { fee, total: roundPaymentAmount(paymentAmount + fee, currency) }
}
