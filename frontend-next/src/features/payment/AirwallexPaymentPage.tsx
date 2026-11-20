/** /payment/airwallex：Airwallex 托管收银台跳转（生产 / demo 环境由恢复快照的 paymentEnv 决定）。 */
import * as React from 'react'
import { useRouter } from 'next/router'
import { AlertCircle, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { t } from '@/i18n'
import { getLocale } from '@/i18n'
import {
  PAYMENT_RECOVERY_STORAGE_KEY,
  readPaymentRecoverySnapshot,
  type PaymentRecoverySnapshot
} from './paymentFlow'

interface Params {
  orderId: number
  outTradeNo: string
  resumeToken: string
}

/** 仅当快照是 Airwallex 订单、与地址栏订单一致且含 intent / secret 时可用。 */
export function matchAirwallexSnapshot(raw: string | null, p: Params): PaymentRecoverySnapshot | null {
  const snapshot = readPaymentRecoverySnapshot(raw, p.resumeToken ? { resumeToken: p.resumeToken } : {})
  if (!snapshot || snapshot.paymentType !== 'airwallex') return null
  if (p.orderId > 0 && snapshot.orderId !== p.orderId) return null
  if (p.outTradeNo && snapshot.outTradeNo !== p.outTradeNo) return null
  if (!snapshot.intentId || !snapshot.clientSecret) return null
  return snapshot
}

export function buildAirwallexSuccessUrl(
  snapshot: PaymentRecoverySnapshot,
  p: Params,
  origin: string
): string {
  const url = new URL('/payment/result', origin)
  if (p.orderId || snapshot.orderId > 0)
    url.searchParams.set('order_id', String(p.orderId || snapshot.orderId))
  if (p.outTradeNo || snapshot.outTradeNo)
    url.searchParams.set('out_trade_no', p.outTradeNo || snapshot.outTradeNo)
  if (p.resumeToken || snapshot.resumeToken)
    url.searchParams.set('resume_token', p.resumeToken || snapshot.resumeToken)
  return url.toString()
}

export function AirwallexPaymentPage() {
  const router = useRouter()
  const [loading, setLoading] = React.useState(true)
  const [errorMessage, setErrorMessage] = React.useState('')

  React.useEffect(() => {
    let disposed = false
    const q = new URLSearchParams(window.location.search)
    const params: Params = {
      orderId: Number(q.get('order_id')) || 0,
      outTradeNo: q.get('out_trade_no') || '',
      resumeToken: q.get('resume_token') || ''
    }
    const run = async () => {
      const snapshot = matchAirwallexSnapshot(
        window.localStorage.getItem(PAYMENT_RECOVERY_STORAGE_KEY),
        params
      )
      if (!snapshot) {
        setLoading(false)
        setErrorMessage(t('payment.airwallexMissingParams'))
        return
      }
      try {
        const airwallex = await import('@airwallex/components-sdk')
        if (disposed) return
        const result = await airwallex.init({
          env: snapshot.paymentEnv === 'prod' ? 'prod' : 'demo',
          enabledElements: ['payments'],
          locale: getLocale().startsWith('zh') ? 'zh' : 'en'
        })
        if (disposed) return
        setLoading(false)
        if (!result.payments) throw new Error(t('payment.airwallexLoadFailed'))
        const redirect = result.payments.redirectToCheckout({
          intent_id: snapshot.intentId,
          client_secret: snapshot.clientSecret,
          currency: snapshot.currency || 'CNY',
          country_code: snapshot.countryCode || 'CN',
          successUrl: buildAirwallexSuccessUrl(snapshot, params, window.location.origin)
        })
        if (typeof redirect === 'string' && redirect) window.location.assign(redirect)
      } catch (err) {
        setLoading(false)
        setErrorMessage(err instanceof Error && err.message ? err.message : t('payment.airwallexLoadFailed'))
      }
    }
    void run()
    return () => {
      disposed = true
    }
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24" role="status" aria-label={t('common.loading')}>
        <Loader2 className="size-8 animate-spin text-[#FF6B3D]" aria-hidden />
      </div>
    )
  }
  if (errorMessage) {
    return (
      <Card className="mx-auto max-w-lg p-8 text-center">
        <AlertCircle className="mx-auto mb-4 size-12 text-destructive" aria-hidden />
        <h1 className="text-lg font-semibold">{t('payment.airwallexLoadFailed')}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{errorMessage}</p>
        <Button className="mt-6" onClick={() => void router.push('/purchase')}>
          {t('payment.result.backToRecharge')}
        </Button>
      </Card>
    )
  }
  return (
    <Card className="mx-auto flex max-w-lg flex-col items-center gap-4 p-8" role="status">
      <Loader2 className="size-10 animate-spin text-[#FF6B3D]" aria-hidden />
      <p className="text-sm text-muted-foreground">{t('payment.qr.payInNewWindowHint')}</p>
    </Card>
  )
}
