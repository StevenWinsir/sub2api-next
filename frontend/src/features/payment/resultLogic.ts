/** 支付结果页的纯逻辑（订单状态归一、金额拆分、恢复快照匹配）。 */
import type { PublicOrderVerifyResult } from '@/api/payment'
import type { OrderStatus, PaymentOrder } from '@/types/payment'
import { readPaymentRecoverySnapshot, type PaymentRecoverySnapshot } from './paymentFlow'

export type ResolvedOrder = PaymentOrder | PublicOrderVerifyResult

export const SUCCESS_STATUSES = new Set(['COMPLETED', 'PAID', 'RECHARGING'])
export const PENDING_STATUSES = new Set(['PENDING', 'CREATED', 'WAITING', 'PROCESSING'])
export const STATUS_REFRESH_INTERVAL_MS = 2000
export const STATUS_REFRESH_MAX_ATTEMPTS = 15

export const normalizeOrderStatus = (status: string | null | undefined): string =>
  String(status || '')
    .trim()
    .toUpperCase()
export const isSuccessStatus = (status: string | null | undefined): boolean =>
  SUCCESS_STATUSES.has(normalizeOrderStatus(status))
export const isPendingStatus = (status: string | null | undefined): boolean =>
  PENDING_STATUSES.has(normalizeOrderStatus(status))
export const displayOrderStatus = (status: string): OrderStatus => normalizeOrderStatus(status) as OrderStatus

export function hasOrderId(o: ResolvedOrder | null): o is PaymentOrder {
  return !!o && 'id' in o && typeof o.id === 'number'
}
export function hasAmountFields(o: ResolvedOrder | null): o is PaymentOrder {
  return (
    !!o &&
    'pay_amount' in o &&
    typeof o.pay_amount === 'number' &&
    'amount' in o &&
    typeof o.amount === 'number'
  )
}
export function hasPaymentType(o: ResolvedOrder | null): o is PaymentOrder {
  return !!o && 'payment_type' in o && typeof o.payment_type === 'string' && o.payment_type.trim() !== ''
}

/** 充值赠送额度（USD）；老接口 / 订阅订单没有该字段时视为 0。 */
export function orderBonusAmount(target: unknown): number {
  const v = (target as { bonus_amount?: unknown } | null | undefined)?.bonus_amount
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0
}

/** 充值金额 = pay_amount / (1 + fee_rate/100)；手续费 = pay_amount - 充值金额。 */
export function splitOrderAmount(order: Pick<PaymentOrder, 'pay_amount' | 'fee_rate'>): {
  base: number
  fee: number
} {
  const feeRate = Number(order.fee_rate) || 0
  if (feeRate <= 0) return { base: order.pay_amount ?? 0, fee: 0 }
  const base = Math.round((order.pay_amount / (1 + feeRate / 100)) * 100) / 100
  return { base, fee: Math.round((order.pay_amount - base) * 100) / 100 }
}

/**
 * 在恢复快照与地址栏参数之间做匹配：
 *  - 有 resume_token：必须与快照的 resumeToken 一致；
 *  - 否则至少要有 order_id 或 out_trade_no，并与快照一致。
 */
export function matchRecoverySnapshot(
  raw: string | null,
  ctx: { resumeToken: string; routeOrderId: number; routeOutTradeNo: string }
): PaymentRecoverySnapshot | null {
  if (!raw) return null
  if (ctx.resumeToken) return readPaymentRecoverySnapshot(raw, { resumeToken: ctx.resumeToken })
  if (!ctx.routeOrderId && !ctx.routeOutTradeNo) return null
  const restored = readPaymentRecoverySnapshot(raw)
  if (!restored) return null
  if (ctx.routeOrderId > 0 && restored.orderId !== ctx.routeOrderId) return null
  if (ctx.routeOutTradeNo && restored.outTradeNo !== ctx.routeOutTradeNo) return null
  return restored
}
