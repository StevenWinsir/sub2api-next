import { cn } from '@/lib/utils'
import { t } from '@/i18n'
import { METHOD_ORDER, isBuiltInAlipayMethod, isBuiltInWxpayMethod } from './providerConfig'

export interface PaymentMethodOption {
  type: string
  display_name?: string
  fee_rate: number
  available: boolean
}

// 图标放在 public/static/payment（不得使用保留路径 images/）
const ICONS: Record<string, string> = {
  alipay: '/static/payment/alipay.svg',
  wxpay: '/static/payment/wxpay.svg',
  stripe: '/static/payment/stripe.svg',
  airwallex: '/static/payment/airwallex.svg',
  credit_card: '/static/payment/payment.svg'
}

export function methodIcon(type: string): string {
  if (isBuiltInAlipayMethod(type)) return ICONS.alipay
  if (isBuiltInWxpayMethod(type)) return ICONS.wxpay
  return ICONS[type] || ICONS.credit_card
}

export function methodLabel(m: Pick<PaymentMethodOption, 'type' | 'display_name'>): string {
  if (m.display_name) return m.display_name
  const key = `payment.methods.${m.type}`
  const translated = t(key)
  return translated === key ? m.type : translated
}

const SELECTED: Record<string, string> = {
  alipay: 'border-[#02A9F1] bg-[#02A9F1]/10',
  wxpay: 'border-[#09BB07] bg-[#09BB07]/10',
  stripe: 'border-[#676BE5] bg-[#676BE5]/10',
  airwallex: 'border-[#FF6B3D] bg-[#FF6B3D]/10'
}
function selectedClass(type: string): string {
  if (isBuiltInAlipayMethod(type)) return SELECTED.alipay
  if (isBuiltInWxpayMethod(type)) return SELECTED.wxpay
  return SELECTED[type] ?? 'border-primary bg-accent'
}

export function PaymentMethodSelector({
  methods,
  selected,
  onSelect
}: {
  methods: PaymentMethodOption[]
  selected: string
  onSelect: (type: string) => void
}) {
  const order: readonly string[] = METHOD_ORDER
  const sorted = [...methods].sort(
    (a, b) =>
      (order.indexOf(a.type) === -1 ? 999 : order.indexOf(a.type)) -
      (order.indexOf(b.type) === -1 ? 999 : order.indexOf(b.type))
  )
  return (
    <div>
      <p className="mb-2 text-sm font-medium">{t('payment.paymentMethod')}</p>
      <div
        data-testid="payment-method-grid"
        role="radiogroup"
        aria-label={t('payment.paymentMethod')}
        className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
      >
        {sorted.map((m) => (
          <button
            key={m.type}
            type="button"
            role="radio"
            aria-checked={selected === m.type}
            title={methodLabel(m)}
            disabled={!m.available}
            onClick={() => m.available && onSelect(m.type)}
            className={cn(
              'relative flex h-[60px] min-w-0 items-center justify-center gap-2 rounded-lg border px-3 transition-colors',
              !m.available
                ? 'cursor-not-allowed opacity-50'
                : selected === m.type
                  ? cn(selectedClass(m.type), 'shadow-xs')
                  : 'bg-card hover:border-foreground/30'
            )}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- 静态导出，已关闭图片优化 */}
            <img src={methodIcon(m.type)} alt="" className="size-7 shrink-0 object-contain" />
            <span className="flex min-w-0 flex-col items-start leading-none">
              <span
                data-testid="payment-method-label"
                className="block w-full truncate text-base font-semibold"
              >
                {methodLabel(m)}
              </span>
              {m.fee_rate > 0 ? (
                <span className="mt-1 text-[10px] tracking-wide text-muted-foreground">
                  {t('payment.fee')} {m.fee_rate}%
                </span>
              ) : null}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
