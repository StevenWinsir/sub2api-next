/**
 * /payment/stripe-popup：Stripe 弹窗（支付宝 / 微信）。
 * 与父窗口通过 postMessage 握手：本页发 STRIPE_POPUP_READY → 父窗口回 STRIPE_POPUP_INIT（含 clientSecret / publishableKey）。
 * 收发双方都校验 origin；接收时额外要求消息来自 window.opener。
 */
import * as React from 'react'
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react'
import { buildApiUrl } from '@/api/url'
import { Card } from '@/components/ui/card'
import { STORAGE_KEYS } from '@/constants/storage'
import { t } from '@/i18n'
import { extractI18nErrorMessage } from '@/utils/apiError'
import { isMobileDevice } from '@/utils/device'

interface StripeWithWechatPay {
  confirmWechatPayPayment(
    clientSecret: string,
    options: Record<string, unknown>
  ): Promise<{ error?: { message?: string }; paymentIntent?: { status: string } }>
}

const METHOD_COLORS: Record<string, string> = { alipay: '#00AEEF', wechat_pay: '#07C160' }

/** 仅接受同源、来自 opener 且类型为 STRIPE_POPUP_INIT 的消息。 */
export function isTrustedInitMessage(
  event: Pick<MessageEvent, 'origin' | 'source' | 'data'>,
  origin: string,
  opener: unknown
): boolean {
  if (event.origin !== origin) return false
  if (!opener || event.source !== opener) return false
  return (event.data as { type?: unknown } | null)?.type === 'STRIPE_POPUP_INIT'
}

export function StripePopupPage() {
  const [params] = React.useState(() => {
    const q = new URLSearchParams(window.location.search)
    return { orderId: q.get('order_id') || '', method: q.get('method') || 'alipay' }
  })
  const [error, setError] = React.useState('')
  const [success, setSuccess] = React.useState(false)
  const [hint, setHint] = React.useState(t('payment.stripePopup.redirecting'))
  const state = React.useRef({ error: '', success: false })
  React.useEffect(() => {
    state.current = { error, success }
  })
  const color = METHOD_COLORS[params.method] || '#635bff'

  React.useEffect(() => {
    let disposed = false
    let pollTimer: ReturnType<typeof setInterval> | null = null
    let initTimer: ReturnType<typeof setTimeout> | null = null
    let closeTimer: ReturnType<typeof setTimeout> | null = null
    const origin = window.location.origin

    const closeLater = () => {
      closeTimer = setTimeout(() => window.close(), 2000)
    }
    const startPolling = () => {
      let inFlight = false
      pollTimer = setInterval(async () => {
        // 防重入：接口响应慢于轮询间隔时避免并发重叠请求
        if (inFlight) return
        inFlight = true
        try {
          // access token 位于 localStorage 的 auth_token 键
          const token = localStorage.getItem(STORAGE_KEYS.authToken) || ''
          const res = await fetch(buildApiUrl(`/payment/orders/${params.orderId}`), {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
            credentials: 'include'
          })
          if (!res.ok) return
          const status = (await res.json())?.data?.status
          if (status === 'COMPLETED' || status === 'PAID') {
            if (pollTimer) clearInterval(pollTimer)
            pollTimer = null
            setSuccess(true)
            closeLater()
          }
        } catch {
          /* 忽略 */
        } finally {
          inFlight = false
        }
      }, 3000)
    }

    const initStripe = async (clientSecret: string, publishableKey: string) => {
      if (!clientSecret || !publishableKey) return setError(t('payment.stripeMissingParams'))
      try {
        const { loadStripe } = await import('@stripe/stripe-js/pure')
        const stripe = await loadStripe(publishableKey)
        if (disposed) return
        if (!stripe) return setError(t('payment.stripeLoadFailed'))
        const returnUrl = `${origin}/payment/result?order_id=${params.orderId}&status=success`
        if (params.method === 'alipay') {
          const { error: err } = await stripe.confirmAlipayPayment(clientSecret, { return_url: returnUrl })
          if (err) setError(err.message || t('payment.result.failed'))
        } else if (params.method === 'wechat_pay') {
          setHint(t('payment.stripePopup.loadingQr'))
          const result = await (stripe as unknown as StripeWithWechatPay).confirmWechatPayPayment(
            clientSecret,
            {
              payment_method_options: { wechat_pay: { client: isMobileDevice() ? 'mobile_web' : 'web' } }
            }
          )
          if (result.error) setError(result.error.message || t('payment.result.failed'))
          else if (result.paymentIntent?.status === 'succeeded') {
            setSuccess(true)
            closeLater()
          } else startPolling() // 用户关闭了二维码弹层：改为轮询订单状态
        }
      } catch (err) {
        setError(extractI18nErrorMessage(err, t, 'payment.errors', t('payment.stripeLoadFailed')))
      }
    }

    const handler = (event: MessageEvent) => {
      if (!isTrustedInitMessage(event, origin, window.opener)) return
      // INIT 已到达：取消兜底超时，避免长时间扫码被误判为超时
      if (initTimer) clearTimeout(initTimer)
      initTimer = null
      window.removeEventListener('message', handler)
      const data = event.data as { clientSecret?: string; publishableKey?: string }
      void initStripe(String(data.clientSecret || ''), String(data.publishableKey || ''))
    }
    window.addEventListener('message', handler)
    if (window.opener) window.opener.postMessage({ type: 'STRIPE_POPUP_READY' }, origin)
    // 仅兜底“父窗口始终未发 INIT”的场景
    initTimer = setTimeout(() => {
      if (!state.current.error && !state.current.success) setError(t('payment.stripePopup.timeout'))
    }, 15000)

    return () => {
      disposed = true
      window.removeEventListener('message', handler)
      if (pollTimer) clearInterval(pollTimer)
      if (initTimer) clearTimeout(initTimer)
      if (closeTimer) clearTimeout(closeTimer)
    }
  }, [params.orderId, params.method])

  return (
    <Card className="mx-auto flex w-full max-w-sm flex-col items-center gap-3 p-8 text-center" role="status">
      {error ? (
        <>
          <AlertCircle className="size-12 text-destructive" aria-hidden />
          <p className="text-sm text-destructive">{error}</p>
        </>
      ) : success ? (
        <>
          <CheckCircle2 className="size-12 text-success" aria-hidden />
          <p className="text-lg font-semibold">{t('payment.result.success')}</p>
        </>
      ) : (
        <>
          <Loader2 className="size-10 animate-spin" style={{ color }} aria-hidden />
          <p className="text-sm text-muted-foreground">{hint}</p>
        </>
      )}
    </Card>
  )
}
