/**
 * /payment/stripe：Stripe 支付落地页。
 *  - 指定 method（alipay / wechat_pay，弹窗形态）：直接确认；
 *  - 未指定：渲染完整 Payment Element（card / link / alipay / wechat_pay）。
 * client_secret 只从本浏览器下单时写入的恢复快照读取，且快照订单必须与 URL 订单一致，不信任 URL 中的参数。
 */
import * as React from 'react'
import { useRouter } from 'next/router'
import type { Stripe, StripeElements } from '@stripe/stripe-js'
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react'
import { paymentAPI } from '@/api/payment'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { t } from '@/i18n'
import { getLocale } from '@/i18n'
import { usePaymentStore } from '@/stores/payment'
import type { PaymentOrder } from '@/types/payment'
import { extractI18nErrorMessage } from '@/utils/apiError'
import { isMobileDevice } from '@/utils/device'
import { formatPaymentAmount, normalizePaymentCurrency } from './currency'
import { PAYMENT_RECOVERY_STORAGE_KEY, readPaymentRecoverySnapshot } from './paymentFlow'

interface WechatConfirmResult {
  paymentIntent?: {
    status: string
    next_action?: { wechat_pay_display_qr_code?: { image_data_url?: string } }
  }
  error?: { message?: string }
}

export function StripePaymentPage() {
  const router = useRouter()
  const [params] = React.useState(() => {
    const q = new URLSearchParams(window.location.search)
    return {
      orderId: Number(q.get('order_id')),
      method: q.get('method') || '',
      resumeToken: q.get('resume_token') || undefined,
      rawOrderId: q.get('order_id') || ''
    }
  })
  const [loading, setLoading] = React.useState(true)
  const [initError, setInitError] = React.useState('')
  const [stripeError, setStripeError] = React.useState('')
  const [submitting, setSubmitting] = React.useState(false)
  const [success, setSuccess] = React.useState(false)
  const [redirecting, setRedirecting] = React.useState(false)
  const [showElement, setShowElement] = React.useState(false)
  const [ready, setReady] = React.useState(false)
  const [order, setOrder] = React.useState<PaymentOrder | null>(null)
  const [currency, setCurrency] = React.useState('CNY')
  const [wechatQr, setWechatQr] = React.useState('')
  const stripeRef = React.useRef<Stripe | null>(null)
  const elementsRef = React.useRef<StripeElements | null>(null)
  const mountRef = React.useRef<HTMLDivElement | null>(null)
  const clientSecretRef = React.useRef('')
  const disposed = React.useRef(false)
  const timers = React.useRef<{
    redirect?: ReturnType<typeof setTimeout>
    poll?: ReturnType<typeof setInterval>
  }>({})

  const scheduleClose = React.useCallback(() => {
    if (disposed.current) return
    if (window.opener) {
      timers.current.redirect = setTimeout(() => window.close(), 2000)
    } else {
      timers.current.redirect = setTimeout(() => {
        void router.push({
          pathname: '/payment/result',
          query: { order_id: params.rawOrderId, status: 'success' }
        })
      }, 2000)
    }
  }, [router, params.rawOrderId])

  const startPolling = React.useCallback(() => {
    if (!params.orderId || disposed.current) return
    timers.current.poll = setInterval(async () => {
      const o = await usePaymentStore.getState().pollOrderStatus(params.orderId)
      if (!o) return
      if (o.status === 'COMPLETED' || o.status === 'PAID') {
        if (timers.current.poll) clearInterval(timers.current.poll)
        timers.current.poll = undefined
        setSuccess(true)
        setWechatQr('')
        scheduleClose()
      }
    }, 3000)
  }, [params.orderId, scheduleClose])

  React.useEffect(() => {
    disposed.current = false
    const run = async () => {
      const restored = readPaymentRecoverySnapshot(
        window.localStorage.getItem(PAYMENT_RECOVERY_STORAGE_KEY),
        { resumeToken: params.resumeToken }
      )
      const clientSecret = params.orderId && restored?.orderId === params.orderId ? restored.clientSecret : ''
      if (!params.orderId || !clientSecret) {
        setLoading(false)
        setInitError(t('payment.stripeMissingParams'))
        return
      }
      clientSecretRef.current = clientSecret
      try {
        setCurrency(normalizePaymentCurrency(restored?.currency))
        const res = await paymentAPI.getOrder(params.orderId)
        if (disposed.current) return
        setOrder(res.data)
        if (res.data.currency) setCurrency(normalizePaymentCurrency(res.data.currency))

        const config = await usePaymentStore.getState().fetchConfig()
        const publishableKey = config?.stripe_publishable_key
        if (!publishableKey) {
          setInitError(t('payment.stripeNotConfigured'))
          return
        }
        const { loadStripe } = await import('@stripe/stripe-js/pure')
        const stripe = await loadStripe(publishableKey)
        if (disposed.current) return
        if (!stripe) {
          setInitError(t('payment.stripeLoadFailed'))
          return
        }
        stripeRef.current = stripe
        setLoading(false)

        if (params.method === 'alipay') {
          setRedirecting(true)
          const returnUrl = `${window.location.origin}/payment/result?order_id=${params.orderId}&status=success`
          const { error } = await stripe.confirmAlipayPayment(clientSecret, { return_url: returnUrl })
          if (error) {
            setRedirecting(false)
            setStripeError(error.message || t('payment.result.failed'))
          }
        } else if (params.method === 'wechat_pay') {
          const { paymentIntent, error } = await (
            stripe as Stripe & {
              confirmWechatPayPayment: (
                cs: string,
                o: Record<string, unknown>
              ) => Promise<WechatConfirmResult>
            }
          ).confirmWechatPayPayment(clientSecret, {
            payment_method_options: { wechat_pay: { client: isMobileDevice() ? 'mobile_web' : 'web' } }
          })
          if (error) setStripeError(error.message || t('payment.result.failed'))
          else {
            const qr = paymentIntent?.next_action?.wechat_pay_display_qr_code?.image_data_url
            if (qr) {
              setWechatQr(qr)
              startPolling()
            } else if (paymentIntent?.status === 'succeeded') {
              setSuccess(true)
              scheduleClose()
            } else setStripeError(t('payment.result.failed'))
          }
        } else {
          setShowElement(true)
        }
      } catch (err) {
        setInitError(extractI18nErrorMessage(err, t, 'payment.errors', t('payment.stripeLoadFailed')))
      } finally {
        setLoading(false)
      }
    }
    void run()
    const tm = timers.current
    return () => {
      disposed.current = true
      if (tm.redirect) clearTimeout(tm.redirect)
      if (tm.poll) clearInterval(tm.poll)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅挂载时初始化
  }, [])

  // 完整 Payment Element 挂载
  React.useEffect(() => {
    if (!showElement || !stripeRef.current || !mountRef.current) return
    const isDark = document.documentElement.classList.contains('dark')
    const elements = stripeRef.current.elements({
      clientSecret: clientSecretRef.current,
      appearance: { theme: isDark ? 'night' : 'stripe', variables: { borderRadius: '8px' } }
    })
    elementsRef.current = elements
    const el = elements.create('payment', {
      layout: 'tabs',
      paymentMethodOrder: ['alipay', 'wechat_pay', 'card', 'link']
    } as Record<string, unknown>)
    el.mount(mountRef.current)
    el.on('ready', () => setReady(true))
    return () => {
      el.destroy()
      elementsRef.current = null
    }
  }, [showElement])

  const pay = async () => {
    if (!stripeRef.current || !elementsRef.current || submitting) return
    setSubmitting(true)
    setStripeError('')
    try {
      const { error } = await stripeRef.current.confirmPayment({
        elements: elementsRef.current,
        confirmParams: {
          return_url: `${window.location.origin}/payment/result?order_id=${params.rawOrderId}&status=success`
        },
        redirect: 'if_required'
      })
      if (error) setStripeError(error.message || t('payment.result.failed'))
      else {
        setSuccess(true)
        scheduleClose()
      }
    } catch (err) {
      setStripeError(extractI18nErrorMessage(err, t, 'payment.errors', t('payment.result.failed')))
    } finally {
      setSubmitting(false)
    }
  }

  const back = () => void router.push('/purchase')
  const amountText = order ? formatPaymentAmount(order.pay_amount, currency, getLocale()) : ''

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24" role="status" aria-label={t('common.loading')}>
        <Loader2 className="size-8 animate-spin text-primary" aria-hidden />
      </div>
    )
  }
  if (initError) {
    return (
      <Card className="mx-auto max-w-lg p-8 text-center">
        <AlertCircle className="mx-auto mb-4 size-12 text-destructive" aria-hidden />
        <h1 className="text-lg font-semibold">{t('payment.stripeLoadFailed')}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{initError}</p>
        <Button className="mt-6" onClick={back}>
          {t('payment.result.backToRecharge')}
        </Button>
      </Card>
    )
  }

  return (
    <div className="mx-auto w-full max-w-lg space-y-4">
      {order ? (
        <Card className="bg-[#635bff] p-5 text-white">
          <p className="text-sm opacity-80">{t('payment.actualPay')}</p>
          <p className="tabular text-3xl font-semibold">{amountText}</p>
        </Card>
      ) : null}

      {wechatQr ? (
        <Card className="flex flex-col items-center gap-3 p-6">
          <p className="text-lg font-semibold">{t('payment.qr.scanWxpay')}</p>
          {/* eslint-disable-next-line @next/next/no-img-element -- Stripe 返回的 data URL */}
          <img
            src={wechatQr}
            alt={t('payment.qr.scanWxpay')}
            className="size-56 rounded-lg border bg-white p-2"
          />
          <p className="text-center text-sm text-muted-foreground">{t('payment.qr.scanWxpayHint')}</p>
          <p className="text-sm text-muted-foreground">{t('payment.qr.waitingPayment')}</p>
        </Card>
      ) : redirecting ? (
        <Card className="flex flex-col items-center gap-3 p-8">
          <Loader2 className="size-8 animate-spin text-[#00AEEF]" aria-hidden />
          <p className="text-sm text-muted-foreground">{t('payment.qr.payInNewWindowHint')}</p>
        </Card>
      ) : success ? (
        <Card className="flex flex-col items-center gap-2 p-8 text-center" role="status">
          <CheckCircle2 className="size-12 text-success" aria-hidden />
          <p className="text-lg font-semibold">{t('payment.result.success')}</p>
          <p className="text-sm text-muted-foreground">{t('payment.stripeSuccessProcessing')}</p>
        </Card>
      ) : showElement ? (
        <Card className="space-y-4 p-6">
          <div ref={mountRef} className="min-h-[200px]" />
          {stripeError ? (
            <p role="alert" className="text-sm text-destructive">
              {stripeError}
            </p>
          ) : null}
          <div className="flex gap-3">
            <Button
              className="flex-1 bg-[#635bff] text-white hover:bg-[#635bff]/90"
              disabled={!ready}
              loading={submitting}
              onClick={() => void pay()}
            >
              {submitting ? t('common.processing') : t('payment.stripePay')}
            </Button>
            <Button variant="outline" onClick={back}>
              {t('payment.result.backToRecharge')}
            </Button>
          </div>
        </Card>
      ) : null}

      {stripeError && !showElement ? (
        <Card className="p-4">
          <p role="alert" className="text-sm text-destructive">
            {stripeError}
          </p>
          <Button variant="outline" className="mt-3 w-full" onClick={back}>
            {t('payment.result.backToRecharge')}
          </Button>
        </Card>
      ) : null}
    </div>
  )
}
