/** /monitor（V2）：渠道监控（KPI、健康度矩阵 / 趋势折线、模型 / 错误原因 / 用户排名）。 */
import * as React from 'react'
import { useRouter } from 'next/router'
import { useQuery } from '@tanstack/react-query'
import { RefreshCw } from 'lucide-react'
import * as api from '@/api/channelMonitorV2'
import type { MonitorFilter, MonitorMatrixGroupBy, MonitorRange } from '@/api/channelMonitorV2'
import { LazyTrendAreaChart } from '@/components/charts/LazyCharts'
import { EmptyState } from '@/components/EmptyState'
import { NativeSelect } from '@/components/NativeSelect'
import { PageHeader } from '@/components/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { usePageVisible } from '@/hooks/usePageVisibility'
import { t } from '@/i18n'
import { getLocale } from '@/i18n'
import { useLocale } from '@/i18n/react'
import { useAppStore } from '@/stores/app'
import { useAuthStore } from '@/stores/auth'
import { extractApiErrorMessage } from '@/utils/apiError'
import { isChannelMonitorThroughputHidden, isChannelMonitorUserRankingHidden } from '@/utils/featureFlags'
import { FilterMultiSelect } from './FilterMultiSelect'
import { HealthMatrix } from './HealthMatrix'
import { MetricCell } from './MetricCell'
import {
  formatLatencyKpiSecondary,
  formatMonitorMs,
  formatMonitorPercent,
  formatMonitorSuccessRateFromError,
  formatMonitorThroughput,
  formatMonitorTokensPerSecond,
  ttftDisplayState,
  type HealthDisplayMode
} from './monitorFormat'

type Tab = 'models' | 'errors' | 'users'
type TrendView = 'pulse' | 'line'

const RANGES: MonitorRange[] = ['90m', '24h', '7d', '30d']
const GROUP_BY: MonitorMatrixGroupBy[] = [
  'platform',
  'platform_group',
  'platform_model',
  'platform_group_model'
]
const HEALTH_MODES: HealthDisplayMode[] = ['overall', 'success', 'ttft', 'cache']

const csv = (v: unknown): string[] => (typeof v === 'string' ? v.split(',').filter(Boolean) : [])
const pick = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.includes(v as T) ? (v as T) : fallback

export function MonitorV2Page() {
  useLocale()
  const router = useRouter()
  const visible = usePageVisible()
  const isAdmin = useAuthStore((s) => s.isAdmin)
  const showThroughput = isAdmin || !isChannelMonitorThroughputHidden()
  const showUserRanking = isAdmin || !isChannelMonitorUserRankingHidden()

  // 初始状态取自地址栏查询参数（页面仅在门禁通过后的客户端渲染）
  const initial = React.useMemo(() => new URLSearchParams(window.location.search), [])
  const [filter, setFilter] = React.useState<MonitorFilter>(() => ({
    range: pick(initial.get('range'), RANGES, '90m'),
    platforms: csv(initial.get('platform')),
    groupIds: csv(initial.get('group')).map(Number).filter(Boolean),
    models: csv(initial.get('model'))
  }))
  const [tab, setTab] = React.useState<Tab>(() =>
    pick(
      initial.get('tab'),
      showUserRanking ? (['models', 'errors', 'users'] as const) : (['models', 'errors'] as const),
      'models'
    )
  )
  const [groupBy, setGroupBy] = React.useState<MonitorMatrixGroupBy>(() =>
    pick(initial.get('group_by'), GROUP_BY, 'platform_group')
  )
  const [healthMode, setHealthMode] = React.useState<HealthDisplayMode>(() =>
    pick(initial.get('health_mode'), HEALTH_MODES, 'overall')
  )
  const [trendView, setTrendView] = React.useState<TrendView>(() =>
    initial.get('trend_view') === 'line' ? 'line' : 'pulse'
  )
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set())

  // 状态 → 地址栏（replace，shallow）
  React.useEffect(() => {
    const query: Record<string, string> = {
      range: filter.range,
      group_by: groupBy,
      health_mode: healthMode,
      tab
    }
    if (filter.platforms.length) query.platform = filter.platforms.join(',')
    if (filter.groupIds.length) query.group = filter.groupIds.join(',')
    if (filter.models.length) query.model = filter.models.join(',')
    if (trendView === 'line') query.trend_view = 'line'
    void router.replace({ pathname: router.pathname, query }, undefined, { shallow: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅在这些状态变化时同步
  }, [filter, groupBy, healthMode, trendView, tab])

  const onError = (error: unknown, key: string) => {
    const e = error as { name?: string; code?: string }
    if (e?.name === 'CanceledError' || e?.name === 'AbortError' || e?.code === 'ERR_CANCELED') return
    useAppStore.getState().showError(extractApiErrorMessage(error, t(key)))
  }

  const rangeOnly: MonitorFilter = React.useMemo(
    () => ({ range: filter.range, platforms: [], groupIds: [], models: [] }),
    [filter.range]
  )
  const dims = useQuery({
    queryKey: ['monitor-v2', 'dimensions', filter.range, isAdmin],
    queryFn: ({ signal }) => api.getDimensions(rangeOnly, isAdmin, signal)
  })
  const snapshot = useQuery({
    queryKey: ['monitor-v2', 'snapshot', filter, isAdmin],
    queryFn: async ({ signal }) => {
      try {
        return await api.getSnapshot(filter, isAdmin, signal)
      } catch (e) {
        onError(e, 'channelMonitorV2.loadFailed')
        throw e
      }
    },
    placeholderData: (p) => p,
    refetchInterval: (q) => {
      const data = q.state.data
      const bootstrap = Boolean(data?.coverage?.bootstrap?.active)
      const seconds = bootstrap ? 10 : data?.config?.refresh_interval_seconds || 300
      return visible ? Math.max(bootstrap ? 10 : 60, seconds) * 1000 : false
    }
  })
  const matrix = useQuery({
    queryKey: ['monitor-v2', 'matrix', filter, groupBy, isAdmin],
    queryFn: ({ signal }) => api.getMatrix(filter, groupBy, isAdmin, signal),
    placeholderData: (p) => p
  })
  const models = useQuery({
    queryKey: ['monitor-v2', 'models', filter, isAdmin],
    enabled: tab === 'models',
    queryFn: ({ signal }) => api.getModels(filter, isAdmin, signal),
    placeholderData: (p) => p
  })
  const errors = useQuery({
    queryKey: ['monitor-v2', 'errors', filter, isAdmin],
    enabled: tab === 'errors',
    queryFn: ({ signal }) => api.getErrors(filter, isAdmin, signal),
    placeholderData: (p) => p
  })
  const users = useQuery({
    queryKey: ['monitor-v2', 'users', filter, isAdmin],
    enabled: tab === 'users' && showUserRanking,
    queryFn: ({ signal }) => api.getUsers(filter, isAdmin, signal),
    placeholderData: (p) => p
  })

  const dimensions = dims.data ?? { platforms: [], groups: [], models: [] }
  const selectedPlatforms = new Set(filter.platforms)
  const platformOptions = dimensions.platforms.map((p) => ({ value: p.value, label: p.label }))
  const groupOptions = dimensions.groups
    .filter((g) => selectedPlatforms.size === 0 || !g.platform || selectedPlatforms.has(g.platform))
    .map((g) => ({
      value: String(g.id),
      label: g.platform ? `${g.platform} / ${g.name || `#${g.id}`}` : g.name || `#${g.id}`
    }))
  const modelOptions = dimensions.models
    .filter((m) => selectedPlatforms.size === 0 || !m.platform || selectedPlatforms.has(m.platform))
    .map((m) => ({
      value: m.value,
      label: m.platform && !m.label.includes(m.platform) ? `${m.platform} / ${m.label}` : m.label
    }))

  const snap = snapshot.data
  const locale = getLocale()
  const bootstrapPct = Math.min(
    100,
    Math.max(0, Math.round(snap?.coverage?.bootstrap?.progress_percent ?? 0))
  )
  const hasFilter = filter.platforms.length + filter.groupIds.length + filter.models.length > 0
  const matrixRows = (matrix.data?.items ?? []).filter((r) =>
    groupBy === 'platform_group' || groupBy === 'platform_group_model'
      ? r.group_id != null && Number(r.group_id) > 0
      : true
  )
  const fmtTime = (v: string) =>
    new Intl.DateTimeFormat(locale, {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(v))

  const trendData = (snap?.trend ?? []).map((p) => ({
    date: fmtTime(p.bucket_start),
    error: Number((p.metrics.error_rate * 100).toFixed(2)),
    cache: Number((p.metrics.cache_rate * 100).toFixed(2))
  }))

  const tabs: { value: Tab; label: string }[] = [
    { value: 'models', label: t('channelMonitorV2.tabs.models') },
    { value: 'errors', label: t('channelMonitorV2.tabs.errors') },
    ...(showUserRanking ? [{ value: 'users' as Tab, label: t('channelMonitorV2.tabs.users') }] : [])
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('channelMonitorV2.title')}
        description={
          snapshot.isFetching && snap
            ? t('channelMonitorV2.updating')
            : snap
              ? `${t('channelMonitorV2.updatedTo', { time: fmtTime(snap.coverage.data_through) })}${snap.coverage.coverage_complete ? '' : ` · ${t('channelMonitorV2.partialCoverage')}`}`
              : t('common.loading')
        }
        actions={
          <Button
            variant="outline"
            size="icon"
            aria-label={t('common.refresh')}
            onClick={() => void snapshot.refetch()}
            disabled={snapshot.isFetching}
          >
            <RefreshCw className={snapshot.isFetching ? 'animate-spin' : ''} aria-hidden />
          </Button>
        }
      />

      {snap?.coverage?.bootstrap?.active ? (
        <Card className="border-info/40 bg-info/5">
          <CardContent
            className="space-y-2 p-4"
            role="status"
            aria-label={t('channelMonitorV2.bootstrap.working')}
          >
            <p className="text-sm font-medium">{t('channelMonitorV2.bootstrap.title')}</p>
            <p className="text-xs text-muted-foreground">{t('channelMonitorV2.bootstrap.description')}</p>
            <Progress value={bootstrapPct} />
            <p className="text-xs text-muted-foreground">
              {t('channelMonitorV2.bootstrap.progress', { percent: bootstrapPct })}
            </p>
          </CardContent>
        </Card>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Tabs
          value={filter.range}
          onValueChange={(v) => setFilter((f) => ({ ...f, range: v as MonitorRange }))}
          aria-label={t('channelMonitorV2.timeRange')}
        >
          <TabsList>
            {RANGES.map((r) => (
              <TabsTrigger key={r} value={r}>
                {t(`channelMonitorV2.ranges.${r}`)}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <FilterMultiSelect
          label={t('channelMonitorV2.filters.platform')}
          allLabel={t('channelMonitorV2.filters.allPlatforms')}
          options={platformOptions}
          value={filter.platforms}
          onChange={(v) => setFilter((f) => ({ ...f, platforms: v }))}
        />
        <FilterMultiSelect
          label={t('channelMonitorV2.filters.group')}
          allLabel={t('channelMonitorV2.filters.allGroups')}
          options={groupOptions}
          value={filter.groupIds.map(String)}
          onChange={(v) =>
            setFilter((f) => ({ ...f, groupIds: v.map(Number).filter((n) => Number.isInteger(n) && n > 0) }))
          }
        />
        <FilterMultiSelect
          label={t('channelMonitorV2.filters.model')}
          allLabel={t('channelMonitorV2.filters.allModels')}
          options={modelOptions}
          value={filter.models}
          onChange={(v) => setFilter((f) => ({ ...f, models: v }))}
        />
        {hasFilter ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setFilter((f) => ({ ...f, platforms: [], groupIds: [], models: [] }))}
          >
            {t('channelMonitorV2.clearFilters')}
          </Button>
        ) : null}
      </div>

      {snapshot.isLoading || !snap ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : (
        <section
          className="grid grid-cols-2 gap-4 lg:grid-cols-5"
          aria-label={t('channelMonitorV2.summaryAria')}
        >
          <MetricCell
            label={t('channelMonitorV2.metrics.successRate')}
            value={formatMonitorSuccessRateFromError(snap.metrics.error_rate)}
            detail={t('channelMonitorV2.metrics.errorRateValue', {
              value: formatMonitorPercent(snap.metrics.error_rate)
            })}
            state={snap.health.error_rate}
          />
          <MetricCell
            label={t('channelMonitorV2.metrics.ttftP50')}
            value={formatMonitorMs(snap.metrics.ttft.p50_ms)}
            detail={formatLatencyKpiSecondary(
              snap.metrics.ttft.avg_ms,
              snap.metrics.ttft.p90_ms,
              snap.metrics.ttft.p95_ms
            )}
            state={ttftDisplayState(snap.health.ttft, snap.metrics.ttft)}
          />
          {showThroughput ? (
            <MetricCell
              label={t('channelMonitorV2.metrics.tps')}
              value={formatMonitorTokensPerSecond(snap.metrics.tpm)}
              detail={t('channelMonitorV2.metrics.tpsDetail')}
            />
          ) : null}
          <MetricCell
            label={t('channelMonitorV2.metrics.cacheRate')}
            value={formatMonitorPercent(snap.metrics.cache_rate)}
            detail={t('channelMonitorV2.metrics.cacheDetail')}
            state={snap.health.cache}
          />
          {showThroughput ? (
            <MetricCell
              label={t('channelMonitorV2.metrics.rpm')}
              value={formatMonitorThroughput(snap.metrics.rpm)}
              detail={t('channelMonitorV2.metrics.rpmDetail')}
            />
          ) : null}
        </section>
      )}

      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="text-base">{t('channelMonitorV2.matrix.title')}</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">{t('channelMonitorV2.matrix.description')}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <NativeSelect
              className="w-56"
              aria-label={t('channelMonitorV2.groupBy.label')}
              value={groupBy}
              onChange={(e) => setGroupBy(e.target.value as MonitorMatrixGroupBy)}
            >
              <option value="platform">{t('channelMonitorV2.groupBy.platform')}</option>
              <option value="platform_group">{t('channelMonitorV2.groupBy.platformGroup')}</option>
              <option value="platform_model">{t('channelMonitorV2.groupBy.platformModel')}</option>
              <option value="platform_group_model">{t('channelMonitorV2.groupBy.platformGroupModel')}</option>
            </NativeSelect>
            <Tabs
              value={trendView}
              onValueChange={(v) => setTrendView(v as TrendView)}
              aria-label={t('channelMonitorV2.trendView.label')}
            >
              <TabsList>
                <TabsTrigger value="pulse">{t('channelMonitorV2.trendView.pulse')}</TabsTrigger>
                <TabsTrigger value="line">{t('channelMonitorV2.trendView.line')}</TabsTrigger>
              </TabsList>
            </Tabs>
            {trendView === 'pulse' ? (
              <NativeSelect
                className="w-40"
                aria-label={t('channelMonitorV2.healthMode.label')}
                value={healthMode}
                onChange={(e) => setHealthMode(e.target.value as HealthDisplayMode)}
              >
                {HEALTH_MODES.map((m) => (
                  <option key={m} value={m}>
                    {t(`channelMonitorV2.healthMode.${m}`)}
                  </option>
                ))}
              </NativeSelect>
            ) : null}
          </div>
        </CardHeader>
        <CardContent>
          {trendView === 'pulse' ? (
            matrix.isLoading ? (
              <Skeleton className="h-40" />
            ) : (
              <HealthMatrix rows={matrixRows} mode={healthMode} locale={locale} />
            )
          ) : trendData.length === 0 ? (
            <EmptyState title={t('channelMonitorV2.chart.emptyTitle')} />
          ) : (
            <LazyTrendAreaChart
              data={trendData}
              series={[
                { key: 'error', label: t('channelMonitorV2.chart.errorDataset') },
                { key: 'cache', label: t('channelMonitorV2.chart.cacheDataset') }
              ]}
              yFormatter={(v) => `${v}%`}
              tooltipFormatter={(v) => `${v}%`}
            />
          )}
        </CardContent>
      </Card>

      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} aria-label={t('channelMonitorV2.tabs.aria')}>
        <TabsList>
          {tabs.map((x) => (
            <TabsTrigger key={x.value} value={x.value}>
              {x.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {tab === 'models' ? (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                <th className="px-4 py-2.5 font-medium">{t('channelMonitorV2.table.platformModel')}</th>
                <th className="px-4 py-2.5 font-medium">{t('channelMonitorV2.metrics.successRate')}</th>
                <th className="px-4 py-2.5 font-medium">{t('channelMonitorV2.metrics.ttftP50')}</th>
                {showThroughput ? (
                  <th className="px-4 py-2.5 font-medium">{t('channelMonitorV2.metrics.tps')}</th>
                ) : null}
                <th className="px-4 py-2.5 font-medium">{t('channelMonitorV2.metrics.cacheRate')}</th>
                {showThroughput ? (
                  <th className="px-4 py-2.5 font-medium">{t('channelMonitorV2.metrics.rpm')}</th>
                ) : null}
              </tr>
            </thead>
            <tbody className="tabular">
              {(models.data?.items ?? []).map((row) => (
                <tr key={`${row.platform}:${row.model}`} className="border-b last:border-0 hover:bg-muted/40">
                  <td className="px-4 py-2.5">
                    <button
                      type="button"
                      className="text-left hover:underline"
                      onClick={() =>
                        setFilter((f) => ({ ...f, platforms: [row.platform], models: [row.model] }))
                      }
                    >
                      <span className="text-muted-foreground">{row.platform} / </span>
                      <span className="font-medium">
                        {row.model === '__other__' ? t('channelMonitorV2.otherModels') : row.model}
                      </span>
                    </button>
                  </td>
                  <td className="px-4 py-2.5">
                    {formatMonitorSuccessRateFromError(row.metrics.error_rate)}
                    <small className="ml-1 text-xs text-muted-foreground">
                      {t('channelMonitorV2.metrics.errorRateValue', {
                        value: formatMonitorPercent(row.metrics.error_rate)
                      })}
                    </small>
                  </td>
                  <td className="px-4 py-2.5">{formatMonitorMs(row.metrics.ttft.p50_ms)}</td>
                  {showThroughput ? (
                    <td className="px-4 py-2.5">{formatMonitorTokensPerSecond(row.metrics.tpm)}</td>
                  ) : null}
                  <td className="px-4 py-2.5">{formatMonitorPercent(row.metrics.cache_rate)}</td>
                  {showThroughput ? (
                    <td className="px-4 py-2.5">{formatMonitorThroughput(row.metrics.rpm)}</td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
          {!models.isLoading && (models.data?.items ?? []).length === 0 ? (
            <EmptyState
              title={t('channelMonitorV2.empty.title')}
              description={t('channelMonitorV2.empty.description')}
            />
          ) : null}
        </Card>
      ) : null}

      {tab === 'errors' ? (
        <Card className="divide-y">
          {(errors.data?.items ?? []).map((row) => {
            const open = expanded.has(row.category)
            const label = `channelMonitorV2.errorCategories.${row.category}`
            return (
              <div key={row.category} className="p-4">
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-3 text-left"
                  aria-expanded={open}
                  onClick={() => {
                    const next = new Set(expanded)
                    if (next.has(row.category)) next.delete(row.category)
                    else next.add(row.category)
                    setExpanded(next)
                  }}
                >
                  <span className="flex items-center gap-2 text-sm font-medium">
                    {t(label) === label ? row.category : t(label)}
                    {row.ignored ? <Badge variant="secondary">{t('channelMonitorV2.ignored')}</Badge> : null}
                  </span>
                  <span className="tabular text-sm text-muted-foreground">
                    {formatMonitorPercent(row.rate)}
                  </span>
                </button>
                {open ? (
                  <ul className="mt-3 space-y-2 text-xs">
                    {(row.details ?? []).length === 0 ? (
                      <li className="text-muted-foreground">{t('channelMonitorV2.errorDetail.empty')}</li>
                    ) : null}
                    {(row.details ?? []).map((d, i) => (
                      <li key={i} className="rounded-md bg-muted/50 p-2">
                        <p className="flex flex-wrap gap-x-2 text-muted-foreground">
                          {d.platform ? <span>{d.platform}</span> : null}
                          {d.model ? <span>{d.model}</span> : null}
                          {d.status_code ? (
                            <span>{t('channelMonitorV2.errorDetail.http', { code: d.status_code })}</span>
                          ) : null}
                          {d.upstream_status_code ? (
                            <span>
                              {t('channelMonitorV2.errorDetail.upstream', { code: d.upstream_status_code })}
                            </span>
                          ) : null}
                        </p>
                        <p className="mt-1 break-words">
                          {d.message || d.error_type || t('channelMonitorV2.errorDetail.noMessage')}
                        </p>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            )
          })}
          {!errors.isLoading && (errors.data?.items ?? []).length === 0 ? (
            <EmptyState
              title={t('channelMonitorV2.empty.title')}
              description={t('channelMonitorV2.empty.description')}
            />
          ) : null}
        </Card>
      ) : null}

      {tab === 'users' && showUserRanking ? (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                <th className="px-4 py-2.5 font-medium">{t('channelMonitorV2.table.rank')}</th>
                <th className="px-4 py-2.5 font-medium">{t('channelMonitorV2.table.user')}</th>
                <th className="px-4 py-2.5 font-medium">{t('channelMonitorV2.metrics.successRate')}</th>
                <th className="px-4 py-2.5 font-medium">{t('channelMonitorV2.metrics.ttftP50')}</th>
                {showThroughput ? (
                  <th className="px-4 py-2.5 font-medium">{t('channelMonitorV2.metrics.tps')}</th>
                ) : null}
                {showThroughput ? (
                  <th className="px-4 py-2.5 font-medium">{t('channelMonitorV2.metrics.rpm')}</th>
                ) : null}
              </tr>
            </thead>
            <tbody className="tabular">
              {(users.data?.items ?? []).map((u) => (
                <tr key={`${u.rank}:${u.display_label}`} className="border-b last:border-0">
                  <td className="px-4 py-2.5">#{u.rank}</td>
                  <td className="px-4 py-2.5">
                    {u.display_label}
                    {u.is_self ? <Badge className="ml-2">{t('channelMonitorV2.currentUser')}</Badge> : null}
                  </td>
                  <td className="px-4 py-2.5">{formatMonitorSuccessRateFromError(u.metrics.error_rate)}</td>
                  <td className="px-4 py-2.5">{formatMonitorMs(u.metrics.ttft.p50_ms)}</td>
                  {showThroughput ? (
                    <td className="px-4 py-2.5">{formatMonitorTokensPerSecond(u.metrics.tpm)}</td>
                  ) : null}
                  {showThroughput ? (
                    <td className="px-4 py-2.5">{formatMonitorThroughput(u.metrics.rpm)}</td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
          {!users.isLoading && (users.data?.items ?? []).length === 0 ? (
            <EmptyState
              title={t('channelMonitorV2.empty.title')}
              description={t('channelMonitorV2.empty.description')}
            />
          ) : null}
        </Card>
      ) : null}
    </div>
  )
}
