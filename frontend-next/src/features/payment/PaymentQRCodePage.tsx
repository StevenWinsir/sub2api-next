/** /payment/qrcode：独立二维码支付页（query: order_id / qr / pay_url / payment_type / expires_at）。 */
import * as React from 'react'
import { useRouter } from 'next/router'
import { paymentAPI } from '@/api/payment'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { t } from '@/i18n'
import { useAppStore } from '@/stores/app'
import { usePaymentStore } from '@/stores/payment'
import { extractI18nErrorMessage } from '@/utils/apiError'
import { formatCountdown } from './PaymentStatusPanel'
import { isBuiltInAlipayMethod, isBuiltInWxpayMethod } from './providerConfig'

interface QrParams {
  orderId: number
  qr: string
  payUrl: string
  paymentType: string
  seconds: number
}

function readParams(): QrParams {
  const q = new URLSearchParams(window.location.search)
  const expiresAt = q.get('expires_at') || ''
  const seconds = expiresAt ? Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000) : 30 * 60
  return {
    orderId: Number(q.get('order_id')) || 0,
    qr: q.get('qr') || '',
    payUrl: q.get('pay_url') || '',
    paymentType: q.get('payment_type') || '',
    seconds
  }
}

/** 在二维码中心绘制支付渠道 Logo（白底圆角）。 */
function drawLogo(canvas: HTMLCanvasElement, src: string) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const img = new Image()
  img.src = src
  img.onload = () => {
    const size = 48
    const x = (canvas.width - size) / 2
    const y = (canvas.height - size) / 2
    const pad = 5
    const r = 6
    ctx.fillStyle = '#FFFFFF'
    ctx.beginPath()
    ctx.moveTo(x - pad + r, y - pad)
    ctx.arcTo(x + size + pad, y - pad, x + size + pad, y + size + pad, r)
    ctx.arcTo(x + size + pad, y + size + pad, x - pad, y + size + pad, r)
    ctx.arcTo(x - pad, y + size + pad, x - pad, y - pad, r)
    ctx.arcTo(x - pad, y - pad, x + size + pad, y - pad, r)
    ctx.fill()
    ctx.drawImage(img, x, y, size, size)
  }
}

export function PaymentQRCodePage() {
  const router = useRouter()
  const showError = useAppStore((s) => s.showError)
  const [params] = React.useState<QrParams>(readParams)
  const [remaining, setRemaining] = React.useState(Math.max(0, params.seconds))
  const [expired, setExpired] = React.useState(params.seconds <= 0)
  const [cancelling, setCancelling] = React.useState(false)
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null)
  const activeRef = React.useRef(true)

  const isAlipay = isBuiltInAlipayMethod(params.paymentType)
  const isWxpay = isBuiltInWxpayMethod(params.paymentType)
  const title = isAlipay
    ? t('payment.qr.scanAlipay')
    : isWxpay
      ? t('payment.qr.scanWxpay')
      : t('payment.qr.scanToPay')
  const hint = isAlipay ? t('payment.qr.scanAlipayHint') : isWxpay ? t('payment.qr.scanWxpayHint') : ''

  React.useEffect(() => {
    if (!params.qr || !canvasRef.current) return
    const logo = isAlipay ? '/static/payment/alipay.svg' : isWxpay ? '/static/payment/wxpay.svg' : null
    let cancelled = false
    void import('qrcode').then(async ({ default: QRCode }) => {
      const canvas = canvasRef.current
      if (cancelled || !canvas) return
      // 中心叠加 Logo 时使用 M 级纠错，保证仍可扫描
      await QRCode.toCanvas(canvas, params.qr, {
        width: 256,
        margin: 2,
        errorCorrectionLevel: logo ? 'M' : 'L'
      })
      if (logo && !cancelled) drawLogo(canvas, logo)
    })
    return () => {
      cancelled = true
    }
  }, [params.qr, isAlipay, isWxpay])

  React.useEffect(() => {
    activeRef.current = true
    if (params.seconds <= 0) return
    const deadline = Date.now() + params.seconds * 1000
    let inFlight = false
    const countdown = setInterval(() => {
      const left = Math.max(0, Math.floor((deadline - Date.now()) / 1000))
      setRemaining(left)
      if (left <= 0) {
        setExpired(true)
        activeRef.current = false
        clearInterval(countdown)
        clearInterval(poll)
      }
    }, 1000)
    const poll = setInterval(async () => {
      if (!params.orderId || inFlight || !activeRef.current) return
      // 防重入：接口响应慢于 3 秒轮询间隔时避免并发请求与重复跳转
      inFlight = true
      try {
        const order = await usePaymentStore.getState().pollOrderStatus(params.orderId)
        // 定时器已清理后不再执行终态跳转
        if (!order || !activeRef.current) return
        if (order.status === 'COMPLETED' || order.status === 'PAID') {
          activeRef.current = false
          clearInterval(countdown)
          clearInterval(poll)
          void router.push({
            pathname: '/payment/result',
            query: { order_id: String(params.orderId), status: 'success' }
          })
        } else if (['EXPIRED', 'CANCELLED', 'FAILED'].includes(order.status)) {
          activeRef.current = false
          clearInterval(countdown)
          clearInterval(poll)
          setExpired(true)
        }
      } finally {
        inFlight = false
      }
    }, 3000)
    return () => {
      activeRef.current = false
      clearInterval(countdown)
      clearInterval(poll)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅依赖初始参数
  }, [])

  const cancel = async () => {
    if (!params.orderId || cancelling) return
    setCancelling(true)
    try {
      await paymentAPI.cancelOrder(params.orderId)
      activeRef.current = false
      await router.push('/purchase')
    } catch (err) {
      showError(extractI18nErrorMessage(err, t, 'payment.errors', t('common.error')))
    } finally {
      setCancelling(false)
    }
  }

  return (
    <Card className="mx-auto flex w-full max-w-md flex-col items-center gap-6 p-8">
      <h1 className="text-xl font-semibold">{params.qr ? title : t('payment.qr.payInNewWindow')}</h1>
      {params.qr ? (
        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <canvas ref={canvasRef} className="mx-auto" aria-label={title} />
        </div>
      ) : null}
      {params.qr && !expired && hint ? (
        <p className="text-center text-sm text-muted-foreground">{hint}</p>
      ) : null}
      {expired ? (
        <div className="text-center">
          <p className="text-lg font-medium text-destructive">{t('payment.qr.expired')}</p>
          <Button className="mt-4" onClick={() => void router.push('/purchase')}>
            {t('payment.result.backToRecharge')}
          </Button>
        </div>
      ) : (
        <div className="text-center">
          <p className="text-sm text-muted-foreground">
            {params.qr ? t('payment.qr.expiresIn') : t('payment.qr.payInNewWindowHint')}
          </p>
          <p className="tabular mt-1 text-2xl font-semibold" role="timer" aria-live="off">
            {formatCountdown(remaining)}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">{t('payment.qr.waitingPayment')}</p>
        </div>
      )}
      {params.payUrl && !params.qr && !expired ? (
        <Button asChild size="lg" className="w-full">
          <a href={params.payUrl} target="_blank" rel="noopener noreferrer">
            {t('payment.qr.openPayWindow')}
          </a>
        </Button>
      ) : null}
      {!expired && params.orderId ? (
        <Button variant="outline" className="w-full" loading={cancelling} onClick={() => void cancel()}>
          {cancelling ? t('common.processing') : t('payment.qr.cancelOrder')}
        </Button>
      ) : null}
    </Card>
  )
}
