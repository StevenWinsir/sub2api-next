/** /admin/dashboard：管理员概览（KPI / Token 趋势 / 模型与分组分布 / 用户消费排行 / 快捷入口），一次拉取 snapshot-v2。 */
import * as React from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { Activity, ArrowRight, Cpu, KeyRound, RefreshCw, Users, Wallet } from 'lucide-react'
import { adminAPI } from '@/api/admin'
import { LazyDonutChart, LazyTrendAreaChart } from '@/components/charts/LazyCharts'
import { DateRangeBar, DATE_PRESETS, granularityForRange, type DateStrRange } from '@/components/DateRangeBar'
import { NativeSelect } from '@/components/NativeSelect'
import { PageHeader } from '@/components/PageHeader'
import { StatCard } from '@/components/StatCard'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { money } from '@/features/admin/common/fieldUtils'
import { usePageVisible } from '@/hooks/usePageVisibility'
import { t } from '@/i18n'
import { useLocale } from '@/i18n/react'
import { formatCompactNumber } from '@/utils/format'

type Metric = 'tokens' | 'actual_cost'

export function AdminDashboardPage() {
  useLocale()
  const visible = usePageVisible()
  const [range, setRange] = React.useState<DateStrRange>(() =>
    DATE_PRESETS.find((p) => p.key === '7days')!.range()
  )
  const [metric, setMetric] = React.useState<Metric>('tokens')
  const granularity = granularityForRange(range.start, range.end)

  const snapshot = useQuery({
    queryKey: ['admin', 'dashboard', 'snapshot', range, granularity],
    queryFn: () =>
      adminAPI.dashboard.getSnapshotV2({
        start_date: range.start,
        end_date: range.end,
        granularity,
        include_stats: true,
        include_trend: true,
        include_model_stats: true,
        include_group_stats: true,
        include_users_trend: false
      }),
    // 页面不可见时暂停轮询（§5.5）
    refetchInterval: visible ? 60_000 : false
  })
  const ranking = useQuery({
    queryKey: ['admin', 'dashboard', 'ranking', range],
    queryFn: () =>
      adminAPI.dashboard.getUserSpendingRanking({ start_date: range.start, end_date: range.end, limit: 10 })
  })

  const s = snapshot.data?.stats
  const trend = (snapshot.data?.trend ?? []).map((p) => ({
    ...p,
    label: p.date.length > 10 ? p.date.slice(5, 16) : p.date.slice(5)
  }))
  const models = (snapshot.data?.models ?? [])
    .slice(0, 8)
    .map((m) => ({ name: m.model, value: metric === 'tokens' ? m.total_tokens : m.actual_cost }))
  const groups = (snapshot.data?.groups ?? []).slice(0, 8).map((g) => ({
    name: g.group_name || t('admin.dashboard.noGroup'),
    value: metric === 'tokens' ? g.total_tokens : g.actual_cost
  }))
  const rows = ranking.data?.ranking ?? []

  const quick = [
    {
      href: '/admin/users',
      label: t('admin.dashboard.manageUsers'),
      desc: t('admin.dashboard.viewUserAccounts'),
      icon: Users
    },
    {
      href: '/admin/accounts',
      label: t('admin.dashboard.manageAccounts'),
      desc: t('admin.dashboard.configureAiAccounts'),
      icon: KeyRound
    },
    {
      href: '/admin/groups',
      label: t('admin.dashboard.groupPricing'),
      desc: t('admin.dashboard.groupPricingDesc'),
      icon: Wallet
    },
    {
      href: '/admin/settings',
      label: t('admin.dashboard.systemSettings'),
      desc: t('admin.dashboard.configureSystem'),
      icon: Cpu
    }
  ]

  return (
    <div>
      <PageHeader
        title={t('admin.dashboard.title')}
        description={t('admin.dashboard.description')}
        actions={
          <Button variant="outline" aria-label={t('common.refresh')} onClick={() => void snapshot.refetch()}>
            <RefreshCw className={snapshot.isFetching ? 'animate-spin' : undefined} aria-hidden />
          </Button>
        }
      />
      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={t('admin.dashboard.totalUsers')}
          value={formatCompactNumber(s?.total_users ?? 0)}
          hint={`${t('admin.dashboard.newUsersToday')}: ${s?.today_new_users ?? 0} · ${t('admin.dashboard.activeUsers')}: ${s?.active_users ?? 0}`}
          icon={<Users />}
          loading={snapshot.isLoading}
        />
        <StatCard
          label={t('admin.dashboard.totalApiKeys')}
          value={formatCompactNumber(s?.total_api_keys ?? 0)}
          hint={`${t('admin.dashboard.activeApiKeys')}: ${s?.active_api_keys ?? 0}`}
          icon={<KeyRound />}
          loading={snapshot.isLoading}
        />
        <StatCard
          label={t('admin.dashboard.totalAccounts')}
          value={formatCompactNumber(s?.total_accounts ?? 0)}
          hint={`${t('admin.dashboard.ok')} ${s?.normal_accounts ?? 0} · ${t('admin.dashboard.err')} ${s?.error_accounts ?? 0} · RL ${s?.ratelimit_accounts ?? 0}`}
          icon={<Activity />}
          loading={snapshot.isLoading}
        />
        <StatCard
          label={t('admin.dashboard.performance')}
          value={`${Math.round(s?.average_duration_ms ?? 0)} ms`}
          hint={`RPM ${s?.rpm ?? 0} · TPM ${formatCompactNumber(s?.tpm ?? 0)}`}
          icon={<Cpu />}
          loading={snapshot.isLoading}
        />
        <StatCard
          label={t('admin.dashboard.todayRequests')}
          value={formatCompactNumber(s?.today_requests ?? 0)}
          hint={`${t('admin.dashboard.totalRequests')}: ${formatCompactNumber(s?.total_requests ?? 0)}`}
          loading={snapshot.isLoading}
        />
        <StatCard
          label={t('admin.dashboard.todayCost')}
          value={money(s?.today_actual_cost, 4)}
          hint={`${t('admin.dashboard.standard')} ${money(s?.today_cost, 4)} · ${t('admin.dashboard.accountCost')} ${money(s?.today_account_cost, 4)}`}
          loading={snapshot.isLoading}
        />
        <StatCard
          label={t('admin.dashboard.todayTokens')}
          value={formatCompactNumber(s?.today_tokens ?? 0)}
          hint={`${t('admin.dashboard.input')} ${formatCompactNumber(s?.today_input_tokens ?? 0)} · ${t('admin.dashboard.output')} ${formatCompactNumber(s?.today_output_tokens ?? 0)}`}
          loading={snapshot.isLoading}
        />
        <StatCard
          label={t('admin.dashboard.totalCost')}
          value={money(s?.total_actual_cost, 2)}
          hint={`${t('admin.dashboard.totalTokens')}: ${formatCompactNumber(s?.total_tokens ?? 0)}`}
          loading={snapshot.isLoading}
        />
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <DateRangeBar value={range} onChange={setRange} />
        <div className="w-44">
          <NativeSelect
            value={metric}
            aria-label={t('admin.dashboard.timeRange')}
            onChange={(e) => setMetric(e.target.value as Metric)}
          >
            <option value="tokens">{t('admin.dashboard.metricTokens')}</option>
            <option value="actual_cost">{t('admin.dashboard.metricActualCost')}</option>
          </NativeSelect>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{t('admin.dashboard.tokenUsageTrend')}</CardTitle>
          </CardHeader>
          <CardContent>
            {trend.length === 0 ? (
              <p className="py-16 text-center text-sm text-muted-foreground">
                {t('admin.dashboard.noDataAvailable')}
              </p>
            ) : (
              <LazyTrendAreaChart
                data={trend}
                xKey="label"
                series={[
                  { key: 'input_tokens', label: t('admin.dashboard.input'), stackId: 'tokens' },
                  { key: 'output_tokens', label: t('admin.dashboard.output'), stackId: 'tokens' },
                  { key: 'cache_read_tokens', label: t('admin.dashboard.cache'), stackId: 'tokens' }
                ]}
                yFormatter={(v) => formatCompactNumber(v)}
              />
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t('admin.dashboard.modelDistribution')}</CardTitle>
          </CardHeader>
          <CardContent>
            {models.length === 0 ? (
              <p className="py-16 text-center text-sm text-muted-foreground">
                {t('admin.dashboard.noDataAvailable')}
              </p>
            ) : (
              <LazyDonutChart
                data={models}
                valueFormatter={(v) => (metric === 'tokens' ? formatCompactNumber(v) : money(v, 4))}
              />
            )}
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>{t('admin.dashboard.groupDistribution')}</CardTitle>
          </CardHeader>
          <CardContent>
            {groups.length === 0 ? (
              <p className="py-16 text-center text-sm text-muted-foreground">
                {t('admin.dashboard.noDataAvailable')}
              </p>
            ) : (
              <LazyDonutChart
                data={groups}
                valueFormatter={(v) => (metric === 'tokens' ? formatCompactNumber(v) : money(v, 4))}
              />
            )}
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{t('admin.dashboard.spendingRankingTitle')}</CardTitle>
          </CardHeader>
          <CardContent>
            {rows.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                {t('admin.dashboard.noUsageRecords')}
              </p>
            ) : (
              <ol className="divide-y text-sm">
                {rows.map((r, i) => (
                  <li key={r.user_id} className="flex items-center justify-between gap-3 py-2">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="tabular w-5 text-muted-foreground">{i + 1}</span>
                      <span className="truncate">{r.email || `#${r.user_id}`}</span>
                    </span>
                    <span className="tabular flex gap-4 text-muted-foreground">
                      <span>
                        {formatCompactNumber(r.requests)} {t('admin.dashboard.requestsShort')}
                      </span>
                      <span>
                        {formatCompactNumber(r.tokens)} {t('admin.dashboard.tokensShort')}
                      </span>
                      <span className="font-medium text-foreground">{money(r.actual_cost, 4)}</span>
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
      </div>

      <section aria-label={t('admin.dashboard.quickActions')} className="mt-6">
        <h2 className="mb-3 text-sm font-semibold">{t('admin.dashboard.quickActions')}</h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {quick.map((q) => (
            <Link
              key={q.href}
              href={q.href}
              className="group flex items-center gap-3 rounded-lg border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-muted/40"
            >
              <span className="flex size-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                <q.icon className="size-4" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{q.label}</span>
                <span className="block truncate text-xs text-muted-foreground">{q.desc}</span>
              </span>
              <ArrowRight
                className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                aria-hidden
              />
            </Link>
          ))}
        </div>
      </section>
    </div>
  )
}
