/**
 * 支付进行中面板（对应 components/payment/PaymentStatusPanel.vue）：
 * 二维码 / 支付宝 deeplink / 新窗口支付 + 倒计时 + 3 秒状态轮询（带防重入与待支付二次确认）+ 取消 / 成功 / 过期。
 * 轮询与倒计时由 ref 持有，卸载时清理，StrictMode 下幂等。
 */
import * as React from 'react'
import { CheckCircle2, Clock, ExternalLink, Loader2, XCircle } from 'lucide-react'
import { paymentAPI } from '@/api/payment'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { t } from '@/i18n'
import { getLocale } from '@/i18n'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/stores/app'
import { usePaymentStore } from '@/stores/payment'
import type { PaymentOrder } from '@/types/payment'
import { extractI18nErrorMessage } from '@/utils/apiError'
import {
  createAlipayDeepLinkLauncher,
  type AlipayDeepLinkLauncher,
  type AlipayDeepLinkState
} from './alipayDeepLink'
import { currencySymbol, formatPaymentAmount, normalizePaymentCurrency } from './currency'
import { getPaymentPopupFeatures, isBuiltInAlipayMethod, isBuiltInWxpayMethod } from './providerConfig'

export type PaymentOutcome = 'success' | 'cancelled' | 'expired'

const VERIFY_RETRY_INTERVAL_MS = 15000
const VERIFY_RETRY_MAX_ATTEMPTS = 6
const POLL_INTERVAL_MS = 3000

export const isSuccessStatus = (status: string | null | undefined): boolean =>
  status === 'COMPLETED' || status === 'PAID' || status === 'RECHARGING'

export function formatCountdown(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
}

export interface PaymentStatusPanelProps {
  orderId: number
  amount?: number
  payAmount?: number
  qrCode: string
  expiresAt: string
  paymentType: string
  payUrl?: string
  orderType?: string
  currency?: string
  outTradeNo?: string
  mobileAlipayDeepLink?: boolean
  onDone: () => void
  onSuccess: () => void
  onSettled?: (outcome: PaymentOutcome) => void
}

function Terminal({
  tone,
  icon,
  title,
  desc,
  children
}: {
  tone: 'success' | 'warning' | 'destructive'
  icon: React.ReactNode
  title: string
  desc?: string
  children?: React.ReactNode
}) {
  return (
    <Card className="flex flex-col items-center gap-3 p-8 text-center">
      <div
        className={cn(
          'flex size-14 items-center justify-center rounded-full',
          tone === 'success'
            ? 'bg-success/15 text-success'
            : tone === 'warning'
              ? 'bg-warning/15 text-warning'
              : 'bg-destructive/15 text-destructive'
        )}
      >
        {icon}
      </div>
      <p className="text-lg font-semibold">{title}</p>
      {desc ? <p className="text-sm text-muted-foreground">{desc}</p> : null}
      {children}
    </Card>
  )
}

export function PaymentStatusPanel(props: PaymentStatusPanelProps) {
  const { orderId, qrCode, expiresAt, paymentType, payUrl, orderType, outTradeNo, mobileAlipayDeepLink } =
    props
  const showError = useAppStore((s) => s.showError)
  const [remaining, setRemaining] = React.useState(0)
  const [cancelling, setCancelling] = React.useState(false)
  const [paidOrder, setPaidOrder] = React.useState<PaymentOrder | null>(null)
  const [outcome, setOutcomeState] = React.useState<PaymentOutcome | null>(null)
  const [deepLinkState, setDeepLinkState] = React.useState<AlipayDeepLinkState>('idle')
  const [fallbackVisible, setFallbackVisible] = React.useState(false)
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null)
  const propsRef = React.useRef(props)
  const outcomeRef = React.useRef<PaymentOutcome | null>(null)
  const launcherRef = React.useRef<AlipayDeepLinkLauncher | null>(null)
  const verify = React.useRef({ attempts: 0, last: 0 })
  const inFlight = React.useRef(false)
  const pollTimer = React.useRef<ReturnType<typeof setInterval> | null>(null)
  const countdownTimer = React.useRef<ReturnType<typeof setInterval> | null>(null)

  React.useEffect(() => {
    propsRef.current = props
  })

  const currency = normalizePaymentCurrency(props.currency)
  const isAlipay = isBuiltInAlipayMethod(paymentType)
  const isWxpay = isBuiltInWxpayMethod(paymentType)
  const isMobileAlipayDeepLink = mobileAlipayDeepLink === true && isAlipay && !!qrCode
  const showQR = !!qrCode && (!isMobileAlipayDeepLink || fallbackVisible)
  const locale = getLocale()
  const fmt = (v: number) => formatPaymentAmount(v, currency, locale)

  const cleanup = React.useCallback(() => {
    if (pollTimer.current) clearInterval(pollTimer.current)
    if (countdownTimer.current) clearInterval(countdownTimer.current)
    pollTimer.current = null
    countdownTimer.current = null
    launcherRef.current?.dispose()
    launcherRef.current = null
  }, [])

  const settle = React.useCallback((next: PaymentOutcome) => {
    if (outcomeRef.current === next) return
    outcomeRef.current = next
    setOutcomeState(next)
    propsRef.current.onSettled?.(next)
  }, [])

  // 二维码渲染（qrcode 动态加载，不进首屏包）
  React.useEffect(() => {
    if (!showQR || !canvasRef.current || !qrCode) return
    let cancelled = false
    void import('qrcode').then(({ default: QRCode }) => {
      if (cancelled || !canvasRef.current) return
      void QRCode.toCanvas(canvasRef.current, qrCode, { width: 220, margin: 2, errorCorrectionLevel: 'M' })
    })
    return () => {
      cancelled = true
    }
  }, [showQR, qrCode, outcome])

  // 倒计时 + 轮询：仅在订单变化时重建
  React.useEffect(() => {
    outcomeRef.current = null
    verify.current = { attempts: 0, last: 0 }
    let seconds = 30 * 60
    if (expiresAt) seconds = Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000)
    const total = Math.max(0, seconds)
    const deadline = Date.now() + total * 1000
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 订单变化时初始化倒计时显示
    setRemaining(total)
    if (total <= 0) {
      settle('expired')
      return
    }
    countdownTimer.current = setInterval(() => {
      const left = Math.max(0, Math.floor((deadline - Date.now()) / 1000))
      setRemaining(left)
      if (left <= 0) {
        settle('expired')
        cleanup()
      }
    }, 1000)

    const recoverPending = async (order: PaymentOrder): Promise<PaymentOrder> => {
      if (!isWxpay && !isAlipay) return order
      const outNo = String(order.out_trade_no || '').trim()
      if (
        !outNo ||
        String(order.status || '')
          .trim()
          .toUpperCase() !== 'PENDING'
      )
        return order
      const now = Date.now()
      if (
        verify.current.attempts >= VERIFY_RETRY_MAX_ATTEMPTS ||
        now - verify.current.last < VERIFY_RETRY_INTERVAL_MS
      )
        return order
      verify.current.last = now
      verify.current.attempts += 1
      try {
        return (await paymentAPI.verifyOrder(outNo)).data ?? order
      } catch {
        return order
      }
    }

    const poll = async () => {
      if (!orderId || outcomeRef.current) return
      // 防重入：接口（含二次确认）慢于轮询间隔时避免并发请求重叠
      if (inFlight.current) return
      inFlight.current = true
      try {
        let order = await usePaymentStore.getState().pollOrderStatus(orderId)
        if (!order || outcomeRef.current) return
        order = await recoverPending(order)
        if (outcomeRef.current) return
        if (isSuccessStatus(order.status)) {
          cleanup()
          setPaidOrder(order)
          settle('success')
          propsRef.current.onSuccess()
        } else if (order.status === 'CANCELLED') {
          cleanup()
          settle('cancelled')
        } else if (order.status === 'EXPIRED' || order.status === 'FAILED') {
          cleanup()
          settle('expired')
        }
      } finally {
        inFlight.current = false
      }
    }
    pollTimer.current = setInterval(() => void poll(), POLL_INTERVAL_MS)
    return cleanup
  }, [orderId, expiresAt, isAlipay, isWxpay, cleanup, settle])

  // 移动端支付宝：拉起 App，失败再回退二维码
  React.useEffect(() => {
    if (!isMobileAlipayDeepLink) return
    const launcher = createAlipayDeepLinkLauncher({
      qrCode,
      document,
      lifecycleTarget: window,
      userAgent: window.navigator.userAgent,
      assignLocation: (url) => window.location.assign(url),
      onStateChange: (state) => {
        setDeepLinkState(state)
        if (state === 'fallback') setFallbackVisible(true)
        else if (state === 'backgrounded') setFallbackVisible(false)
      }
    })
    launcherRef.current = launcher
    launcher.launch()
    return () => {
      launcher.dispose()
      if (launcherRef.current === launcher) launcherRef.current = null
    }
  }, [isMobileAlipayDeepLink, qrCode])

  const reopenPopup = () => {
    if (!payUrl) return
    const win = window.open(payUrl, 'paymentPopup', getPaymentPopupFeatures())
    if (!win || win.closed) window.location.href = payUrl
  }

  const handleCancel = async () => {
    if (!orderId || cancelling) return
    setCancelling(true)
    try {
      await paymentAPI.cancelOrder(orderId)
      cleanup()
      settle('cancelled')
    } catch (err) {
      showError(extractI18nErrorMessage(err, t, 'payment.errors', t('common.error')))
    } finally {
      setCancelling(false)
    }
  }

  const done = () => {
    cleanup()
    props.onDone()
  }

  const saveQRCode = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const a = document.createElement('a')
    a.href = canvas.toDataURL('image/png')
    a.download = `alipay-${outTradeNo || orderId}.png`
    document.body.appendChild(a)
    a.click()
    a.remove()
  }

  const payText = fmt(props.payAmount || props.amount || 0)
  const orderNo = outTradeNo || `#${orderId}`
  const countdown = (
    <div className="text-center">
      <p className="text-sm text-muted-foreground">{t('payment.qr.expiresIn')}</p>
      <p className="tabular text-2xl font-semibold" role="timer" aria-live="off">
        {formatCountdown(remaining)}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{t('payment.qr.waitingPayment')}</p>
    </div>
  )
  const cancelBtn = (
    <Button variant="outline" className="w-full" disabled={cancelling} onClick={() => void handleCancel()}>
      {cancelling ? t('common.processing') : t('payment.qr.cancelOrder')}
    </Button>
  )

  if (outcome === 'success') {
    return (
      <Terminal
        tone="success"
        icon={<CheckCircle2 className="size-8" aria-hidden />}
        title={
          orderType === 'subscription' ? t('payment.result.subscriptionSuccess') : t('payment.result.success')
        }
      >
        {paidOrder ? (
          <dl className="w-full space-y-2 rounded-lg bg-muted p-4 text-left text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">{t('payment.orders.orderId')}</dt>
              <dd className="tabular">#{paidOrder.id}</dd>
            </div>
            {paidOrder.out_trade_no ? (
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">{t('payment.orders.orderNo')}</dt>
                <dd className="tabular break-all">{paidOrder.out_trade_no}</dd>
              </div>
            ) : null}
            <div className="flex justify-between">
              <dt className="text-muted-foreground">{t('payment.orders.amount')}</dt>
              <dd className="tabular">
                {currencySymbol('USD')}
                {paidOrder.amount.toFixed(2)}
                {(paidOrder.bonus_amount ?? 0) > 0 ? (
                  <span className="ml-1 text-xs text-warning">
                    (
                    {t('payment.orders.bonusIncluded', {
                      amount: currencySymbol('USD') + (paidOrder.bonus_amount ?? 0).toFixed(2)
                    })}
                    )
                  </span>
                ) : null}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">{t('payment.orders.payAmount')}</dt>
              <dd className="tabular">{fmt(paidOrder.pay_amount)}</dd>
            </div>
          </dl>
        ) : null}
        <Button onClick={done}>{t('common.confirm')}</Button>
      </Terminal>
    )
  }
  if (outcome === 'cancelled') {
    return (
      <Terminal
        tone="warning"
        icon={<XCircle className="size-8" aria-hidden />}
        title={t('payment.qr.cancelled')}
        desc={t('payment.qr.cancelledDesc')}
      >
        <Button onClick={done}>{t('common.confirm')}</Button>
      </Terminal>
    )
  }
  if (outcome === 'expired') {
    return (
      <Terminal
        tone="destructive"
        icon={<Clock className="size-8" aria-hidden />}
        title={t('payment.qr.expired')}
        desc={t('payment.qr.expiredDesc')}
      >
        <Button onClick={done}>{t('common.confirm')}</Button>
      </Terminal>
    )
  }

  if (isMobileAlipayDeepLink) {
    if (!fallbackVisible) {
      return (
        <Card className="space-y-4 p-6">
          <div className="flex flex-col items-center gap-3 text-center">
            <Loader2 className="size-8 animate-spin text-[#00AEEF]" aria-hidden />
            <p className="text-lg font-semibold">
              {deepLinkState === 'backgrounded'
                ? t('payment.qr.alipayContinueInApp')
                : t('payment.qr.alipayOpening')}
            </p>
            <p className="text-sm text-muted-foreground">{t('payment.qr.alipayWaitingHint')}</p>
            {deepLinkState === 'backgrounded' ? (
              <Button variant="outline" onClick={() => launcherRef.current?.launch()}>
                {t('payment.qr.reopenAlipay')}
              </Button>
            ) : null}
          </div>
          {countdown}
          {cancelBtn}
        </Card>
      )
    }
  }

  if (isMobileAlipayDeepLink && fallbackVisible) {
    return (
      <Card className="space-y-4 p-6">
        <div className="text-center">
          <p className="text-lg font-semibold">{t('payment.qr.alipayFallbackTitle')}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t('payment.qr.alipayFallbackHint')}</p>
        </div>
        <dl className="space-y-1 rounded-lg bg-muted p-3 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">{t('payment.orders.payAmount')}</dt>
            <dd className="tabular font-semibold">{payText}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">{t('payment.orders.orderNo')}</dt>
            <dd className="tabular break-all">{orderNo}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">{t('payment.qr.expiresIn')}</dt>
            <dd className="tabular">{formatCountdown(remaining)}</dd>
          </div>
        </dl>
        <canvas
          ref={canvasRef}
          className="mx-auto rounded-lg border"
          aria-label={t('payment.qr.scanAlipay')}
        />
        <p className="text-center text-xs text-muted-foreground">{t('payment.qr.alipaySaveAndScanHint')}</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <Button variant="outline" onClick={() => launcherRef.current?.launch()}>
            {t('payment.qr.reopenAlipay')}
          </Button>
          <Button variant="outline" onClick={saveQRCode}>
            {t('payment.qr.saveQRCode')}
          </Button>
        </div>
        <Button variant="secondary" className="w-full" onClick={done}>
          {t('payment.result.backToRecharge')}
        </Button>
      </Card>
    )
  }

  if (showQR) {
    const title = isAlipay
      ? t('payment.qr.scanAlipay')
      : isWxpay
        ? t('payment.qr.scanWxpay')
        : t('payment.qr.scanToPay')
    const hint = isAlipay ? t('payment.qr.scanAlipayHint') : isWxpay ? t('payment.qr.scanWxpayHint') : ''
    return (
      <Card className="space-y-4 p-6">
        <div className="flex flex-col items-center gap-3">
          <p className="text-lg font-semibold">{title}</p>
          <p className="tabular text-2xl font-semibold text-primary">{payText}</p>
          <div
            className={cn(
              'rounded-xl border-2 p-2',
              isAlipay
                ? 'border-[#00AEEF] bg-[#00AEEF]/5'
                : isWxpay
                  ? 'border-[#2BB741] bg-[#2BB741]/5'
                  : 'bg-white'
            )}
          >
            <canvas ref={canvasRef} aria-label={title} />
          </div>
          {hint ? <p className="text-center text-sm text-muted-foreground">{hint}</p> : null}
          {payUrl ? (
            <Button variant="outline" size="sm" onClick={reopenPopup}>
              <ExternalLink aria-hidden />
              {t('payment.qr.openPayWindow')}
            </Button>
          ) : null}
        </div>
        {countdown}
        {cancelBtn}
      </Card>
    )
  }

  return (
    <Card className="space-y-4 p-6">
      <div className="flex flex-col items-center gap-3 text-center">
        <Loader2 className="size-8 animate-spin text-primary" aria-hidden />
        <p className="tabular text-2xl font-semibold">{payText}</p>
        <p className="text-sm text-muted-foreground">{t('payment.qr.payInNewWindowHint')}</p>
        {payUrl ? (
          <Button variant="outline" size="sm" onClick={reopenPopup}>
            <ExternalLink aria-hidden />
            {t('payment.qr.openPayWindow')}
          </Button>
        ) : null}
      </div>
      {countdown}
      {cancelBtn}
    </Card>
  )
}
