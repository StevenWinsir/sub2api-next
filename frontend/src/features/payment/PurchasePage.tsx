/**
 * /purchase：充值 + 订阅购买（对应 views/user/PaymentView.vue）。
 *
 * 流程：加载 checkout-info → 选择金额 / 套餐 + 支付方式 → 创建订单 → 按 decidePaymentLaunch 的结果
 * 展示二维码 / 新窗口 / Stripe 或 Airwallex 页面 / 微信 OAuth 或 JSAPI → PaymentStatusPanel 轮询 → 结果页。
 * 支付恢复沿用 localStorage 键 payment.recovery.current。
 */
import * as React from 'react'
import { useRouter } from 'next/router'
import { Gift, Loader2 } from 'lucide-react'
import { paymentAPI } from '@/api/payment'
import { EmptyState } from '@/components/EmptyState'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { t } from '@/i18n'
import { getLocale } from '@/i18n'
import { useLocale } from '@/i18n/react'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/stores/app'
import { useAuthStore } from '@/stores/auth'
import { usePaymentStore } from '@/stores/payment'
import { useSubscriptionStore } from '@/stores/subscriptions'
import type { CheckoutInfoResponse, CreateOrderResult, OrderType, SubscriptionPlan } from '@/types/payment'
import { extractApiErrorMessage, extractI18nErrorMessage } from '@/utils/apiError'
import { isMobileDevice } from '@/utils/device'
import { FeatureFlags, resolveFeatureFlag } from '@/utils/featureFlags'
import { renderMarkdownSafe } from '@/utils/markdown'
import { formatPeakRateWindow, hasPeakRate, serverTimezoneLabel } from '@/utils/peak-rate'
import {
  platformAccentBarClass,
  platformBadgeClass,
  platformBadgeLightClass,
  platformLabel,
  platformTextClass
} from '@/utils/platformColors'
import {
  formatBalanceRechargeMultiplier,
  formatRechargeBonusNumber,
  normalizeRechargeBonusMode,
  normalizeRechargeBonusTiers,
  quoteRechargeBonus
} from '@/utils/rechargeBonus'
import { AmountInput } from './AmountInput'
import { formatPaymentAmount, normalizePaymentCurrency } from './currency'
import {
  PAYMENT_RECOVERY_STORAGE_KEY,
  buildCreateOrderPayload,
  clearPaymentRecoverySnapshot,
  decidePaymentLaunch,
  getVisibleMethods,
  normalizeVisibleMethod,
  readPaymentRecoverySnapshot,
  writePaymentRecoverySnapshot,
  type PaymentRecoverySnapshot
} from './paymentFlow'
import { buildPaymentErrorToastMessage, describePaymentScenarioError } from './paymentUx'
import {
  hasWechatResumeQuery,
  parseWechatResumeRoute,
  stripWechatResumeQuery,
  type LocationQuery
} from './paymentWechatResume'
import { PaymentMethodSelector, type PaymentMethodOption } from './PaymentMethodSelector'
import { PaymentStatusPanel } from './PaymentStatusPanel'
import {
  METHOD_ORDER,
  getPaymentPopupFeatures,
  isBuiltInAlipayMethod,
  isBuiltInWxpayMethod
} from './providerConfig'
import {
  amountFitsMethod,
  currencyFractionDigits,
  globalMaxAmount,
  globalMinAmount,
  rechargeFee,
  roundPaymentAmount,
  subscriptionFee,
  subscriptionPaymentAmount
} from './purchaseMath'
import { SubscriptionPlanCard } from './SubscriptionPlanCard'
import { planValiditySuffix } from './validity'

interface CreateOrderOptions {
  openid?: string
  wechatResumeToken?: string
  paymentType?: string
  isResume?: boolean
  mobileQrFallbackAttempted?: boolean
}

interface WeixinJSBridgeLike {
  invoke(
    action: string,
    payload: Record<string, unknown>,
    callback: (result: Record<string, unknown>) => void
  ): void
}

const emptyPaymentState = (): PaymentRecoverySnapshot => ({
  orderId: 0,
  amount: 0,
  qrCode: '',
  expiresAt: '',
  paymentType: '',
  payUrl: '',
  outTradeNo: '',
  clientSecret: '',
  intentId: '',
  currency: '',
  countryCode: '',
  paymentEnv: '',
  payAmount: 0,
  orderType: '',
  paymentMode: '',
  resumeToken: '',
  alipayMobilePrecreateDeepLink: false,
  createdAt: 0
})

const getWeixinJSBridge = (): WeixinJSBridgeLike | undefined =>
  (window as Window & { WeixinJSBridge?: WeixinJSBridgeLike }).WeixinJSBridge

function waitForWeixinJSBridge(timeoutMs = 4000): Promise<WeixinJSBridgeLike | null> {
  const existing = getWeixinJSBridge()
  if (existing) return Promise.resolve(existing)
  return new Promise((resolve) => {
    let settled = false
    const finish = (bridge: WeixinJSBridgeLike | null) => {
      if (settled) return
      settled = true
      document.removeEventListener('WeixinJSBridgeReady', onReady)
      document.removeEventListener('onWeixinJSBridgeReady', onReady)
      window.clearTimeout(timer)
      resolve(bridge)
    }
    const onReady = () => finish(getWeixinJSBridge() ?? null)
    const timer = window.setTimeout(() => finish(getWeixinJSBridge() ?? null), timeoutMs)
    document.addEventListener('WeixinJSBridgeReady', onReady, false)
    document.addEventListener('onWeixinJSBridgeReady', onReady, false)
  })
}

async function invokeWechatJsapiPayment(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
  const bridge = await waitForWeixinJSBridge()
  if (!bridge) throw new Error('WECHAT_JSAPI_UNAVAILABLE')
  return new Promise((resolve) =>
    bridge.invoke('getBrandWCPayRequest', payload, (result) => resolve(result || {}))
  )
}

const isWechatBrowser = () =>
  typeof window !== 'undefined' && /MicroMessenger/i.test(window.navigator.userAgent)

function buildWechatOAuthAuthorizeUrl(
  authorizeUrl: string,
  ctx: { paymentType: string; orderType: OrderType; planId?: number; orderAmount: number }
): string {
  const normalized = authorizeUrl.trim()
  if (!normalized) return normalized
  try {
    const target = new URL(normalized, window.location.origin)
    const redirect = new URL(target.searchParams.get('redirect') || '/purchase', window.location.origin)
    redirect.searchParams.set(
      'payment_type',
      normalizeVisibleMethod(ctx.paymentType) || ctx.paymentType.trim() || 'wxpay'
    )
    redirect.searchParams.set('order_type', ctx.orderType)
    if (ctx.planId) redirect.searchParams.set('plan_id', String(ctx.planId))
    else redirect.searchParams.delete('plan_id')
    if (ctx.orderAmount > 0) redirect.searchParams.set('amount', String(ctx.orderAmount))
    else redirect.searchParams.delete('amount')
    target.searchParams.set('redirect', `${redirect.pathname}${redirect.search}`)
    return target.toString()
  } catch {
    return normalized
  }
}

function resolveHref(path: string, query: Record<string, string | undefined>): string {
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(query)) if (v) params.set(k, v)
  const qs = params.toString()
  return qs ? `${path}?${qs}` : path
}

const queryFromSearch = (): LocationQuery => {
  const out: LocationQuery = {}
  new URLSearchParams(window.location.search).forEach((v, k) => {
    out[k] = v
  })
  return out
}

const daysRemaining = (expiresAt: string) =>
  Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86400000))

const EMPTY_CHECKOUT: CheckoutInfoResponse = {
  methods: {},
  global_min: 0,
  global_max: 0,
  plans: [],
  balance_disabled: false,
  balance_recharge_multiplier: 1,
  subscription_usd_to_cny_rate: 0,
  recharge_fee_rate: 0,
  help_text: '',
  help_image_url: '',
  stripe_publishable_key: '',
  recharge_bonus_tiers: [],
  recharge_bonus_mode: 'bonus',
  recharge_bonus_notice: ''
}

const METHOD_BUTTON = (m: string): string => {
  if (isBuiltInAlipayMethod(m)) return 'bg-[#02A9F1] text-white hover:bg-[#02A9F1]/90'
  if (isBuiltInWxpayMethod(m)) return 'bg-[#09BB07] text-white hover:bg-[#09BB07]/90'
  if (m === 'stripe') return 'bg-[#676BE5] text-white hover:bg-[#676BE5]/90'
  if (m === 'airwallex') return 'bg-[#FF6B3D] text-white hover:bg-[#FF6B3D]/90'
  return ''
}

function Row({
  label,
  value,
  className,
  testId
}: {
  label: React.ReactNode
  value: React.ReactNode
  className?: string
  testId?: string
}) {
  return (
    <div className={cn('flex justify-between', className)} data-testid={testId}>
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular">{value}</span>
    </div>
  )
}

export function PurchasePage() {
  useLocale()
  const router = useRouter()
  const user = useAuthStore((s) => s.user)
  const refreshUser = useAuthStore((s) => s.refreshUser)
  const settings = useAppStore((s) => s.cachedPublicSettings)
  const activeSubscriptions = useSubscriptionStore((s) => s.activeSubscriptions)
  const fetchActiveSubscriptions = useSubscriptionStore((s) => s.fetchActiveSubscriptions)
  const showError = (m: string) => useAppStore.getState().showError(m)

  const [loading, setLoading] = React.useState(true)
  const [submitting, setSubmitting] = React.useState(false)
  const [errorMessage, setErrorMessage] = React.useState('')
  const [errorHint, setErrorHint] = React.useState('')
  const [activeTab, setActiveTab] = React.useState<'recharge' | 'subscription'>('recharge')
  const [amount, setAmount] = React.useState<number | null>(null)
  const [selectedMethod, setSelectedMethod] = React.useState('')
  const [selectedPlan, setSelectedPlan] = React.useState<SubscriptionPlan | null>(null)
  const [phase, setPhase] = React.useState<'select' | 'paying'>('select')
  const [paymentState, setPaymentState] = React.useState<PaymentRecoverySnapshot>(emptyPaymentState)
  const [checkout, setCheckout] = React.useState<CheckoutInfoResponse>(EMPTY_CHECKOUT)
  const [renewGroupId, setRenewGroupId] = React.useState<number | null>(null)
  const [previewImage, setPreviewImage] = React.useState('')
  const stateRef = React.useRef({ paymentState, amount, checkout })
  React.useEffect(() => {
    stateRef.current = { paymentState, amount, checkout }
  })

  const subscriptionEnabled = resolveFeatureFlag(settings, FeatureFlags.subscription)
  const tabs = React.useMemo(() => {
    const r: { key: 'recharge' | 'subscription'; label: string }[] = []
    if (!checkout.balance_disabled) r.push({ key: 'recharge', label: t('payment.tabTopUp') })
    if (subscriptionEnabled) r.push({ key: 'subscription', label: t('payment.tabSubscribe') })
    return r
  }, [checkout.balance_disabled, subscriptionEnabled])

  // 当前 tab 不在列表时收敛到第一个可用 tab（关闭订阅 → 回到充值；仅订阅站点开启订阅 → 进入订阅）
  const [prevTabs, setPrevTabs] = React.useState(tabs)
  if (tabs !== prevTabs) {
    setPrevTabs(tabs)
    if (!tabs.some((x) => x.key === activeTab)) {
      const leavingSubscription = activeTab === 'subscription'
      setActiveTab(tabs[0]?.key ?? 'recharge')
      if (leavingSubscription) setSelectedPlan(null)
    }
  }

  const visibleMethods = React.useMemo(() => getVisibleMethods(checkout.methods), [checkout.methods])
  const enabledMethods = React.useMemo(() => Object.keys(visibleMethods), [visibleMethods])
  const validAmount = amount ?? 0
  const rechargeMultiplier =
    Number.isFinite(checkout.balance_recharge_multiplier) && checkout.balance_recharge_multiplier > 0
      ? checkout.balance_recharge_multiplier
      : 1
  const usdToCny =
    Number.isFinite(checkout.subscription_usd_to_cny_rate) && checkout.subscription_usd_to_cny_rate > 0
      ? checkout.subscription_usd_to_cny_rate
      : 0
  const bonusTiers = React.useMemo(
    () => normalizeRechargeBonusTiers(checkout.recharge_bonus_tiers),
    [checkout.recharge_bonus_tiers]
  )
  const bonusMode = normalizeRechargeBonusMode(checkout.recharge_bonus_mode)
  const limits = Object.values(visibleMethods)
  const minAmount = globalMinAmount(limits)
  const maxAmount = globalMaxAmount(limits)
  const selectedLimit = visibleMethods[selectedMethod]
  const currency = normalizePaymentCurrency(selectedLimit?.currency)
  const locale = getLocale()
  const fmt = (v: number) => formatPaymentAmount(v, currency, locale)
  const fmtSub = (v: number) => fmt(subscriptionPaymentAmount(v, currency, usdToCny))

  const quote = quoteRechargeBonus(bonusTiers, validAmount, {
    multiplier: rechargeMultiplier,
    mode: bonusMode,
    currencyDigits: currencyFractionDigits(currency)
  })
  const payBase = quote.payBase
  const discount = roundPaymentAmount(validAmount - payBase, currency)
  const credited = quote.credited
  const showBonusRow = quote.mode !== 'discount' && quote.bonus > 0
  const showCredited = rechargeMultiplier !== 1 || quote.percent > 0
  const feeRate = checkout.recharge_fee_rate ?? 0
  const { fee: feeAmount, total: totalAmount } = rechargeFee(payBase, feeRate)
  const showActualPay = feeRate > 0 || discount > 0

  const fits = (amt: number, m: string) => amountFitsMethod(amt, visibleMethods[m])
  const methodOptions: PaymentMethodOption[] = enabledMethods.map((type) => {
    const ml = visibleMethods[type]
    return {
      type,
      display_name: ml?.display_name,
      fee_rate: ml?.fee_rate ?? 0,
      available: ml?.available !== false && fits(payBase, type)
    }
  })

  let amountError = ''
  if (validAmount > 0) {
    if (!enabledMethods.some((m) => fits(payBase, m))) amountError = t('payment.amountNoMethod')
    else if (selectedLimit) {
      if (selectedLimit.single_min > 0 && payBase < selectedLimit.single_min)
        amountError = t('payment.amountTooLow', { min: fmt(selectedLimit.single_min) })
      else if (selectedLimit.single_max > 0 && payBase > selectedLimit.single_max)
        amountError = t('payment.amountTooHigh', { max: fmt(selectedLimit.single_max) })
    }
  }
  const canSubmit = validAmount > 0 && fits(payBase, selectedMethod) && selectedLimit?.available !== false

  const subPay = subscriptionPaymentAmount(selectedPlan?.price ?? 0, currency, usdToCny)
  const { fee: subFee, total: subTotal } = subscriptionFee(subPay, feeRate, currency)
  const subMethodOptions: PaymentMethodOption[] = enabledMethods.map((type) => {
    const ml = visibleMethods[type]
    const cur = normalizePaymentCurrency(ml?.currency)
    const total = subscriptionFee(
      subscriptionPaymentAmount(selectedPlan?.price ?? 0, cur, usdToCny),
      feeRate,
      cur
    ).total
    return {
      type,
      display_name: ml?.display_name,
      fee_rate: ml?.fee_rate ?? 0,
      available: ml?.available !== false && fits(total, type)
    }
  })
  const canSubmitSub =
    selectedPlan !== null && fits(subTotal, selectedMethod) && selectedLimit?.available !== false

  // 当前方式无法承载金额时自动切换到第一个可用方式
  const [prevKey, setPrevKey] = React.useState('')
  const key = `${payBase}|${selectedMethod}`
  if (key !== prevKey) {
    setPrevKey(key)
    if (payBase > 0 && !fits(payBase, selectedMethod)) {
      const available = enabledMethods.find((m) => fits(payBase, m))
      if (available) setSelectedMethod(available)
    }
  }

  const persist = (snapshot: PaymentRecoverySnapshot) => {
    if (snapshot.orderId)
      writePaymentRecoverySnapshot(window.localStorage, snapshot, PAYMENT_RECOVERY_STORAGE_KEY)
  }
  const removeSnapshot = () => clearPaymentRecoverySnapshot(window.localStorage, PAYMENT_RECOVERY_STORAGE_KEY)
  const resetPayment = () => {
    setPhase('select')
    setPaymentState(emptyPaymentState())
    removeSnapshot()
  }
  const redirectToResult = async (state: PaymentRecoverySnapshot) => {
    await router.push(
      resolveHref('/payment/result', {
        order_id: state.orderId > 0 ? String(state.orderId) : undefined,
        out_trade_no: state.outTradeNo || undefined,
        resume_token: state.resumeToken || undefined
      })
    )
  }

  const applyScenarioError = (err: unknown, paymentMethod: string): boolean => {
    const descriptor = describePaymentScenarioError(err, {
      paymentMethod,
      isMobile: isMobileDevice(),
      isWechatBrowser: isWechatBrowser()
    })
    if (!descriptor) {
      setErrorMessage('')
      setErrorHint('')
      return false
    }
    const message = t(descriptor.messageKey)
    const hint = descriptor.hintKey ? t(descriptor.hintKey) : ''
    setErrorMessage(message)
    setErrorHint(hint)
    showError(buildPaymentErrorToastMessage(message, hint))
    return true
  }

  const shouldFallbackToDesktopQr = (err: unknown, method: string, attempted: boolean): boolean => {
    if (attempted || !isMobileDevice()) return false
    const m = normalizeVisibleMethod(method) || method
    const reason =
      typeof err === 'object' && err && 'reason' in err && typeof err.reason === 'string' ? err.reason : ''
    const message = (
      err instanceof Error
        ? err.message
        : typeof err === 'object' && err && 'message' in err && typeof err.message === 'string'
          ? err.message
          : ''
    ).toLowerCase()
    if (m === 'wxpay') {
      return (
        [
          'WECHAT_H5_NOT_AUTHORIZED',
          'WECHAT_PAYMENT_MP_NOT_CONFIGURED',
          'WECHAT_JSAPI_FAILED',
          'PAYMENT_GATEWAY_ERROR',
          'UNHANDLED_PAYMENT_SCENARIO'
        ].includes(reason) ||
        message.includes('weixinjsbridge is unavailable') ||
        message.includes('wechat_jsapi_unavailable')
      )
    }
    if (m === 'alipay') return reason === 'PAYMENT_GATEWAY_ERROR' || reason === 'UNHANDLED_PAYMENT_SCENARIO'
    return false
  }

  const attemptMobileQrFallback = async (
    err: unknown,
    ctx: {
      orderAmount: number
      orderType: OrderType
      planId?: number
      paymentType: string
      attempted: boolean
    }
  ): Promise<boolean> => {
    if (!shouldFallbackToDesktopQr(err, ctx.paymentType, ctx.attempted)) return false
    try {
      const visibleMethod = normalizeVisibleMethod(ctx.paymentType) || ctx.paymentType
      const payload = buildCreateOrderPayload({
        amount: ctx.orderAmount,
        paymentType: visibleMethod,
        orderType: ctx.orderType,
        planId: ctx.planId,
        origin: window.location.origin,
        isMobile: false,
        isWechatBrowser: false
      })
      const result = (await usePaymentStore.getState().createOrder(payload)) as CreateOrderResult & {
        resume_token?: string
      }
      const stripeRouteUrl = result.client_secret
        ? resolveHref('/payment/stripe', {
            order_id: String(result.order_id),
            method: visibleMethod === 'wxpay' ? 'wechat_pay' : 'alipay',
            resume_token: result.resume_token || undefined
          })
        : ''
      const decision = decidePaymentLaunch(result, {
        visibleMethod,
        orderType: ctx.orderType,
        isMobile: false,
        isWechatBrowser: false,
        stripePopupUrl: stripeRouteUrl,
        stripeRouteUrl
      })
      if (decision.kind !== 'qr_waiting' || !decision.paymentState.qrCode) return false
      setErrorMessage('')
      setErrorHint('')
      setPaymentState(decision.paymentState)
      setPhase('paying')
      persist(decision.recovery)
      useAppStore.getState().showWarning(t('payment.errors.mobilePaymentFallbackToQr'))
      return true
    } catch {
      return false
    }
  }

  const createOrder = async (
    orderAmount: number,
    orderType: OrderType,
    planId?: number,
    options: CreateOrderOptions = {}
  ) => {
    setSubmitting(true)
    setErrorMessage('')
    setErrorHint('')
    const requestType =
      normalizeVisibleMethod(options.paymentType || selectedMethod) || options.paymentType || selectedMethod
    const ck = stateRef.current.checkout
    try {
      const payload = buildCreateOrderPayload({
        amount: orderAmount,
        paymentType: requestType,
        orderType,
        planId,
        origin: window.location.origin,
        isMobile: isMobileDevice(),
        isWechatBrowser: isWechatBrowser(),
        forceQRCode: !!(ck.alipay_force_qrcode && normalizeVisibleMethod(requestType) === 'alipay'),
        mobilePrecreateDeepLink: ck.alipay_mobile_precreate_deep_link === true
      })
      if (options.openid) payload.openid = options.openid
      if (options.wechatResumeToken) payload.wechat_resume_token = options.wechatResumeToken

      const result = (await usePaymentStore.getState().createOrder(payload)) as CreateOrderResult & {
        resume_token?: string
      }
      const openWindow = (url: string) => {
        const win = window.open(url, 'paymentPopup', getPaymentPopupFeatures())
        if (!win || win.closed) window.location.href = url
      }
      const visibleMethod = normalizeVisibleMethod(requestType) || requestType
      // 点击独立的 Stripe 按钮时 method 留空：落地页展示完整 Payment Element
      const stripeMethod =
        visibleMethod === 'stripe' ? '' : visibleMethod === 'wxpay' ? 'wechat_pay' : 'alipay'
      const stripeRouteUrl =
        result.client_secret && visibleMethod !== 'airwallex'
          ? resolveHref('/payment/stripe', {
              order_id: String(result.order_id),
              method: stripeMethod || undefined,
              resume_token: result.resume_token || undefined
            })
          : ''
      const airwallexRouteUrl =
        result.client_secret && result.intent_id
          ? resolveHref('/payment/airwallex', {
              order_id: String(result.order_id),
              out_trade_no: result.out_trade_no || undefined,
              resume_token: result.resume_token || undefined
            })
          : ''
      const decision = decidePaymentLaunch(result, {
        visibleMethod,
        orderType,
        isMobile: isMobileDevice(),
        isWechatBrowser: isWechatBrowser(),
        forceQRCode: !!(ck.alipay_force_qrcode && visibleMethod === 'alipay'),
        mobilePrecreateDeepLink: ck.alipay_mobile_precreate_deep_link === true,
        stripePopupUrl: stripeRouteUrl,
        stripeRouteUrl,
        airwallexRouteUrl
      })

      if (decision.kind === 'wechat_oauth' && decision.oauth?.authorize_url) {
        window.location.href = buildWechatOAuthAuthorizeUrl(decision.oauth.authorize_url, {
          paymentType: visibleMethod,
          orderType,
          planId,
          orderAmount
        })
        return
      }
      if (decision.kind === 'unhandled') {
        applyScenarioError({ reason: 'UNHANDLED_PAYMENT_SCENARIO' }, visibleMethod)
        return
      }

      setPaymentState(decision.paymentState)
      setPhase('paying')
      persist(decision.recovery)

      if (decision.kind === 'stripe_popup') return openWindow(decision.paymentState.payUrl)
      if (decision.kind === 'stripe_route' || decision.kind === 'airwallex_route') {
        window.location.href = decision.paymentState.payUrl
        return
      }
      if (decision.kind === 'wechat_jsapi' && decision.jsapi) {
        try {
          const jsapi = await invokeWechatJsapiPayment(decision.jsapi as Record<string, unknown>)
          const errMsg = String(jsapi.err_msg || '').toLowerCase()
          if (errMsg.includes('cancel')) {
            useAppStore.getState().showInfo(t('payment.qr.cancelled'))
            resetPayment()
          } else if (errMsg && !errMsg.includes('ok')) {
            resetPayment()
            const applied = await attemptMobileQrFallback(
              { reason: 'WECHAT_JSAPI_FAILED', message: errMsg },
              {
                orderAmount,
                orderType,
                planId,
                paymentType: visibleMethod,
                attempted: options.mobileQrFallbackAttempted === true
              }
            )
            if (!applied)
              applyScenarioError({ reason: 'WECHAT_JSAPI_FAILED', message: errMsg }, visibleMethod)
          } else {
            const resultState = { ...decision.paymentState }
            resetPayment()
            await redirectToResult(resultState)
          }
        } catch (err) {
          resetPayment()
          const applied = await attemptMobileQrFallback(err, {
            orderAmount,
            orderType,
            planId,
            paymentType: visibleMethod,
            attempted: options.mobileQrFallbackAttempted === true
          })
          if (!applied) throw err
        }
        return
      }
      if (decision.kind === 'redirect_waiting' && decision.paymentState.payUrl) {
        if (isMobileDevice()) {
          window.location.href = decision.paymentState.payUrl
          return
        }
        openWindow(decision.paymentState.payUrl)
      }
    } catch (err) {
      const apiErr = err as Record<string, unknown>
      let message = ''
      if (apiErr.reason === 'TOO_MANY_PENDING') {
        const metadata = apiErr.metadata as Record<string, unknown> | undefined
        message = t('payment.errors.tooManyPending', { max: String(metadata?.max || '') })
      } else if (apiErr.reason === 'CANCEL_RATE_LIMITED') {
        message = t('payment.errors.cancelRateLimited')
      } else if (
        await attemptMobileQrFallback(err, {
          orderAmount,
          orderType,
          planId,
          paymentType: requestType,
          attempted: options.mobileQrFallbackAttempted === true
        })
      ) {
        return
      } else {
        const handled = applyScenarioError(
          err,
          normalizeVisibleMethod(options.paymentType || selectedMethod) || selectedMethod
        )
        if (handled) return
        message = extractI18nErrorMessage(
          err,
          t,
          'payment.errors',
          extractApiErrorMessage(err, t('payment.result.failed'))
        )
      }
      setErrorMessage(message)
      setErrorHint('')
      showError(buildPaymentErrorToastMessage(message))
    } finally {
      setSubmitting(false)
    }
  }
  const createOrderRef = React.useRef(createOrder)
  React.useEffect(() => {
    createOrderRef.current = createOrder
  })

  // 初始化：加载 checkout → 支付方式排序 → 恢复进行中的支付 → 微信回跳 → 续费入口
  React.useEffect(() => {
    let cancelled = false
    const run = async () => {
      try {
        const res = await paymentAPI.getCheckoutInfo()
        if (cancelled) return
        // 兜底：缺失的集合字段按空处理，避免异常响应导致整页崩溃
        const info: CheckoutInfoResponse = {
          ...EMPTY_CHECKOUT,
          ...res.data,
          methods: res.data?.methods ?? {},
          plans: res.data?.plans ?? []
        }
        setCheckout(info)
        const methods = getVisibleMethods(info.methods)
        const enabled = Object.keys(methods)
        const order: readonly string[] = METHOD_ORDER
        const sorted = [...enabled].sort(
          (a, b) =>
            (order.indexOf(a) === -1 ? 999 : order.indexOf(a)) -
            (order.indexOf(b) === -1 ? 999 : order.indexOf(b))
        )
        if (sorted.length) setSelectedMethod(sorted[0])

        const query = queryFromSearch()
        if (hasWechatResumeQuery(query))
          clearPaymentRecoverySnapshot(window.localStorage, PAYMENT_RECOVERY_STORAGE_KEY)
        const routeResumeToken =
          typeof query.resume_token === 'string'
            ? query.resume_token
            : typeof query.wechat_resume_token === 'string'
              ? query.wechat_resume_token
              : undefined
        const restored = readPaymentRecoverySnapshot(
          window.localStorage.getItem(PAYMENT_RECOVERY_STORAGE_KEY),
          { resumeToken: routeResumeToken }
        )
        if (restored) {
          setPaymentState(restored)
          setPhase('paying')
          const restoredMethod =
            normalizeVisibleMethod(restored.paymentType) ||
            (methods[restored.paymentType] ? restored.paymentType : '')
          if (restoredMethod) setSelectedMethod(restoredMethod)
        } else {
          clearPaymentRecoverySnapshot(window.localStorage, PAYMENT_RECOVERY_STORAGE_KEY)
        }

        // 微信 OAuth 回跳：恢复金额 / 套餐并自动下单
        const resume = parseWechatResumeRoute(query, info.plans, stateRef.current.amount ?? 0)
        if (resume) {
          setSelectedMethod(resume.paymentType)
          if (resume.orderType === 'balance' && resume.orderAmount > 0) setAmount(resume.orderAmount)
          if (resume.orderType === 'subscription' && resume.planId)
            setSelectedPlan(info.plans.find((p) => p.id === resume.planId) ?? null)
          const stripped = stripWechatResumeQuery(query)
          const search = new URLSearchParams()
          for (const [k, v] of Object.entries(stripped)) if (typeof v === 'string' && v) search.set(k, v)
          await router.replace({ pathname: router.pathname, query: Object.fromEntries(search) }, undefined, {
            shallow: true
          })
          if (resume.wechatResumeToken) {
            await createOrderRef.current(0, resume.orderType, resume.planId, {
              wechatResumeToken: resume.wechatResumeToken,
              paymentType: resume.paymentType,
              isResume: true
            })
          } else if (resume.orderAmount > 0 && resume.openid) {
            await createOrderRef.current(resume.orderAmount, resume.orderType, resume.planId, {
              openid: resume.openid,
              paymentType: resume.paymentType,
              isResume: true
            })
          }
        }

        // 续费入口：?tab=subscription&group=123（订阅关闭时忽略）
        const subOn = resolveFeatureFlag(
          useAppStore.getState().cachedPublicSettings,
          FeatureFlags.subscription
        )
        if (query.tab === 'subscription' && subOn) {
          setActiveTab('subscription')
          if (query.group) {
            const groupId = Number(query.group)
            const groupPlans = info.plans.filter((p) => p.group_id === groupId)
            if (groupPlans.length === 1) setSelectedPlan(groupPlans[0])
            else if (groupPlans.length > 1) setRenewGroupId(groupId)
          }
        }
      } catch (err) {
        showError(extractI18nErrorMessage(err, t, 'payment.errors', t('common.error')))
      } finally {
        if (!cancelled) setLoading(false)
      }
      if (resolveFeatureFlag(useAppStore.getState().cachedPublicSettings, FeatureFlags.subscription)) {
        fetchActiveSubscriptions().catch(() => {})
      }
    }
    void run()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅挂载时执行一次初始化
  }, [])

  const onPaymentDone = () => {
    const wasSubscription = paymentState.orderType === 'subscription'
    resetPayment()
    setSelectedPlan(null)
    if (wasSubscription) fetchActiveSubscriptions(true).catch(() => {})
  }
  const onPaymentSuccess = async () => {
    const completed = { ...paymentState }
    removeSnapshot()
    void refreshUser().catch(() => undefined)
    if (paymentState.orderType === 'subscription') fetchActiveSubscriptions(true).catch(() => {})
    await redirectToResult(completed)
  }

  const helpHtml = React.useMemo(() => renderMarkdownSafe(checkout.help_text || ''), [checkout.help_text])
  const bonusNoticeHtml = React.useMemo(
    () => renderMarkdownSafe((checkout.recharge_bonus_notice || '').trim()),
    [checkout.recharge_bonus_notice]
  )
  const renewalPlans = renewGroupId == null ? [] : checkout.plans.filter((p) => p.group_id === renewGroupId)
  const payButtonClass = METHOD_BUTTON(selectedMethod)
  const utcOffset = settings?.server_utc_offset
  const planGridClass =
    checkout.plans.length <= 2
      ? 'grid grid-cols-1 gap-5 sm:grid-cols-2'
      : 'grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3'

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24" role="status" aria-label={t('common.loading')}>
        <Loader2 className="size-8 animate-spin text-primary" aria-hidden />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader title={t('payment.title')} />

      {tabs.length > 1 && phase === 'select' && !selectedPlan ? (
        <div role="tablist" className="flex gap-1 rounded-lg bg-muted p-1">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              role="tab"
              aria-selected={activeTab === tab.key}
              className={cn(
                'flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors',
                activeTab === tab.key ? 'bg-card shadow-xs' : 'text-muted-foreground hover:text-foreground'
              )}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      ) : null}

      {phase === 'paying' ? (
        <PaymentStatusPanel
          orderId={paymentState.orderId}
          amount={paymentState.amount}
          payAmount={paymentState.payAmount}
          qrCode={paymentState.qrCode}
          expiresAt={paymentState.expiresAt}
          paymentType={paymentState.paymentType}
          payUrl={paymentState.payUrl}
          orderType={paymentState.orderType}
          currency={paymentState.currency || currency}
          outTradeNo={paymentState.outTradeNo}
          mobileAlipayDeepLink={paymentState.alipayMobilePrecreateDeepLink}
          onDone={onPaymentDone}
          onSuccess={() => void onPaymentSuccess()}
          onSettled={removeSnapshot}
        />
      ) : tabs.length === 0 ? (
        <Card>
          <EmptyState title={t('payment.billingUnavailable')} />
        </Card>
      ) : activeTab === 'recharge' ? (
        <>
          <Card className="p-5">
            <p className="text-xs font-medium text-muted-foreground">{t('payment.rechargeAccount')}</p>
            <p className="mt-1 text-base font-semibold">{user?.username || ''}</p>
            <p className="mt-0.5 text-sm font-medium text-success">
              {t('payment.currentBalance')}: {user?.balance?.toFixed(2) || '0.00'}
            </p>
          </Card>
          {enabledMethods.length === 0 ? (
            <Card>
              <EmptyState title={t('payment.notAvailable')} />
            </Card>
          ) : (
            <>
              <Card className="p-6">
                {bonusNoticeHtml ? (
                  // 内容由管理员配置的 Markdown，经 DOMPurify 清洗后渲染
                  <div
                    data-testid="recharge-bonus-notice"
                    className="markdown-body mb-5 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm"
                    dangerouslySetInnerHTML={{ __html: bonusNoticeHtml }}
                  />
                ) : null}
                <AmountInput
                  value={amount}
                  onChange={setAmount}
                  min={minAmount}
                  max={maxAmount}
                  bonusTiers={bonusTiers}
                  bonusMode={bonusMode}
                  multiplier={rechargeMultiplier}
                  currency={currency}
                />
                {amountError ? <p className="mt-2 text-xs text-warning">{amountError}</p> : null}
              </Card>
              <Card className="p-6">
                <PaymentMethodSelector
                  methods={methodOptions}
                  selected={selectedMethod}
                  onSelect={setSelectedMethod}
                />
              </Card>
              {validAmount > 0 ? (
                <Card className="space-y-2 p-6 text-sm">
                  <Row
                    label={t('payment.paymentAmount')}
                    value={
                      <span className={discount > 0 ? 'text-muted-foreground line-through' : ''}>
                        {fmt(validAmount)}
                      </span>
                    }
                  />
                  {discount > 0 ? (
                    <Row
                      testId="recharge-discount-row"
                      label={t('payment.rechargeBonus.discountLabelWithPercent', {
                        percent: formatRechargeBonusNumber(quote.percent)
                      })}
                      value={<span className="font-medium text-destructive">-{fmt(discount)}</span>}
                    />
                  ) : null}
                  {feeRate > 0 ? (
                    <Row label={`${t('payment.fee')} (${feeRate}%)`} value={fmt(feeAmount)} />
                  ) : null}
                  {showActualPay ? (
                    <Row
                      className="border-t pt-2"
                      label={<b className="font-medium text-foreground">{t('payment.actualPay')}</b>}
                      value={<span className="text-lg font-semibold text-primary">{fmt(totalAmount)}</span>}
                    />
                  ) : null}
                  {showBonusRow ? (
                    <Row
                      testId="recharge-bonus-row"
                      className={cn(!showActualPay && 'border-t pt-2')}
                      label={t('payment.rechargeBonus.amountLabelWithPercent', {
                        percent: formatRechargeBonusNumber(quote.percent)
                      })}
                      value={<span className="font-medium text-destructive">+${quote.bonus.toFixed(2)}</span>}
                    />
                  ) : null}
                  {showCredited ? (
                    <Row
                      testId="recharge-credited-row"
                      className={cn(!showActualPay && !showBonusRow && 'border-t pt-2')}
                      label={t('payment.creditedBalance')}
                      value={
                        <span className={quote.percent > 0 ? 'font-semibold' : ''}>
                          ${credited.toFixed(2)}
                        </span>
                      }
                    />
                  ) : null}
                  {rechargeMultiplier !== 1 ? (
                    <p className="border-t pt-2 text-xs text-muted-foreground">
                      {t('payment.rechargeRatePreview', {
                        currency,
                        usd: formatBalanceRechargeMultiplier(rechargeMultiplier)
                      })}
                    </p>
                  ) : null}
                </Card>
              ) : null}
              {errorMessage ? (
                <p
                  role="alert"
                  className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
                >
                  {errorMessage} {errorHint}
                </p>
              ) : null}
              <Button
                size="lg"
                className={cn('w-full', payButtonClass)}
                disabled={!canSubmit}
                loading={submitting}
                onClick={() => canSubmit && !submitting && void createOrder(validAmount, 'balance')}
              >
                {submitting ? t('common.processing') : `${t('payment.createOrder')} ${fmt(totalAmount)}`}
              </Button>
            </>
          )}
        </>
      ) : selectedPlan ? (
        <>
          <Card className="p-5">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  'rounded-md border px-2 py-0.5 text-xs font-medium',
                  platformBadgeClass(selectedPlan.group_platform || '')
                )}
              >
                {platformLabel(selectedPlan.group_platform || '')}
              </span>
              <h3 className="text-lg font-semibold">{selectedPlan.name}</h3>
            </div>
            <div className="flex items-baseline gap-2">
              {selectedPlan.original_price ? (
                <span className="tabular text-sm text-muted-foreground line-through">
                  {fmtSub(selectedPlan.original_price)}
                </span>
              ) : null}
              <span
                className={cn(
                  'tabular text-3xl font-semibold',
                  platformTextClass(selectedPlan.group_platform || '')
                )}
              >
                {fmtSub(selectedPlan.price)}
              </span>
              <span className="text-sm text-muted-foreground">/ {planValiditySuffix(selectedPlan, t)}</span>
            </div>
            {selectedPlan.description ? (
              <p className="mt-2 text-sm text-muted-foreground">{selectedPlan.description}</p>
            ) : null}
            <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">{t('payment.planCard.rate')}</dt>
                <dd className="text-lg font-semibold">×{selectedPlan.rate_multiplier ?? 1}</dd>
              </div>
              {hasPeakRate(selectedPlan) ? (
                <div>
                  <dt className="text-xs text-muted-foreground">{t('payment.planCard.peakRate')}</dt>
                  <dd className="font-semibold text-warning">
                    {formatPeakRateWindow(selectedPlan, serverTimezoneLabel(utcOffset))}
                  </dd>
                </div>
              ) : null}
              {selectedPlan.daily_limit_usd != null ? (
                <div>
                  <dt className="text-xs text-muted-foreground">{t('payment.planCard.dailyLimit')}</dt>
                  <dd className="text-lg font-semibold">${selectedPlan.daily_limit_usd}</dd>
                </div>
              ) : null}
              {selectedPlan.weekly_limit_usd != null ? (
                <div>
                  <dt className="text-xs text-muted-foreground">{t('payment.planCard.weeklyLimit')}</dt>
                  <dd className="text-lg font-semibold">${selectedPlan.weekly_limit_usd}</dd>
                </div>
              ) : null}
              {selectedPlan.monthly_limit_usd != null ? (
                <div>
                  <dt className="text-xs text-muted-foreground">{t('payment.planCard.monthlyLimit')}</dt>
                  <dd className="text-lg font-semibold">${selectedPlan.monthly_limit_usd}</dd>
                </div>
              ) : null}
              {selectedPlan.daily_limit_usd == null &&
              selectedPlan.weekly_limit_usd == null &&
              selectedPlan.monthly_limit_usd == null ? (
                <div>
                  <dt className="text-xs text-muted-foreground">{t('payment.planCard.quota')}</dt>
                  <dd className="text-lg font-semibold">{t('payment.planCard.unlimited')}</dd>
                </div>
              ) : null}
            </dl>
          </Card>
          {enabledMethods.length >= 1 ? (
            <Card className="p-6">
              <PaymentMethodSelector
                methods={subMethodOptions}
                selected={selectedMethod}
                onSelect={setSelectedMethod}
              />
            </Card>
          ) : null}
          {feeRate > 0 && selectedPlan.price > 0 ? (
            <Card className="space-y-2 p-6 text-sm">
              <Row label={t('payment.amountLabel')} value={fmt(subPay)} />
              <Row label={`${t('payment.fee')} (${feeRate}%)`} value={fmt(subFee)} />
              <Row
                className="border-t pt-2"
                label={<b className="font-medium text-foreground">{t('payment.actualPay')}</b>}
                value={<span className="text-lg font-semibold text-primary">{fmt(subTotal)}</span>}
              />
            </Card>
          ) : null}
          {errorMessage ? (
            <p
              role="alert"
              className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
            >
              {errorMessage} {errorHint}
            </p>
          ) : null}
          <Button
            size="lg"
            className={cn('w-full', payButtonClass)}
            disabled={!canSubmitSub}
            loading={submitting}
            onClick={() =>
              canSubmitSub &&
              !submitting &&
              void createOrder(selectedPlan.price, 'subscription', selectedPlan.id)
            }
          >
            {submitting ? t('common.processing') : `${t('payment.createOrder')} ${fmt(subTotal)}`}
          </Button>
          <Button variant="outline" className="w-full" onClick={() => setSelectedPlan(null)}>
            {t('common.cancel')}
          </Button>
        </>
      ) : (
        <>
          {checkout.plans.length === 0 ? (
            <Card>
              <EmptyState icon={Gift} title={t('payment.noPlans')} />
            </Card>
          ) : (
            <div className={planGridClass}>
              {checkout.plans.map((plan) => (
                <SubscriptionPlanCard
                  key={plan.id}
                  plan={plan}
                  activeSubscriptions={activeSubscriptions}
                  onSelect={(p) => {
                    setSelectedPlan(p)
                    setErrorMessage('')
                  }}
                />
              ))}
            </div>
          )}
          {activeSubscriptions.length > 0 ? (
            <div>
              <p className="mb-2 text-xs font-medium text-muted-foreground">
                {t('payment.activeSubscription')}
              </p>
              <ul className="space-y-2">
                {activeSubscriptions.map((sub) => (
                  <li key={sub.id} className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2">
                    <span
                      className={cn(
                        'h-6 w-1 shrink-0 rounded-full',
                        platformAccentBarClass(sub.group?.platform || '')
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-xs font-semibold">
                          {sub.group?.name || t('payment.groupFallback', { id: sub.group_id })}
                        </span>
                        <span
                          className={cn(
                            'shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-medium',
                            platformBadgeLightClass(sub.group?.platform || '')
                          )}
                        >
                          {platformLabel(sub.group?.platform || '')}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-x-3 text-[11px] text-muted-foreground">
                        <span>
                          {t('payment.planCard.rate')}: ×{sub.group?.rate_multiplier ?? 1}
                        </span>
                        {sub.group && hasPeakRate(sub.group) ? (
                          <span>
                            {t('payment.planCard.peakRate')}:{' '}
                            {formatPeakRateWindow(sub.group, serverTimezoneLabel(utcOffset))}
                          </span>
                        ) : null}
                        {sub.expires_at ? (
                          <span>
                            {t('userSubscriptions.daysRemaining', { days: daysRemaining(sub.expires_at) })}
                          </span>
                        ) : (
                          <span>{t('userSubscriptions.noExpiration')}</span>
                        )}
                      </div>
                    </div>
                    <span className="shrink-0 rounded-md bg-success/12 px-2 py-0.5 text-[10px] font-medium text-success">
                      {t('userSubscriptions.status.active')}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      )}

      {(checkout.help_text || checkout.help_image_url) && phase === 'select' && !selectedPlan ? (
        <Card className="p-4">
          <div className="flex flex-col items-center gap-3">
            {checkout.help_image_url ? (
              <button
                type="button"
                onClick={() => setPreviewImage(checkout.help_image_url)}
                aria-label={t('common.close')}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- 管理员配置的外部图片 */}
                <img
                  src={checkout.help_image_url}
                  alt=""
                  className="h-40 max-w-full rounded-lg object-contain transition-opacity hover:opacity-80"
                />
              </button>
            ) : null}
            {helpHtml ? (
              <div
                className="markdown-body w-full overflow-x-auto break-words"
                dangerouslySetInnerHTML={{ __html: helpHtml }}
              />
            ) : null}
          </div>
        </Card>
      ) : null}

      <Dialog open={renewGroupId != null} onOpenChange={(o) => !o && setRenewGroupId(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('payment.selectPlan')}</DialogTitle>
            <DialogDescription className="sr-only">{t('payment.selectPlan')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {renewalPlans.map((plan) => (
              <SubscriptionPlanCard
                key={plan.id}
                plan={plan}
                activeSubscriptions={activeSubscriptions}
                onSelect={(p) => {
                  setRenewGroupId(null)
                  setSelectedPlan(p)
                  setErrorMessage('')
                }}
              />
            ))}
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={!!previewImage} onOpenChange={(o) => !o && setPreviewImage('')}>
        <DialogContent className="max-w-[90vw] border-0 bg-transparent p-0 shadow-none sm:max-w-3xl">
          <DialogTitle className="sr-only">{t('common.close')}</DialogTitle>
          <DialogDescription className="sr-only">{t('common.close')}</DialogDescription>
          {/* eslint-disable-next-line @next/next/no-img-element -- 管理员配置的外部图片 */}
          <img
            src={previewImage}
            alt=""
            className="max-h-[85vh] max-w-full rounded-xl object-contain shadow-2xl"
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}
