/** /dashboard：用户概览（余额、用量统计、趋势与模型分布、平台拆分与限额、最近用量、快捷操作）。 */
import * as React from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import {
  Activity,
  ArrowRight,
  Boxes,
  Clock,
  Coins,
  Database,
  Gauge,
  Image as ImageIcon,
  KeyRound,
  Receipt,
  RefreshCw,
  Ticket,
  Wallet
} from 'lucide-react'
import { usageAPI } from '@/api/usage'
import { getMyPlatformQuotas } from '@/api/user'
import { LazyDonutChart, LazyTrendAreaChart } from '@/components/charts/LazyCharts'
import { DateRangeBar, type DateStrRange } from '@/components/DateRangeBar'
import { EmptyState } from '@/components/EmptyState'
import { NativeSelect } from '@/components/NativeSelect'
import { PageHeader } from '@/components/PageHeader'
import { StatCard } from '@/components/StatCard'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { useBatchImageAccessStore } from '@/hooks/useBatchImageAccess'
import { t } from '@/i18n'
import { useLocale } from '@/i18n/react'
import { useAuthStore } from '@/stores/auth'
import {
  formatCostFixed,
  formatDateLocalInput,
  formatDateTime,
  formatNumberLocaleString,
  formatTokensK
} from '@/utils/format'
import { cn } from '@/lib/utils'
import {
  buildPlatformCards,
  calcPercent,
  hasAnyLimit,
  PLATFORM_LABELS,
  quotaTone,
  type FusedPlatformCard
} from './platformQuota'

const usd = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const formatDuration = (ms: number) => (ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${ms.toFixed(0)}ms`)

function defaultRange(): DateStrRange {
  return {
    start: formatDateLocalInput(new Date(Date.now() - 6 * 86400000)),
    end: formatDateLocalInput(new Date())
  }
}

function formatResetTime(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString(undefined, {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  })
}

const TONE_BAR: Record<string, string> = {
  destructive: '[&>div]:bg-destructive',
  warning: '[&>div]:bg-warning',
  success: '[&>div]:bg-success'
}

function PlatformCard({ item }: { item: FusedPlatformCard }) {
  const q = item.quota
  const windows = ['daily', 'weekly', 'monthly'] as const
  return (
    <div
      data-testid="platform-card"
      data-platform={item.platform}
      className={cn('rounded-lg border p-3', item.isOther && 'border-dashed bg-muted/40')}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold">
          {item.isOther ? t('dashboard.platformOther') : (PLATFORM_LABELS[item.platform] ?? item.platform)}
        </span>
        <span className="tabular font-mono text-sm text-primary" title={t('dashboard.actual')}>
          ${formatCostFixed(item.total_actual_cost)}
        </span>
      </div>
      <dl className="mt-2 space-y-1 text-xs">
        <div className="flex justify-between">
          <dt className="text-muted-foreground">{t('dashboard.todayCost')}</dt>
          <dd className="tabular font-mono">${formatCostFixed(item.today_actual_cost)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted-foreground">{t('dashboard.requests')}</dt>
          <dd className="tabular font-mono">
            {item.total_requests > 0 ? formatNumberLocaleString(item.total_requests) : '-'}
          </dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted-foreground">{t('dashboard.tokens')}</dt>
          <dd className="tabular font-mono">
            {item.total_tokens > 0 ? formatTokensK(item.total_tokens) : '-'}
          </dd>
        </div>
      </dl>
      {hasAnyLimit(q) && !item.isOther && q ? (
        <div className="mt-3 space-y-2 border-t pt-2">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
            {t('dashboard.platformQuota.title')}
          </p>
          {windows.map((w) => {
            const limit = q[`${w}_limit_usd`]
            if (limit == null) return null
            const used = q[`${w}_usage_usd`] ?? 0
            const resets = q[`${w}_window_resets_at`]
            const pct = limit === 0 ? 100 : calcPercent(used, limit)
            return (
              <div key={w} className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span>{t(`dashboard.platformQuota.${w}`)}</span>
                  {limit === 0 ? (
                    <span className="font-mono text-destructive">
                      {t('dashboard.platformQuota.disabled')}
                    </span>
                  ) : (
                    <span className="tabular font-mono">
                      ${usd.format(used)} / ${usd.format(limit)}
                    </span>
                  )}
                </div>
                <Progress value={pct} className={TONE_BAR[limit === 0 ? 'destructive' : quotaTone(pct)]} />
                {limit > 0 && resets ? (
                  <p className="text-[10px] text-muted-foreground">
                    {t('dashboard.platformQuota.resetsAt', { time: formatResetTime(resets) })}
                  </p>
                ) : null}
              </div>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}

export function DashboardPage() {
  useLocale()
  const user = useAuthStore((s) => s.user)
  const isSimple = useAuthStore((s) => s.isSimpleMode)
  const refreshUser = useAuthStore((s) => s.refreshUser)
  const [range, setRange] = React.useState<DateStrRange>(defaultRange)
  const [granularity, setGranularity] = React.useState<'day' | 'hour'>('day')
  const canBatch = useBatchImageAccessStore((s) => s.canUseBatchImage)
  const refreshBatch = useBatchImageAccessStore((s) => s.refresh)

  const stats = useQuery({
    queryKey: ['user', 'dashboard', 'stats'],
    queryFn: async () => {
      await refreshUser().catch(() => undefined)
      return usageAPI.getDashboardStats()
    }
  })
  const quotas = useQuery({
    queryKey: ['user', 'dashboard', 'platform-quotas'],
    queryFn: async () => {
      try {
        return (await getMyPlatformQuotas()).platform_quotas ?? []
      } catch (error) {
        console.warn('Failed to load platform quotas:', error)
        return []
      }
    }
  })
  const charts = useQuery({
    queryKey: ['user', 'dashboard', 'charts', range, granularity],
    queryFn: async () => {
      const [trend, models] = await Promise.all([
        usageAPI.getDashboardTrend({ start_date: range.start, end_date: range.end, granularity }),
        usageAPI.getDashboardModels({ start_date: range.start, end_date: range.end })
      ])
      return { trend: trend.trend || [], models: models.models || [] }
    }
  })
  const recent = useQuery({
    queryKey: ['user', 'dashboard', 'recent', range],
    queryFn: async () => (await usageAPI.getByDateRange(range.start, range.end)).items.slice(0, 5)
  })

  React.useEffect(() => {
    void refreshBatch()
  }, [refreshBatch])

  const refreshAll = () => {
    void stats.refetch()
    void quotas.refetch()
    void charts.refetch()
    void recent.refetch()
  }

  const s = stats.data
  const cards = React.useMemo(() => (s ? buildPlatformCards(s, quotas.data) : []), [s, quotas.data])
  const trend = charts.data?.trend ?? []
  const models = charts.data?.models ?? []

  const quickActions = [
    {
      href: '/keys',
      icon: KeyRound,
      title: t('dashboard.createApiKey'),
      desc: t('dashboard.generateNewKey')
    },
    {
      href: '/usage',
      icon: Receipt,
      title: t('dashboard.viewUsage'),
      desc: t('dashboard.checkDetailedLogs')
    },
    ...(canBatch
      ? [
          {
            href: '/batch-image',
            icon: ImageIcon,
            title: t('dashboard.batchImageAgent'),
            desc: t('dashboard.batchImageAgentDesc')
          }
        ]
      : []),
    {
      href: '/redeem',
      icon: Ticket,
      title: t('dashboard.redeemCode'),
      desc: t('dashboard.addBalanceWithCode')
    }
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('dashboard.title')}
        description={t('dashboard.welcomeMessage')}
        actions={
          <Button variant="outline" onClick={refreshAll} loading={stats.isFetching || charts.isFetching}>
            <RefreshCw aria-hidden />
            {t('common.refresh')}
          </Button>
        }
      />

      {stats.isError ? (
        <Card>
          <EmptyState
            title={t('common.unknownError')}
            action={<Button onClick={refreshAll}>{t('common.refresh')}</Button>}
          />
        </Card>
      ) : (
        <>
          <section className="grid grid-cols-2 gap-4 lg:grid-cols-4" aria-label={t('dashboard.title')}>
            {!isSimple ? (
              <StatCard
                loading={stats.isLoading}
                icon={<Wallet />}
                label={t('dashboard.balance')}
                value={`$${usd.format(user?.balance ?? 0)}`}
                hint={t('common.available')}
              />
            ) : null}
            <StatCard
              loading={stats.isLoading}
              icon={<KeyRound />}
              label={t('dashboard.apiKeys')}
              value={s?.total_api_keys ?? 0}
              hint={`${s?.active_api_keys ?? 0} ${t('common.active')}`}
            />
            <StatCard
              loading={stats.isLoading}
              icon={<Activity />}
              label={t('dashboard.todayRequests')}
              value={s?.today_requests ?? 0}
              hint={`${t('common.total')}: ${formatNumberLocaleString(s?.total_requests ?? 0)}`}
            />
            <StatCard
              loading={stats.isLoading}
              icon={<Coins />}
              label={t('dashboard.todayCost')}
              value={
                <span>
                  <span title={t('dashboard.actual')}>${formatCostFixed(s?.today_actual_cost ?? 0)}</span>
                  <span className="text-sm font-normal text-muted-foreground" title={t('dashboard.standard')}>
                    {' '}
                    / ${formatCostFixed(s?.today_cost ?? 0)}
                  </span>
                </span>
              }
              hint={`${t('common.total')}: $${formatCostFixed(s?.total_actual_cost ?? 0)} / $${formatCostFixed(s?.total_cost ?? 0)}`}
            />
            <StatCard
              loading={stats.isLoading}
              icon={<Boxes />}
              label={t('dashboard.todayTokens')}
              value={formatTokensK(s?.today_tokens ?? 0)}
              hint={`${t('dashboard.input')} ${formatTokensK(s?.today_input_tokens ?? 0)} · ${t('dashboard.output')} ${formatTokensK(s?.today_output_tokens ?? 0)} · ${t('dashboard.cache')} ${formatTokensK((s?.today_cache_creation_tokens ?? 0) + (s?.today_cache_read_tokens ?? 0))}`}
            />
            <StatCard
              loading={stats.isLoading}
              icon={<Database />}
              label={t('dashboard.totalTokens')}
              value={formatTokensK(s?.total_tokens ?? 0)}
              hint={`${t('dashboard.input')} ${formatTokensK(s?.total_input_tokens ?? 0)} · ${t('dashboard.output')} ${formatTokensK(s?.total_output_tokens ?? 0)} · ${t('dashboard.cache')} ${formatTokensK((s?.total_cache_creation_tokens ?? 0) + (s?.total_cache_read_tokens ?? 0))}`}
            />
            <StatCard
              loading={stats.isLoading}
              icon={<Gauge />}
              label={t('dashboard.performance')}
              value={`${formatTokensK(s?.rpm ?? 0)} RPM`}
              hint={`${formatTokensK(s?.tpm ?? 0)} TPM`}
            />
            <StatCard
              loading={stats.isLoading}
              icon={<Clock />}
              label={t('dashboard.avgResponse')}
              value={formatDuration(s?.average_duration_ms ?? 0)}
              hint={t('dashboard.averageTime')}
            />
          </section>

          {!isSimple && cards.length > 0 ? (
            <Card>
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <CardTitle className="text-sm">{t('dashboard.platformBreakdown')}</CardTitle>
                <span className="text-xs text-muted-foreground">
                  {t('dashboard.platformCount', { count: cards.filter((c) => !c.isOther).length })}
                </span>
              </CardHeader>
              <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {cards.map((c) => (
                  <PlatformCard key={c.platform} item={c} />
                ))}
              </CardContent>
            </Card>
          ) : null}
        </>
      )}

      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 space-y-0">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-medium">{t('dashboard.timeRange')}</span>
            <DateRangeBar
              value={range}
              onChange={setRange}
              presets={['today', '7days', '14days', '30days']}
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <span className="font-medium">{t('dashboard.granularity')}</span>
            <NativeSelect
              className="w-28"
              value={granularity}
              onChange={(e) => setGranularity(e.target.value as 'day' | 'hour')}
            >
              <option value="day">{t('dashboard.day')}</option>
              <option value="hour">{t('dashboard.hour')}</option>
            </NativeSelect>
          </label>
        </CardHeader>
        <CardContent className="grid gap-6 lg:grid-cols-5">
          <div className="lg:col-span-3">
            <h3 className="mb-3 text-sm font-semibold">{t('dashboard.tokenUsageTrend')}</h3>
            {trend.length === 0 && !charts.isLoading ? (
              <EmptyState title={t('dashboard.noDataAvailable')} />
            ) : (
              <LazyTrendAreaChart
                data={trend as unknown as Record<string, unknown>[]}
                series={[
                  { key: 'input_tokens', label: t('dashboard.input'), stackId: 'a' },
                  { key: 'output_tokens', label: t('dashboard.output'), stackId: 'a' },
                  { key: 'cache_read_tokens', label: t('dashboard.cache'), stackId: 'a' }
                ]}
                yFormatter={formatTokensK}
                tooltipFormatter={(v) => formatTokensK(v)}
              />
            )}
          </div>
          <div className="lg:col-span-2">
            <h3 className="mb-3 text-sm font-semibold">{t('dashboard.modelDistribution')}</h3>
            {models.length === 0 && !charts.isLoading ? (
              <EmptyState title={t('dashboard.noDataAvailable')} />
            ) : (
              <LazyDonutChart
                data={models.map((m) => ({ name: m.model, value: m.total_tokens }))}
                valueFormatter={(v) => `${formatTokensK(v)} tokens`}
              />
            )}
          </div>
          {models.length > 0 ? (
            <div className="overflow-x-auto lg:col-span-5">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs uppercase text-muted-foreground">
                    <th className="pb-2 text-left font-medium">{t('dashboard.model')}</th>
                    <th className="pb-2 text-right font-medium">{t('dashboard.requests')}</th>
                    <th className="pb-2 text-right font-medium">{t('dashboard.tokens')}</th>
                    <th className="pb-2 text-right font-medium">{t('dashboard.actual')}</th>
                    <th className="pb-2 text-right font-medium">{t('dashboard.standard')}</th>
                  </tr>
                </thead>
                <tbody className="tabular">
                  {models.slice(0, 8).map((m) => (
                    <tr key={m.model} className="border-b last:border-0">
                      <td className="max-w-[16rem] truncate py-2" title={m.model}>
                        {m.model}
                      </td>
                      <td className="py-2 text-right">{formatNumberLocaleString(m.requests)}</td>
                      <td className="py-2 text-right">{formatTokensK(m.total_tokens)}</td>
                      <td className="py-2 text-right text-primary">${formatCostFixed(m.actual_cost)}</td>
                      <td className="py-2 text-right text-muted-foreground">${formatCostFixed(m.cost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">{t('dashboard.recentUsage')}</CardTitle>
            <Badge variant="secondary">{t('dashboard.last7Days')}</Badge>
          </CardHeader>
          <CardContent>
            {recent.isLoading ? (
              <p className="py-8 text-center text-sm text-muted-foreground">{t('common.loading')}</p>
            ) : (recent.data ?? []).length === 0 ? (
              <EmptyState title={t('dashboard.noUsageRecords')} description={t('dashboard.startUsingApi')} />
            ) : (
              <ul className="divide-y">
                {(recent.data ?? []).map((log) => (
                  <li key={log.id} className="flex items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{log.model}</p>
                      <p className="text-xs text-muted-foreground">{formatDateTime(log.created_at)}</p>
                    </div>
                    <p className="tabular shrink-0 text-sm font-semibold">
                      <span className="text-success" title={t('dashboard.actual')}>
                        ${formatCostFixed(log.actual_cost)}
                      </span>
                      <span className="font-normal text-muted-foreground" title={t('dashboard.standard')}>
                        {' '}
                        / ${formatCostFixed(log.total_cost)}
                      </span>
                    </p>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-3 text-center">
              <Button asChild variant="link" size="sm">
                <Link href="/usage">
                  {t('dashboard.viewAllUsage')} <ArrowRight aria-hidden />
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('dashboard.quickActions')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {quickActions.map((a) => (
              <Link
                key={a.href}
                href={a.href}
                className="flex items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-muted"
              >
                <span className="flex size-9 items-center justify-center rounded-md bg-accent text-accent-foreground">
                  <a.icon className="size-4" aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{a.title}</span>
                  <span className="block truncate text-xs text-muted-foreground">{a.desc}</span>
                </span>
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
