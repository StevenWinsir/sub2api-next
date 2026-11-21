import { Check } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { t } from '@/i18n'
import { useAppStore } from '@/stores/app'
import type { UserSubscription } from '@/types'
import type { SubscriptionPlan } from '@/types/payment'
import { formatPeakRateWindow, hasPeakRate, serverTimezoneLabel } from '@/utils/peak-rate'
import { platformBadgeLightClass, platformLabel } from '@/utils/platformColors'
import { cn } from '@/lib/utils'
import { currencySymbol } from './currency'
import { planValiditySuffix } from './validity'

const MODEL_SCOPE_LABELS: Record<string, string> = {
  claude: 'Claude',
  gemini_text: 'Gemini',
  gemini_image: 'Imagen'
}

export function discountText(plan: Pick<SubscriptionPlan, 'price' | 'original_price'>): string {
  if (!plan.original_price || plan.original_price <= 0) return ''
  const pct = Math.round((1 - plan.price / plan.original_price) * 100)
  return pct > 0 ? `-${pct}%` : ''
}

/** 订阅套餐卡：价格 / 折扣 / 倍率 / 高峰倍率 / 额度窗口 / 功能列表 + 购买 / 续费按钮。 */
export function SubscriptionPlanCard({
  plan,
  activeSubscriptions,
  onSelect
}: {
  plan: SubscriptionPlan
  activeSubscriptions?: UserSubscription[]
  onSelect: (p: SubscriptionPlan) => void
}) {
  const utcOffset = useAppStore((s) => s.cachedPublicSettings?.server_utc_offset)
  const platform = plan.group_platform || ''
  const isRenewal =
    activeSubscriptions?.some((s) => s.group_id === plan.group_id && s.status === 'active') ?? false
  const discount = discountText(plan)
  const symbol = currencySymbol(plan.currency || 'USD')
  const rate = `×${Number((plan.rate_multiplier ?? 1).toPrecision(10))}`
  const scopes =
    platform === 'antigravity'
      ? (plan.supported_model_scopes ?? []).map((s) => MODEL_SCOPE_LABELS[s] || s)
      : []
  const limits: [string, number | null | undefined][] = [
    [t('payment.planCard.dailyLimit'), plan.daily_limit_usd],
    [t('payment.planCard.weeklyLimit'), plan.weekly_limit_usd],
    [t('payment.planCard.monthlyLimit'), plan.monthly_limit_usd]
  ]
  const hasLimit = limits.some(([, v]) => v != null)

  return (
    <Card className="flex flex-col overflow-hidden">
      <div className="flex flex-1 flex-col gap-4 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={cn(
              'rounded-md border px-2 py-0.5 text-xs font-medium',
              platformBadgeLightClass(platform)
            )}
          >
            {platformLabel(platform)}
          </span>
          {isRenewal ? <Badge variant="success">{t('userSubscriptions.status.active')}</Badge> : null}
        </div>
        <div>
          <h3 className="text-lg font-semibold">{plan.name}</h3>
          {plan.description ? <p className="mt-1 text-sm text-muted-foreground">{plan.description}</p> : null}
        </div>
        <div className="flex flex-wrap items-baseline gap-2">
          {plan.original_price ? (
            <span className="tabular text-sm text-muted-foreground line-through">
              {symbol}
              {plan.original_price}
            </span>
          ) : null}
          <span className="tabular text-3xl font-semibold tracking-tight">
            {symbol}
            {plan.price}
          </span>
          <span className="text-sm text-muted-foreground">/ {planValiditySuffix(plan, t)}</span>
          {discount ? <Badge variant="destructive">{discount}</Badge> : null}
        </div>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-xs text-muted-foreground">{t('payment.planCard.rate')}</dt>
            <dd className="font-semibold">{rate}</dd>
          </div>
          {hasPeakRate(plan) ? (
            <div>
              <dt className="text-xs text-muted-foreground">{t('payment.planCard.peakRate')}</dt>
              <dd className="font-semibold text-warning">
                {formatPeakRateWindow(plan, serverTimezoneLabel(utcOffset))}
              </dd>
            </div>
          ) : null}
          {limits.map(([label, v]) =>
            v != null ? (
              <div key={label}>
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="tabular font-semibold">${v}</dd>
              </div>
            ) : null
          )}
          {!hasLimit ? (
            <div>
              <dt className="text-xs text-muted-foreground">{t('payment.planCard.quota')}</dt>
              <dd className="font-semibold">{t('payment.planCard.unlimited')}</dd>
            </div>
          ) : null}
        </dl>
        {scopes.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {scopes.map((s) => (
              <Badge key={s} variant="secondary">
                {s}
              </Badge>
            ))}
          </div>
        ) : null}
        {plan.features?.length ? (
          <ul className="space-y-1.5 text-sm">
            {plan.features.map((f) => (
              <li key={f} className="flex items-start gap-2">
                <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
                <span>{f}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <div className="border-t p-4">
        <Button className="w-full" onClick={() => onSelect(plan)}>
          {isRenewal ? t('payment.renewNow') : t('payment.subscribeNow')}
        </Button>
      </div>
    </Card>
  )
}
