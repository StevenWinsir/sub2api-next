/** /payment/result：支付结果页（公开路由）。按恢复快照 / resume_token / order_id / out_trade_no 解析订单并轮询待支付状态。 */
import * as React from 'react'
import { useRouter } from 'next/router'
import { CheckCircle2, Loader2, XCircle } from 'lucide-react'
import { paymentAPI } from '@/api/payment'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { t } from '@/i18n'
import { getLocale } from '@/i18n'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth'
import { usePaymentStore } from '@/stores/payment'
import { currencySymbol, formatPaymentAmount, normalizePaymentCurrency } from './currency'
import { OrderStatusBadge } from './OrderStatusBadge'
import { PAYMENT_RECOVERY_STORAGE_KEY, clearPaymentRecoverySnapshot } from './paymentFlow'
import { normalizePaymentMethodForDisplay, paymentMethodI18nKey } from './paymentUx'
import {
  STATUS_REFRESH_INTERVAL_MS,
  STATUS_REFRESH_MAX_ATTEMPTS,
  displayOrderStatus,
  hasAmountFields,
  hasOrderId,
  hasPaymentType,
  isPendingStatus,
  isSuccessStatus,
  matchRecoverySnapshot,
  normalizeOrderStatus,
  orderBonusAmount,
  splitOrderAmount,
  type ResolvedOrder
} from './resultLogic'

interface ReturnInfo {
  outTradeNo: string
  money: string
  type: string
  tradeStatus: string
}

/** 仅接受带 status 的对象，异常响应（空 / 数组）按“未找到订单”处理。 */
const asOrder = (v: unknown): ResolvedOrder | null =>
  v && typeof v === 'object' && !Array.isArray(v) && 'status' in v ? (v as ResolvedOrder) : null

const methodText = (type: string) => {
  const key = paymentMethodI18nKey(type)
  const v = t(key)
  return v === key ? normalizePaymentMethodForDisplay(type) || type : v
}

function Line({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="tabular text-right font-medium">{children}</dd>
    </div>
  )
}

export function PaymentResultPage() {
  const router = useRouter()
  const [order, setOrder] = React.useState<ResolvedOrder | null>(null)
  const [returnInfo, setReturnInfo] = React.useState<ReturnInfo | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [currency, setCurrency] = React.useState('CNY')
  const refreshedUser = React.useRef(false)

  React.useEffect(() => {
    let disposed = false
    let timer: ReturnType<typeof setTimeout> | null = null
    const q = new URLSearchParams(window.location.search)
    const read = (k: string) => q.get(k) ?? ''
    const clearSnapshot = () =>
      clearPaymentRecoverySnapshot(window.localStorage, PAYMENT_RECOVERY_STORAGE_KEY)
    const clearIfTerminal = (status: string | null | undefined) => {
      if (status && !isPendingStatus(status)) clearSnapshot()
    }

    const apply = (next: ResolvedOrder | null) => {
      if (disposed) return
      setOrder(next)
      if (next && 'currency' in next && next.currency) setCurrency(normalizePaymentCurrency(next.currency))
      // 成功的充值订单：刷新一次用户余额（订单结果始终以订单为准）
      if (
        next &&
        !refreshedUser.current &&
        normalizeOrderStatus(next.status) === 'COMPLETED' &&
        (!('order_type' in next) || next.order_type === 'balance')
      ) {
        refreshedUser.current = true
        void useAuthStore
          .getState()
          .refreshUser()
          .catch(() => undefined)
      }
    }

    const resolveByResumeToken = async (token: string): Promise<ResolvedOrder | null> => {
      try {
        return asOrder((await paymentAPI.resolveOrderPublicByResumeToken(token)).data)
      } catch {
        return null
      }
    }
    const resolveByOutTradeNo = async (no: string): Promise<ResolvedOrder | null> => {
      try {
        return asOrder((await paymentAPI.verifyOrder(no)).data)
      } catch {
        try {
          return asOrder((await paymentAPI.verifyOrderPublic(no)).data)
        } catch {
          return null
        }
      }
    }

    const run = async () => {
      const resumeToken = read('resume_token')
      const routeOrderId = Number(read('order_id')) || 0
      let outTradeNo = read('out_trade_no')
      let orderId = 0
      let tokenLookupFailed = false
      let current: ResolvedOrder | null = null

      const restored = matchRecoverySnapshot(window.localStorage.getItem(PAYMENT_RECOVERY_STORAGE_KEY), {
        resumeToken,
        routeOrderId,
        routeOutTradeNo: outTradeNo
      })
      if (restored?.orderId) orderId = restored.orderId
      if (restored?.currency) setCurrency(normalizePaymentCurrency(restored.currency))
      if (!outTradeNo && restored?.outTradeNo) outTradeNo = restored.outTradeNo

      if (resumeToken) {
        const resolved = await resolveByResumeToken(resumeToken)
        if (resolved) {
          current = resolved
          apply(resolved)
          if (!orderId) orderId = hasOrderId(resolved) ? resolved.id : 0
        } else {
          tokenLookupFailed = true
          if (routeOrderId > 0) orderId = routeOrderId
        }
      } else if (routeOrderId > 0) {
        orderId = routeOrderId
      }

      const hasLegacyContext = read('trade_status').trim() !== ''
      const usePublicOutTradeNo = outTradeNo !== '' && (hasLegacyContext || routeOrderId > 0 || orderId > 0)

      if (!current && orderId && (!resumeToken || routeOrderId > 0)) {
        try {
          current = await usePaymentStore.getState().pollOrderStatus(orderId)
          apply(current)
        } catch {
          /* 下面尝试旧版回跳 */
        }
      }
      if (!current && usePublicOutTradeNo && (!resumeToken || tokenLookupFailed)) {
        const legacy = await resolveByOutTradeNo(outTradeNo)
        if (legacy) {
          current = legacy
          apply(legacy)
          if (!orderId) orderId = hasOrderId(legacy) ? legacy.id : 0
        }
      }
      if (!current && !orderId && outTradeNo && hasLegacyContext && !disposed) {
        setReturnInfo({
          outTradeNo,
          money: read('money'),
          type: read('type'),
          tradeStatus: read('trade_status')
        })
      }

      const refresh = async (): Promise<ResolvedOrder | null> => {
        if (resumeToken) {
          const r = await resolveByResumeToken(resumeToken)
          if (r) return r
        }
        if (orderId) {
          try {
            return await usePaymentStore.getState().pollOrderStatus(orderId)
          } catch {
            /* 回退到旧版公开校验 */
          }
        }
        return usePublicOutTradeNo ? resolveByOutTradeNo(outTradeNo) : null
      }

      let attempts = 0
      const schedule = (latest: ResolvedOrder | null) => {
        if (disposed || !latest || !isPendingStatus(latest.status) || attempts >= STATUS_REFRESH_MAX_ATTEMPTS)
          return
        timer = setTimeout(async () => {
          attempts += 1
          const next = await refresh()
          const effective = next ?? latest
          if (next) {
            apply(next)
            clearIfTerminal(next.status)
          }
          schedule(effective)
        }, STATUS_REFRESH_INTERVAL_MS)
      }

      if (current && isPendingStatus(current.status)) schedule(current)
      else if (current) clearIfTerminal(current.status)
      else if (!disposed && hasLegacyContext && outTradeNo) clearSnapshot()
      if (!disposed) setLoading(false)
    }
    void run()
    return () => {
      disposed = true
      if (timer) clearTimeout(timer)
    }
  }, [])

  const locale = getLocale()
  const fmt = (v: number) => formatPaymentAmount(v, currency, locale)
  const success = isSuccessStatus(order?.status)
  const pending = isPendingStatus(order?.status)
  const amounts = hasAmountFields(order) ? splitOrderAmount(order) : { base: 0, fee: 0 }
  const title = success
    ? t('payment.result.success')
    : pending
      ? t('payment.result.processing')
      : t('payment.result.failed')

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24" role="status" aria-label={t('common.loading')}>
        <Loader2 className="size-8 animate-spin text-primary" aria-hidden />
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-md space-y-6">
      <div className="text-center">
        <div
          className={cn(
            'mx-auto flex size-20 items-center justify-center rounded-full',
            success
              ? 'bg-success/15 text-success'
              : pending
                ? 'bg-warning/15 text-warning'
                : 'bg-destructive/15 text-destructive'
          )}
        >
          {success ? (
            <CheckCircle2 className="size-10" aria-hidden />
          ) : pending ? (
            <Loader2 className="size-10 animate-spin" aria-hidden />
          ) : (
            <XCircle className="size-10" aria-hidden />
          )}
        </div>
        <h1 className="mt-4 text-2xl font-semibold" role="status">
          {title}
        </h1>
        {pending ? (
          <p className="mt-2 text-sm text-muted-foreground">{t('payment.result.processingHint')}</p>
        ) : null}
      </div>

      {order ? (
        <Card className="p-5">
          <dl className="space-y-3 text-sm">
            {hasOrderId(order) ? <Line label={t('payment.orders.orderId')}>#{order.id}</Line> : null}
            {order.out_trade_no ? (
              <Line label={t('payment.orders.orderNo')}>{order.out_trade_no}</Line>
            ) : null}
            {hasAmountFields(order) ? (
              <Line label={t('payment.orders.baseAmount')}>{fmt(amounts.base)}</Line>
            ) : null}
            {hasAmountFields(order) && order.fee_rate > 0 ? (
              <Line label={`${t('payment.orders.fee')} (${order.fee_rate}%)`}>{fmt(amounts.fee)}</Line>
            ) : null}
            {hasAmountFields(order) ? (
              <Line label={t('payment.orders.payAmount')}>
                <span className="font-semibold text-primary">{fmt(order.pay_amount)}</span>
              </Line>
            ) : null}
            {hasAmountFields(order) && orderBonusAmount(order) > 0 ? (
              <Line label={t('payment.orders.bonusAmount')}>
                <span className="text-warning">
                  +{currencySymbol('USD')}
                  {orderBonusAmount(order).toFixed(2)}
                </span>
              </Line>
            ) : null}
            {hasAmountFields(order) && (order.amount !== order.pay_amount || orderBonusAmount(order) > 0) ? (
              <Line label={t('payment.orders.creditedAmount')}>
                {order.order_type === 'balance' ? `$${order.amount.toFixed(2)}` : fmt(order.amount)}
              </Line>
            ) : null}
            {hasPaymentType(order) ? (
              <Line label={t('payment.orders.paymentMethod')}>{methodText(order.payment_type)}</Line>
            ) : null}
            <Line label={t('payment.orders.status')}>
              <OrderStatusBadge status={displayOrderStatus(order.status)} />
            </Line>
          </dl>
        </Card>
      ) : returnInfo ? (
        <Card className="p-5">
          <dl className="space-y-3 text-sm">
            {returnInfo.outTradeNo ? (
              <Line label={t('payment.orders.orderId')}>{returnInfo.outTradeNo}</Line>
            ) : null}
            {returnInfo.money ? (
              <Line label={t('payment.orders.payAmount')}>{fmt(Number(returnInfo.money) || 0)}</Line>
            ) : null}
            {returnInfo.type ? (
              <Line label={t('payment.orders.paymentMethod')}>{methodText(returnInfo.type)}</Line>
            ) : null}
          </dl>
        </Card>
      ) : null}

      <div className="flex gap-3">
        <Button variant="outline" className="flex-1" onClick={() => void router.push('/purchase')}>
          {t('payment.result.backToRecharge')}
        </Button>
        <Button className="flex-1" onClick={() => void router.push('/orders')}>
          {t('payment.result.viewOrders')}
        </Button>
      </div>
    </div>
  )
}
