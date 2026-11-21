/** /admin/ops：运维看板（概览 / 吞吐 / 延迟 / 错误 / 并发 / 告警 / 系统日志，自动刷新、全屏、深链）。 */
import * as React from 'react'
import { useRouter } from 'next/router'
import { useQuery } from '@tanstack/react-query'
import { Bell, Maximize2, Minimize2, RefreshCw, Settings } from 'lucide-react'
import { adminAPI } from '@/api/admin'
import { opsAPI } from '@/api/admin/ops'
import type {
  OpsDashboardOverview,
  OpsErrorDistributionResponse,
  OpsErrorTrendResponse,
  OpsLatencyHistogramResponse,
  OpsMetricThresholds,
  OpsThroughputTrendResponse
} from '@/api/admin/ops'
import { LazyDonutChart, LazySimpleBarChart, LazyTrendAreaChart } from '@/components/charts/LazyCharts'
import { PageHeader } from '@/components/PageHeader'
import { StatCard } from '@/components/StatCard'
import { StatusBadge } from '@/components/StatusBadge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { AdminFormDialog } from '@/features/admin/common/AdminFormDialog'
import { FilterSelect } from '@/features/admin/common/FilterBar'
import { notifyError } from '@/features/admin/common/notify'
import { usePageVisible } from '@/hooks/usePageVisibility'
import { t } from '@/i18n'
import { useLocale } from '@/i18n/react'
import { useAdminSettingsStore } from '@/stores/adminSettings'
import { formatDateTime } from '@/utils/format'
import {
  AlertRulesDialog,
  ErrorDetailDialog,
  ErrorListDialog,
  OpsSettingsDialog,
  RequestDetailsDialog,
  type RequestDetailsPreset
} from './OpsDialogs'
import { AlertEventsCard, ConcurrencyCard, SystemLogTable, TokenStatsCard } from './OpsPanels'
import {
  ALLOWED_QUERY_MODES,
  QUERY_KEYS,
  buildApiParams,
  buildQueryFromState,
  buildSwitchTrendParams,
  isCanceledRequest,
  isFullscreenQuery,
  isOpsDisabledError,
  parseRouteQuery,
  thresholdTone,
  type OpsFilterState,
  type QueryMode,
  type TimeRange,
  type RouteQuery
} from './opsModel'

const PLATFORMS = ['', 'anthropic', 'openai', 'gemini', 'antigravity', 'grok']
const nf = (n: number | null | undefined, d = 0) =>
  n == null ? '—' : Number(n).toLocaleString(undefined, { maximumFractionDigits: d })
const hhmm = (iso: string) => {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

type Dlg =
  | { kind: 'settings' }
  | { kind: 'rules' }
  | { kind: 'errors'; type: 'request' | 'upstream' }
  | { kind: 'requests'; preset: RequestDetailsPreset }
  | { kind: 'error'; id: number; type: 'request' | 'upstream'; back: 'errors' | 'requests' | null }
  | { kind: 'custom'; start: string; end: string }
  | null

export function OpsPage() {
  useLocale()
  const router = useRouter()
  const visible = usePageVisible()
  const settingsStore = useAdminSettingsStore()
  const opsEnabled = settingsStore.opsMonitoringEnabled
  const realtime = settingsStore.opsRealtimeMonitoringEnabled

  const [filters, setFilters] = React.useState<OpsFilterState>({
    timeRange: '1h',
    platform: '',
    groupId: null,
    queryMode: 'auto'
  })
  const [custom, setCustom] = React.useState<{ start: string | null; end: string | null }>({
    start: null,
    end: null
  })
  const [dlg, setDlg] = React.useState<Dlg>(null)
  const [ready, setReady] = React.useState(false)
  const [overview, setOverview] = React.useState<OpsDashboardOverview | null>(null)
  const [throughput, setThroughput] = React.useState<OpsThroughputTrendResponse | null>(null)
  const [switchTrend, setSwitchTrend] = React.useState<OpsThroughputTrendResponse | null>(null)
  const [latency, setLatency] = React.useState<OpsLatencyHistogramResponse | null>(null)
  const [errorTrend, setErrorTrend] = React.useState<OpsErrorTrendResponse | null>(null)
  const [errorDist, setErrorDist] = React.useState<OpsErrorDistributionResponse | null>(null)
  const [thresholds, setThresholds] = React.useState<OpsMetricThresholds | null>(null)
  const [adv, setAdv] = React.useState({ alerts: true, tokens: false, auto: false, seconds: 30 })
  const [loading, setLoading] = React.useState(true)
  const [hasLoaded, setHasLoaded] = React.useState(false)
  const [error, setError] = React.useState('')
  const [lastUpdated, setLastUpdated] = React.useState<Date | null>(null)
  const [refreshToken, setRefreshToken] = React.useState(0)
  const [countdown, setCountdown] = React.useState(0)

  const query = router.query as RouteQuery
  const fullscreen = isFullscreenQuery(query)
  const abortRef = React.useRef<AbortController | null>(null)
  const seqRef = React.useRef(0)
  const filtersRef = React.useRef(filters)
  const customRef = React.useRef(custom)
  // 请求发出时读取最新筛选值；先于下方的取数 effect 同步（同一提交内按声明顺序执行）
  React.useEffect(() => {
    filtersRef.current = filters
    customRef.current = custom
  }, [filters, custom])

  const groupsQ = useQuery({
    queryKey: ['admin', 'ops', 'groups', filters.platform],
    queryFn: () => adminAPI.groups.getAll((filters.platform || undefined) as never),
    enabled: opsEnabled
  })

  /** URL → 状态（仅首次与路由外部变化时）。 */
  const appliedQuery = React.useRef('')
  React.useEffect(() => {
    if (!router.isReady) return
    const serialized = JSON.stringify(router.query)
    if (serialized === appliedQuery.current) return
    appliedQuery.current = serialized
    const { state, links } = parseRouteQuery(
      router.query as RouteQuery,
      filtersRef.current,
      settingsStore.opsQueryModeDefault || 'auto'
    )
    setFilters((f) =>
      f.timeRange === state.timeRange &&
      f.platform === state.platform &&
      f.groupId === state.groupId &&
      f.queryMode === state.queryMode
        ? f
        : state
    )
    if (links.openAlertRules) setDlg({ kind: 'rules' })
    else if (links.openErrorDetails) setDlg({ kind: 'errors', type: links.errorType })
  }, [router.isReady, router.query, settingsStore.opsQueryModeDefault])

  /** 状态 → URL（250ms 防抖，replace）。 */
  React.useEffect(() => {
    if (!router.isReady || !ready) return
    const id = window.setTimeout(() => {
      const next = buildQueryFromState(router.query as RouteQuery, filters)
      if (JSON.stringify(next) === JSON.stringify(router.query)) return
      appliedQuery.current = JSON.stringify(next)
      void router.replace({ pathname: router.pathname, query: next }, undefined, { shallow: true })
    }, 250)
    return () => window.clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, ready])

  const loadAdvanced = React.useCallback(async () => {
    try {
      const s = await opsAPI.getAdvancedSettings()
      setAdv({
        alerts: s.display_alert_events,
        tokens: s.display_openai_token_stats,
        auto: s.auto_refresh_enabled,
        seconds: s.auto_refresh_interval_seconds
      })
      setCountdown(s.auto_refresh_interval_seconds)
    } catch {
      setAdv({ alerts: true, tokens: false, auto: false, seconds: 30 })
      setCountdown(0)
    }
  }, [])
  const loadThresholds = React.useCallback(async () => {
    try {
      setThresholds((await opsAPI.getMetricThresholds()) || null)
    } catch {
      setThresholds(null)
    }
  }, [])

  const fetchData = React.useCallback(async () => {
    if (!settingsStore.opsMonitoringEnabled) return
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    const seq = ++seqRef.current
    const params = buildApiParams(filtersRef.current, customRef.current)
    const opt = { signal: ctrl.signal }
    // 让出一个微任务：避免在 effect 中同步 setState 触发级联渲染
    await Promise.resolve()
    if (seq !== seqRef.current) return
    setLoading(true)
    setError('')
    const guard = <T,>(fn: () => Promise<T>, set: (v: T | null) => void, msgKey: string) =>
      fn().then(
        (v) => {
          if (seq === seqRef.current) set(v)
        },
        (e) => {
          if (seq !== seqRef.current || isCanceledRequest(e) || isOpsDisabledError(e)) return
          set(null)
          notifyError(e, t(msgKey))
        }
      )
    try {
      await Promise.all([
        opsAPI.getDashboardSnapshotV2(params, opt).then(
          (s) => {
            if (seq !== seqRef.current) return
            setOverview(s.overview)
            setThroughput(s.throughput_trend)
            setErrorTrend(s.error_trend)
          },
          async (e) => {
            if (seq !== seqRef.current || isCanceledRequest(e)) return
            // 快照接口不可用时回退到分拆接口
            await Promise.all([
              guard(
                () => opsAPI.getDashboardOverview(params, opt),
                setOverview,
                'admin.ops.failedToLoadOverview'
              ),
              guard(
                () => opsAPI.getThroughputTrend(params, opt),
                setThroughput,
                'admin.ops.failedToLoadThroughputTrend'
              ),
              guard(
                () => opsAPI.getErrorTrend(params, opt),
                setErrorTrend,
                'admin.ops.failedToLoadErrorTrend'
              )
            ])
          }
        ),
        guard(
          () => opsAPI.getThroughputTrend(buildSwitchTrendParams(filtersRef.current), opt),
          setSwitchTrend,
          'admin.ops.failedToLoadSwitchTrend'
        )
      ])
      if (seq !== seqRef.current) return
      setLastUpdated(new Date())
      setRefreshToken((n) => n + 1)
      // 非核心面板延后加载，降低首屏阻塞
      void guard(
        () => opsAPI.getLatencyHistogram(params, opt),
        setLatency,
        'admin.ops.failedToLoadLatencyHistogram'
      )
      void guard(
        () => opsAPI.getErrorDistribution(params, opt),
        setErrorDist,
        'admin.ops.failedToLoadErrorDistribution'
      )
    } catch {
      if (!isOpsDisabledError(undefined)) setError(t('admin.ops.failedToLoadData'))
    } finally {
      if (seq === seqRef.current) {
        setLoading(false)
        setHasLoaded(true)
      }
    }
  }, [settingsStore.opsMonitoringEnabled])

  // 启动：拉取设置；运维关闭则跳转到系统设置
  React.useEffect(() => {
    let alive = true
    void (async () => {
      await settingsStore.fetch()
      if (!alive) return
      if (!useAdminSettingsStore.getState().opsMonitoringEnabled) {
        void router.replace('/admin/settings')
        return
      }
      await Promise.all([loadAdvanced(), loadThresholds()])
      if (alive) setReady(true)
    })()
    return () => {
      alive = false
      abortRef.current?.abort()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 运维被后端关闭（ops-monitoring-disabled 事件）
  React.useEffect(() => {
    const h = () => void router.replace('/admin/settings')
    window.addEventListener('ops-monitoring-disabled', h)
    return () => window.removeEventListener('ops-monitoring-disabled', h)
  }, [router])

  React.useEffect(() => {
    if (!ready || !opsEnabled) return
    const id = window.setTimeout(() => void fetchData(), 0)
    return () => window.clearTimeout(id)
  }, [ready, opsEnabled, filters, custom, fetchData])

  // 自动刷新：1 秒节拍，页面不可见 / 正在加载时暂停
  React.useEffect(() => {
    if (!adv.auto || !opsEnabled || !visible) return
    const id = window.setInterval(() => {
      if (loading) return
      setCountdown((c) => {
        if (c <= 1) {
          void fetchData()
          return adv.seconds
        }
        return c - 1
      })
    }, 1000)
    return () => window.clearInterval(id)
  }, [adv.auto, adv.seconds, opsEnabled, visible, loading, fetchData])

  // 全屏：Esc 退出
  const setFullscreen = (on: boolean) => {
    const next = { ...(router.query as RouteQuery) } as Record<string, string | string[] | undefined>
    if (on) next[QUERY_KEYS.fullscreen] = '1'
    else delete next[QUERY_KEYS.fullscreen]
    void router.replace({ pathname: router.pathname, query: next as Record<string, string> }, undefined, {
      shallow: true
    })
  }
  React.useEffect(() => {
    if (!fullscreen) return
    const h = (e: KeyboardEvent) => e.key === 'Escape' && !dlg && setFullscreen(false)
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fullscreen, dlg])

  const scope = { filters, custom }
  const setF = (p: Partial<OpsFilterState>) => setFilters((f) => ({ ...f, ...p }))
  const openRequests = (preset: RequestDetailsPreset = {}) =>
    setDlg({
      kind: 'requests',
      preset: { title: t('admin.ops.requestDetails.title'), kind: 'all', sort: 'created_at_desc', ...preset }
    })

  const o = overview
  const sm = o?.system_metrics
  const slaTone = thresholdTone(o ? o.sla * 100 : null, thresholds?.sla_percent_min, 'min')
  const ttftTone = thresholdTone(o?.ttft?.p99_ms, thresholds?.ttft_p99_ms_max, 'max')
  const errTone = thresholdTone(
    o ? o.error_rate * 100 : null,
    thresholds?.request_error_rate_percent_max,
    'max'
  )
  const upTone = thresholdTone(
    o ? o.upstream_error_rate * 100 : null,
    thresholds?.upstream_error_rate_percent_max,
    'max'
  )
  const toneCls = (x: string) => (x === 'error' ? 'text-destructive' : x === 'success' ? 'text-success' : '')

  const body = (
    <div className="grid gap-6 pb-12">
      {error ? (
        <div role="alert" className="rounded-md bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <FilterSelect
          label={t('admin.dashboard.timeRange')}
          value={filters.timeRange}
          onChange={(v) => {
            if (v === 'custom') {
              const now = new Date()
              const p = (n: number) => String(n).padStart(2, '0')
              const loc = (d: Date) =>
                `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
              return setDlg({
                kind: 'custom',
                start: loc(new Date(now.getTime() - 3_600_000)),
                end: loc(now)
              })
            }
            setF({ timeRange: v as TimeRange })
          }}
          options={['5m', '30m', '1h', '6h', '24h', 'custom'].map((r) => ({
            value: r,
            label: t(`admin.ops.timeRange.${r}`)
          }))}
          className="w-36"
        />
        <FilterSelect
          label={t('admin.ops.errorLog.platform')}
          value={filters.platform}
          onChange={(v) => setF({ platform: v, groupId: null })}
          options={PLATFORMS.map((p) => ({ value: p, label: p || t('common.all') }))}
          className="w-36"
        />
        <FilterSelect
          label={t('admin.ops.errorLog.group')}
          value={String(filters.groupId ?? '')}
          onChange={(v) => setF({ groupId: v ? Number(v) : null })}
          options={[
            { value: '', label: t('common.all') },
            ...(groupsQ.data ?? []).map((g) => ({ value: String(g.id), label: g.name }))
          ]}
          className="w-44"
        />
        <FilterSelect
          label="mode"
          value={filters.queryMode}
          onChange={(v) =>
            (ALLOWED_QUERY_MODES as readonly string[]).includes(v) && setF({ queryMode: v as QueryMode })
          }
          options={ALLOWED_QUERY_MODES.map((m) => ({ value: m, label: t(`admin.ops.queryMode.${m}`) }))}
          className="w-32"
        />
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {lastUpdated ? (
            <span className="text-xs text-muted-foreground">{formatDateTime(lastUpdated.toISOString())}</span>
          ) : null}
          {adv.auto ? (
            <span className="text-xs text-muted-foreground">
              {t('admin.ops.autoRefreshRemaining', { seconds: countdown })}
            </span>
          ) : null}
          <Button
            variant="outline"
            size="sm"
            aria-label={t('common.refresh')}
            onClick={() => void fetchData()}
          >
            <RefreshCw className={loading ? 'animate-spin' : undefined} aria-hidden />
          </Button>
          <Button variant="outline" size="sm" onClick={() => openRequests()}>
            {t('admin.ops.requestDetails.title')}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setDlg({ kind: 'errors', type: 'request' })}>
            {t('admin.ops.errorDetails.requestErrors')}
          </Button>
          {!fullscreen ? (
            <>
              <Button variant="outline" size="sm" onClick={() => setDlg({ kind: 'rules' })}>
                <Bell aria-hidden />
                {t('admin.ops.alertRules.manage')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                aria-label={t('admin.ops.settings.title')}
                onClick={() => setDlg({ kind: 'settings' })}
              >
                <Settings aria-hidden />
              </Button>
            </>
          ) : null}
          <Button
            variant="outline"
            size="sm"
            aria-label={t('admin.ops.fullscreen.enter')}
            onClick={() => setFullscreen(!fullscreen)}
          >
            {fullscreen ? <Minimize2 aria-hidden /> : <Maximize2 aria-hidden />}
          </Button>
        </div>
      </div>

      {loading && !hasLoaded ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label={t('admin.ops.health')}
              value={o?.health_score != null ? nf(o.health_score) : '—'}
              hint={
                sm ? (
                  <>
                    CPU {nf(sm.cpu_usage_percent, 1)}% · {t('admin.ops.memory')}{' '}
                    {nf(sm.memory_usage_percent, 1)}% · DB {sm.db_ok === false ? '✗' : '✓'} · Redis{' '}
                    {sm.redis_ok === false ? '✗' : '✓'}
                  </>
                ) : (
                  t('admin.ops.noSystemMetrics')
                )
              }
            />
            <StatCard
              label={t('admin.ops.totalRequests')}
              value={nf(o?.request_count_total)}
              hint={
                <>
                  {t('admin.ops.tokens')} {nf(o?.token_consumed)} · QPS {nf(o?.qps.current, 2)} (
                  {t('admin.ops.peak')} {nf(o?.qps.peak, 2)})
                </>
              }
            />
            <StatCard
              label={t('admin.ops.sla')}
              value={<span className={toneCls(slaTone)}>{o ? `${(o.sla * 100).toFixed(2)}%` : '—'}</span>}
              hint={
                <>
                  {t('admin.ops.businessLimited')} {nf(o?.business_limited_count)}
                </>
              }
            />
            <StatCard
              label={t('admin.ops.avgLatency')}
              value={o?.duration.avg_ms != null ? `${nf(o.duration.avg_ms)} ms` : '—'}
              hint={
                <>
                  {t('admin.ops.p99')} {nf(o?.duration.p99_ms)} · {t('admin.ops.avgTtft')}{' '}
                  <span className={toneCls(ttftTone)}>{nf(o?.ttft.p99_ms)}</span> (p99)
                </>
              }
            />
            <StatCard
              label={t('admin.ops.requestErrors')}
              value={
                <span className={toneCls(errTone)}>{o ? `${(o.error_rate * 100).toFixed(2)}%` : '—'}</span>
              }
              hint={
                <>
                  {t('admin.ops.errorCount')} {nf(o?.error_count_sla)}
                </>
              }
            />
            <StatCard
              label={t('admin.ops.upstreamErrors')}
              value={
                <span className={toneCls(upTone)}>
                  {o ? `${(o.upstream_error_rate * 100).toFixed(2)}%` : '—'}
                </span>
              }
              hint={
                <>
                  {t('admin.ops.errorCountExcl429529')}: {nf(o?.upstream_error_count_excl_429_529)} · 429{' '}
                  {nf(o?.upstream_429_count)} · 529 {nf(o?.upstream_529_count)}
                </>
              }
            />
            <StatCard
              label="TPS"
              value={nf(o?.tps.current, 1)}
              hint={
                <>
                  {t('admin.ops.peak')} {nf(o?.tps.peak, 1)} · {t('admin.ops.average')} {nf(o?.tps.avg, 1)}
                </>
              }
            />
            <StatCard
              label={t('admin.ops.outputTps')}
              value={o?.output_tps?.p50 != null ? nf(o.output_tps.p50, 1) : '—'}
              hint={
                o?.output_tps
                  ? t('admin.ops.outputTpsSamples', { count: o.output_tps.sample_count })
                  : undefined
              }
            />
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
            <ConcurrencyCard
              platform={filters.platform}
              groupId={filters.groupId}
              refreshToken={refreshToken}
              enabled={realtime}
            />
            <Card className="p-4">
              <h3 className="mb-2 text-sm font-semibold">{t('admin.ops.switchRateTrend')}</h3>
              <LazyTrendAreaChart
                data={(switchTrend?.points ?? []).map((p) => ({
                  time: hhmm(p.bucket_start),
                  switches: p.switch_count ?? 0
                }))}
                xKey="time"
                series={[{ key: 'switches', label: t('admin.ops.accountSwitches') }]}
                height={290}
              />
            </Card>
            <Card className="p-4 lg:col-span-2">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold">{t('admin.ops.throughputTrend')}</h3>
                <div className="flex flex-wrap gap-1">
                  {(throughput?.by_platform ?? []).slice(0, 5).map((p) => (
                    <Button
                      key={p.platform}
                      size="sm"
                      variant="ghost"
                      className="h-6 px-2 text-xs"
                      onClick={() => setF({ platform: p.platform, groupId: null })}
                    >
                      {p.platform} {nf(p.request_count)}
                    </Button>
                  ))}
                  {(throughput?.top_groups ?? []).slice(0, 3).map((g) => (
                    <Button
                      key={g.group_id}
                      size="sm"
                      variant="ghost"
                      className="h-6 px-2 text-xs"
                      onClick={() => setF({ groupId: g.group_id })}
                    >
                      {g.group_name}
                    </Button>
                  ))}
                </div>
              </div>
              <LazyTrendAreaChart
                data={(throughput?.points ?? []).map((p) => ({
                  time: hhmm(p.bucket_start),
                  qps: Number(p.qps.toFixed(2)),
                  tps: Number(p.tps.toFixed(2))
                }))}
                xKey="time"
                series={[
                  { key: 'qps', label: 'QPS' },
                  { key: 'tps', label: 'TPS' }
                ]}
                height={290}
              />
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            <Card className="p-4">
              <h3 className="mb-2 text-sm font-semibold">{t('admin.ops.latencyHistogram')}</h3>
              <LazySimpleBarChart
                data={(latency?.buckets ?? []).map((b) => ({ name: b.range, value: b.count }))}
              />
            </Card>
            <Card className="p-4">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold">{t('admin.ops.errorDistribution')}</h3>
                <Button size="sm" variant="ghost" onClick={() => setDlg({ kind: 'errors', type: 'request' })}>
                  {t('admin.ops.errorLog.details')}
                </Button>
              </div>
              {(errorDist?.items ?? []).length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  {t('admin.ops.charts.emptyError')}
                </p>
              ) : (
                <LazyDonutChart
                  data={errorDist!.items.map((i) => ({ name: String(i.status_code), value: i.total }))}
                />
              )}
            </Card>
            <Card className="p-4">
              <div className="mb-2 flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">{t('admin.ops.errorTrend')}</h3>
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 px-2 text-xs"
                    onClick={() => setDlg({ kind: 'errors', type: 'request' })}
                  >
                    {t('admin.ops.errorDetails.requestErrors')}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 px-2 text-xs"
                    onClick={() => setDlg({ kind: 'errors', type: 'upstream' })}
                  >
                    {t('admin.ops.errorDetails.upstreamErrors')}
                  </Button>
                </div>
              </div>
              <LazyTrendAreaChart
                data={(errorTrend?.points ?? []).map((p) => ({
                  time: hhmm(p.bucket_start),
                  sla: p.error_count_sla,
                  limited: p.business_limited_count,
                  upstream: p.upstream_error_count_excl_429_529
                }))}
                xKey="time"
                series={[
                  { key: 'sla', label: t('admin.ops.errorsSla') },
                  { key: 'limited', label: t('admin.ops.businessLimited') },
                  { key: 'upstream', label: t('admin.ops.upstreamExcl429529') }
                ]}
              />
            </Card>
          </div>

          {adv.tokens ? (
            <TokenStatsCard
              platform={filters.platform}
              groupId={filters.groupId}
              refreshToken={refreshToken}
            />
          ) : null}
          {adv.alerts ? <AlertEventsCard refreshToken={refreshToken} /> : null}
          <SystemLogTable platform={filters.platform} refreshToken={refreshToken} />
        </>
      )}
    </div>
  )

  const dialogs = (
    <>
      {dlg?.kind === 'settings' ? (
        <OpsSettingsDialog
          onClose={() => setDlg(null)}
          onSaved={() => {
            void loadAdvanced()
            void loadThresholds()
            void fetchData()
          }}
        />
      ) : null}
      {dlg?.kind === 'rules' ? <AlertRulesDialog onClose={() => setDlg(null)} /> : null}
      {dlg?.kind === 'errors' ? (
        <ErrorListDialog
          kind={dlg.type}
          scope={scope}
          onClose={() => setDlg(null)}
          onOpenDetail={(id) => setDlg({ kind: 'error', id, type: dlg.type, back: 'errors' })}
        />
      ) : null}
      {dlg?.kind === 'requests' ? (
        <RequestDetailsDialog
          scope={scope}
          preset={dlg.preset}
          onClose={() => setDlg(null)}
          onOpenError={(id) => setDlg({ kind: 'error', id, type: 'request', back: 'requests' })}
        />
      ) : null}
      {dlg?.kind === 'error' ? (
        <ErrorDetailDialog
          id={dlg.id}
          kind={dlg.type}
          canGoBack={dlg.back !== null}
          onClose={() => setDlg(null)}
          onBack={() =>
            setDlg(
              dlg.back === 'requests'
                ? { kind: 'requests', preset: { title: t('admin.ops.requestDetails.title') } }
                : { kind: 'errors', type: dlg.type }
            )
          }
        />
      ) : null}
      <AdminFormDialog
        open={dlg?.kind === 'custom'}
        onOpenChange={(o) => !o && setDlg(null)}
        title={t('admin.ops.timeRange.custom')}
        size="sm"
        submitText={t('common.confirm')}
        submitDisabled={dlg?.kind === 'custom' ? !dlg.start || !dlg.end : true}
        onSubmit={() => {
          if (dlg?.kind !== 'custom') return
          setCustom({ start: new Date(dlg.start).toISOString(), end: new Date(dlg.end).toISOString() })
          setF({ timeRange: 'custom' })
          setDlg(null)
        }}
      >
        {dlg?.kind === 'custom' ? (
          <>
            <Input
              type="datetime-local"
              aria-label={t('admin.ops.customTimeRange.startTime')}
              value={dlg.start}
              onChange={(e) => setDlg({ ...dlg, start: e.target.value })}
            />
            <Input
              type="datetime-local"
              aria-label={t('admin.ops.customTimeRange.endTime')}
              value={dlg.end}
              onChange={(e) => setDlg({ ...dlg, end: e.target.value })}
            />
          </>
        ) : null}
      </AdminFormDialog>
    </>
  )

  if (!opsEnabled) return null

  if (fullscreen) {
    return (
      <div className="fixed inset-0 z-40 overflow-auto bg-background p-4 md:p-6">
        {body}
        {dialogs}
      </div>
    )
  }
  return (
    <div>
      <PageHeader
        title={t('admin.ops.title')}
        description={t('admin.ops.description')}
        actions={
          filters.timeRange === 'custom' && custom.start ? (
            <StatusBadge status="info">{t('admin.ops.timeRange.custom')}</StatusBadge>
          ) : undefined
        }
      />
      {body}
      {dialogs}
    </div>
  )
}
