/** /subscriptions：我的订阅（分组、到期、日 / 周 / 月额度进度）。 */
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { Crown } from 'lucide-react'
import subscriptionsAPI from '@/api/subscriptions'
import { EmptyState } from '@/components/EmptyState'
import { PageHeader } from '@/components/PageHeader'
import { PlatformIcon } from '@/components/PlatformIcon'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { t } from '@/i18n'
import { useLocale } from '@/i18n/react'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/stores/app'
import type { UserSubscription } from '@/types'
import { formatPeakRateWindow, hasPeakRate, serverTimezoneLabel } from '@/utils/peak-rate'
import { platformLabel } from '@/utils/platformColors'
import {
  expirationTone,
  formatDailyUsageWindow,
  formatExpirationDate,
  formatResetTime,
  progressPercent,
  progressTone
} from './subscriptionFormat'

const TONE_BAR = {
  muted: '[&>div]:bg-muted-foreground',
  destructive: '[&>div]:bg-destructive',
  warning: '[&>div]:bg-warning',
  success: '[&>div]:bg-success'
}

function Window({
  label,
  used,
  limit,
  reset
}: {
  label: string
  used: number
  limit: number
  reset?: string
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className="tabular text-muted-foreground">
          ${(used || 0).toFixed(2)} / ${limit.toFixed(2)}
        </span>
      </div>
      <Progress value={progressPercent(used, limit)} className={TONE_BAR[progressTone(used, limit)]} />
      {reset ? <p className="text-xs text-muted-foreground">{reset}</p> : null}
    </div>
  )
}

function SubscriptionCard({ sub }: { sub: UserSubscription }) {
  const utcOffset = useAppStore((s) => s.cachedPublicSettings?.server_utc_offset)
  const g = sub.group
  const tone = sub.expires_at ? expirationTone(sub.expires_at) : 'normal'
  const unlimited = !g?.daily_limit_usd && !g?.weekly_limit_usd && !g?.monthly_limit_usd
  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            {g ? <PlatformIcon platform={g.platform} size="md" /> : null}
            <div>
              <h3 className="text-base font-semibold">{g?.name ?? `#${sub.group_id}`}</h3>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
                {g ? <span>{platformLabel(g.platform)}</span> : null}
                <span>
                  {t('payment.planCard.rate')}: ×{g?.rate_multiplier ?? 1}
                </span>
                {g && hasPeakRate(g) ? (
                  <span>
                    {t('payment.planCard.peakRate')}:{' '}
                    {formatPeakRateWindow(g, serverTimezoneLabel(utcOffset))}
                  </span>
                ) : null}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge
              variant={
                sub.status === 'active' ? 'success' : sub.status === 'expired' ? 'destructive' : 'secondary'
              }
            >
              {t(`userSubscriptions.status.${sub.status}`)}
            </Badge>
            <Button asChild size="sm" variant="outline">
              <Link
                href={{ pathname: '/purchase', query: { tab: 'subscription', group: String(sub.group_id) } }}
              >
                {t('payment.renewNow')}
              </Link>
            </Button>
          </div>
        </div>

        <p className="text-sm">
          <span className="text-muted-foreground">{t('userSubscriptions.expires')}: </span>
          {sub.expires_at ? (
            <span
              className={cn(
                tone === 'destructive' && 'font-medium text-destructive',
                tone === 'warning' && 'text-warning'
              )}
            >
              {formatExpirationDate(sub.expires_at)}
            </span>
          ) : (
            <span>{t('userSubscriptions.noExpiration')}</span>
          )}
        </p>

        <div className="space-y-4">
          {g?.daily_limit_usd ? (
            <Window
              label={t('userSubscriptions.daily')}
              used={sub.daily_usage_usd}
              limit={g.daily_limit_usd}
              reset={sub.daily_window_start || sub.expires_at ? formatDailyUsageWindow(sub) : undefined}
            />
          ) : null}
          {g?.weekly_limit_usd ? (
            <Window
              label={t('userSubscriptions.weekly')}
              used={sub.weekly_usage_usd}
              limit={g.weekly_limit_usd}
              reset={
                sub.weekly_window_start
                  ? t('userSubscriptions.resetIn', { time: formatResetTime(sub.weekly_window_start, 168) })
                  : undefined
              }
            />
          ) : null}
          {g?.monthly_limit_usd ? (
            <Window
              label={t('userSubscriptions.monthly')}
              used={sub.monthly_usage_usd}
              limit={g.monthly_limit_usd}
              reset={
                sub.monthly_window_start
                  ? t('userSubscriptions.resetIn', { time: formatResetTime(sub.monthly_window_start, 720) })
                  : undefined
              }
            />
          ) : null}
          {unlimited ? (
            <div className="flex items-center gap-2 rounded-lg bg-success/10 p-3 text-sm">
              <Crown className="size-4 text-success" aria-hidden />
              <div>
                <p className="font-medium">{t('userSubscriptions.unlimited')}</p>
                <p className="text-xs text-muted-foreground">{t('userSubscriptions.unlimitedDesc')}</p>
              </div>
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  )
}

export function SubscriptionsPage() {
  useLocale()
  const q = useQuery({
    queryKey: ['user', 'subscriptions'],
    queryFn: async () => {
      try {
        return await subscriptionsAPI.getMySubscriptions()
      } catch (error) {
        console.error('Failed to load subscriptions:', error)
        useAppStore.getState().showError(t('userSubscriptions.failedToLoad'))
        throw error
      }
    }
  })
  return (
    <div className="space-y-6">
      <PageHeader title={t('userSubscriptions.title')} description={t('userSubscriptions.description')} />
      {q.isLoading ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-56" />
          <Skeleton className="h-56" />
        </div>
      ) : (q.data ?? []).length === 0 ? (
        <Card>
          <EmptyState
            icon={Crown}
            title={t('userSubscriptions.noActiveSubscriptions')}
            description={t('userSubscriptions.noActiveSubscriptionsDesc')}
            action={
              <Button asChild>
                <Link href="/purchase">{t('nav.buySubscription')}</Link>
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {(q.data ?? []).map((s) => (
            <SubscriptionCard key={s.id} sub={s} />
          ))}
        </div>
      )}
    </div>
  )
}
