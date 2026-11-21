import * as React from 'react'
import Link from 'next/link'
import { Crown } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Progress } from '@/components/ui/progress'
import { t } from '@/i18n'
import { cn } from '@/lib/utils'
import { useSubscriptionStore } from '@/stores/subscriptions'
import type { UserSubscription } from '@/types'
import { getExpirationDateRelation } from '@/utils/subscriptionQuota'

/** 订阅在日 / 周 / 月额度中的最高使用率（%）。 */
export function maxUsagePercentage(sub: UserSubscription): number {
  const p: number[] = []
  if (sub.group?.daily_limit_usd) p.push(((sub.daily_usage_usd || 0) / sub.group.daily_limit_usd) * 100)
  if (sub.group?.weekly_limit_usd) p.push(((sub.weekly_usage_usd || 0) / sub.group.weekly_limit_usd) * 100)
  if (sub.group?.monthly_limit_usd) p.push(((sub.monthly_usage_usd || 0) / sub.group.monthly_limit_usd) * 100)
  return p.length > 0 ? Math.max(...p) : 0
}

export const isUnlimitedSubscription = (sub: UserSubscription): boolean =>
  !sub.group?.daily_limit_usd && !sub.group?.weekly_limit_usd && !sub.group?.monthly_limit_usd

const tone = (pct: number) => (pct >= 90 ? 'destructive' : pct >= 70 ? 'warning' : 'success')
const DOT = { destructive: 'bg-destructive', warning: 'bg-warning', success: 'bg-success' }
const BAR = {
  destructive: '[&>div]:bg-destructive',
  warning: '[&>div]:bg-warning',
  success: '[&>div]:bg-success'
}

function daysRemainingText(expiresAt: string): string {
  const now = new Date()
  const expires = new Date(expiresAt)
  const relation = getExpirationDateRelation(expires, now)
  if (relation === 'expired') return t('subscriptionProgress.expired')
  if (relation === 'today') return t('subscriptionProgress.expiresToday')
  if (relation === 'tomorrow') return t('subscriptionProgress.expiresTomorrow')
  return t('subscriptionProgress.daysRemaining', {
    days: Math.ceil((expires.getTime() - now.getTime()) / 86400000)
  })
}

/** 顶栏订阅进度：圆点按最高使用率变色；展开显示各订阅额度进度与到期。 */
export function SubscriptionProgressMini() {
  const subs = useSubscriptionStore((s) => s.activeSubscriptions)
  const sorted = React.useMemo(
    () => [...subs].sort((a, b) => maxUsagePercentage(b) - maxUsagePercentage(a)),
    [subs]
  )
  if (sorted.length === 0) return null
  const worst = tone(maxUsagePercentage(sorted[0]))
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="relative flex size-9 items-center justify-center rounded-md hover:bg-muted"
          aria-label={t('subscriptionProgress.title')}
          title={t('subscriptionProgress.activeCount', { count: sorted.length })}
        >
          <Crown className="size-4" aria-hidden />
          <span
            className={cn(
              'absolute right-1.5 top-1.5 size-2 rounded-full',
              isUnlimitedSubscription(sorted[0]) ? 'bg-success' : DOT[worst]
            )}
            aria-hidden
          />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="border-b px-4 py-2.5 text-sm font-semibold">{t('subscriptionProgress.title')}</div>
        <ul className="max-h-80 divide-y overflow-y-auto">
          {sorted.map((s) => {
            const windows: [string, number, number | null | undefined][] = [
              [t('subscriptionProgress.daily'), s.daily_usage_usd, s.group?.daily_limit_usd],
              [t('subscriptionProgress.weekly'), s.weekly_usage_usd, s.group?.weekly_limit_usd],
              [t('subscriptionProgress.monthly'), s.monthly_usage_usd, s.group?.monthly_limit_usd]
            ]
            return (
              <li key={s.id} className="space-y-2 px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium">{s.group?.name ?? `#${s.group_id}`}</span>
                  {s.expires_at ? (
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {daysRemainingText(s.expires_at)}
                    </span>
                  ) : null}
                </div>
                {isUnlimitedSubscription(s) ? (
                  <p className="text-xs text-success">{t('subscriptionProgress.unlimited')}</p>
                ) : (
                  windows.map(([label, used, limit]) =>
                    limit ? (
                      <div key={label} className="space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">{label}</span>
                          <span className="tabular">{`$${(used || 0).toFixed(2)}/$${limit.toFixed(2)}`}</span>
                        </div>
                        <Progress
                          value={Math.min(((used || 0) / limit) * 100, 100)}
                          className={cn('h-1.5', BAR[tone(((used || 0) / limit) * 100)])}
                        />
                      </div>
                    ) : null
                  )
                )}
              </li>
            )
          })}
        </ul>
        <Link
          href="/subscriptions"
          className="block border-t px-4 py-2.5 text-center text-sm font-medium text-primary hover:bg-muted"
        >
          {t('subscriptionProgress.viewAll')}
        </Link>
      </PopoverContent>
    </Popover>
  )
}
