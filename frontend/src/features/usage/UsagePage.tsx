/** /usage：用量明细（多维筛选、统计卡、趋势 / 分布图、明细表、CSV 导出、错误请求）。 */
import * as React from 'react'
import type { SortingState, Updater } from '@tanstack/react-table'
import { useQuery } from '@tanstack/react-query'
import { Download, RefreshCw } from 'lucide-react'
import { keysAPI } from '@/api/keys'
import { userGroupsAPI } from '@/api/groups'
import { usageAPI } from '@/api/usage'
import { LazyTrendAreaChart } from '@/components/charts/LazyCharts'
import { ColumnSettings } from '@/components/ColumnSettings'
import { DateRangeBar, granularityForRange, type DateStrRange } from '@/components/DateRangeBar'
import { FormField } from '@/components/FormField'
import { NativeSelect } from '@/components/NativeSelect'
import { PageHeader } from '@/components/PageHeader'
import { StatCard } from '@/components/StatCard'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useDebouncedValue } from '@/hooks/useDebounce'
import { getPersistedPageSize, setPersistedPageSize } from '@/hooks/usePersistedPageSize'
import { t } from '@/i18n'
import { useLocale } from '@/i18n/react'
import { useAppStore } from '@/stores/app'
import type { ApiKey, UsageLog, UsageQueryParams } from '@/types'
import { getBillingModeLabel, getDisplayBillingMode } from '@/utils/billingMode'
import { COMMON_ERROR_STATUS_CODES } from '@/utils/errorBadges'
import { FeatureFlags, resolveFeatureFlag } from '@/utils/featureFlags'
import { formatCostFixed, formatDateLocalInput, formatReasoningEffort } from '@/utils/format'
import { getConfiguredTablePageSizeOptions } from '@/utils/tablePreferences'
import { requestTypeToLegacyStream, resolveUsageRequestType } from '@/utils/usageRequestType'
import { DistributionCard, type DistributionMetric } from './DistributionCard'
import { ERROR_COLUMN_KEYS, UserErrorRequests } from './UserErrorRequests'
import { UsageLogTable } from './UsageLogTable'
import { csvRow, formatLatency, formatTokensBig } from './usageUi'

const USAGE_COLUMNS = [
  'api_key',
  'model',
  'reasoning_effort',
  'endpoint',
  'ip_address',
  'group',
  'stream',
  'billing_mode',
  'tokens',
  'cost',
  'latency',
  'created_at',
  'user_agent'
]
const ERROR_CATEGORIES = [
  'auth',
  'rate_limit',
  'quota',
  'invalid_request',
  'service_unavailable',
  'upstream',
  'internal',
  'cyber'
]
const EXPORT_PAGE_SIZE = 1000

const EXPORT_TYPE_TEXT: Record<string, string> = {
  cyber: 'Cyber',
  live: 'Live',
  ws_v2: 'WS',
  stream: 'Stream',
  sync: 'Sync'
}
const requestTypeExportText = (log: UsageLog): string =>
  EXPORT_TYPE_TEXT[resolveUsageRequestType(log)] ?? 'Unknown'

const last24h = (): DateStrRange => ({
  start: formatDateLocalInput(new Date(Date.now() - 86400000)),
  end: formatDateLocalInput(new Date())
})

function usePersistedHidden(storageKey: string, defaults: string[], always: string[]) {
  const [hidden, setHidden] = React.useState<string[]>(defaults)
  React.useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey)
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 水合后一次性读取 localStorage
      if (saved) setHidden((JSON.parse(saved) as string[]).filter((k) => !always.includes(k)))
    } catch {
      /* 使用默认值 */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅在挂载时读取
  }, [])
  const toggle = (key: string) =>
    setHidden((prev) => {
      const next = prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
      try {
        localStorage.setItem(storageKey, JSON.stringify(next))
      } catch {
        /* 忽略 */
      }
      return next
    })
  return { hidden, toggle, isVisible: (k: string) => !hidden.includes(k) }
}

interface Filters {
  api_key_id: string
  model: string
  group_id: string
  request_type: string
  native_compaction_v2: string
  billing_type: string
  billing_mode: string
}
const EMPTY_FILTERS: Filters = {
  api_key_id: '',
  model: '',
  group_id: '',
  request_type: '',
  native_compaction_v2: '',
  billing_type: '',
  billing_mode: ''
}

export function UsagePage() {
  useLocale()
  const showError = useAppStore((s) => s.showError)
  const showInfo = useAppStore((s) => s.showInfo)
  const showSuccess = useAppStore((s) => s.showSuccess)
  const showWarning = useAppStore((s) => s.showWarning)
  const settings = useAppStore((s) => s.cachedPublicSettings)
  const errorViewEnabled = settings?.allow_user_view_error_requests ?? false
  const subscriptionEnabled = resolveFeatureFlag(settings, FeatureFlags.subscription)

  const [range, setRange] = React.useState<DateStrRange>(last24h)
  const [granularity, setGranularity] = React.useState<'day' | 'hour'>(() =>
    granularityForRange(last24h().start, last24h().end)
  )
  const [filters, setFilters] = React.useState<Filters>(EMPTY_FILTERS)
  const [tab, setTab] = React.useState<'usage' | 'errors'>('usage')
  const [page, setPage] = React.useState(1)
  const [pageSize, setPageSize] = React.useState(() => getPersistedPageSize())
  const [sorting, setSorting] = React.useState<SortingState>([{ id: 'created_at', desc: true }])
  const [errFilter, setErrFilter] = React.useState({
    model: '',
    category: '',
    api_key_id: '',
    status_code: ''
  })
  const [errPage, setErrPage] = React.useState(1)
  const [errPageSize, setErrPageSize] = React.useState(20)
  const [errSorting, setErrSorting] = React.useState<SortingState>([{ id: 'created_at', desc: true }])
  const [metrics, setMetrics] = React.useState<Record<'model' | 'group' | 'endpoint', DistributionMetric>>({
    model: 'tokens',
    group: 'tokens',
    endpoint: 'tokens'
  })
  const [exporting, setExporting] = React.useState(false)

  const usageCols = usePersistedHidden('user-usage-hidden-columns', ['user_agent'], ['created_at'])
  const errCols = usePersistedHidden(
    'user-usage-error-hidden-columns',
    ['user_agent'],
    ['status', 'created_at']
  )
  const debouncedModel = useDebouncedValue(filters.model, 300)
  const debouncedErrModel = useDebouncedValue(errFilter.model, 300)

  const normalized = React.useMemo<UsageQueryParams>(() => {
    const requestType = (filters.request_type || undefined) as UsageQueryParams['request_type']
    const legacyStream = requestType ? requestTypeToLegacyStream(requestType) : undefined
    return {
      start_date: range.start,
      end_date: range.end,
      ...(filters.api_key_id ? { api_key_id: Number(filters.api_key_id) } : {}),
      ...(debouncedModel ? { model: debouncedModel } : {}),
      ...(filters.group_id ? { group_id: Number(filters.group_id) } : {}),
      request_type: requestType,
      stream: legacyStream === null ? undefined : legacyStream,
      native_compaction_v2: filters.native_compaction_v2 === 'true' ? true : null,
      billing_type: filters.billing_type === '' ? null : Number(filters.billing_type),
      billing_mode: filters.billing_mode || null
    }
  }, [range, filters, debouncedModel])

  const sort = sorting[0]
  const listParams = React.useMemo<UsageQueryParams>(
    () => ({
      page,
      page_size: pageSize,
      ...normalized,
      sort_by: sort?.id ?? 'created_at',
      sort_order: sort?.desc === false ? 'asc' : 'desc'
    }),
    [page, pageSize, normalized, sort]
  )

  const logs = useQuery({
    queryKey: ['user', 'usage', 'logs', listParams],
    queryFn: ({ signal }) => usageAPI.query(listParams, { signal }),
    placeholderData: (p) => p
  })
  const stats = useQuery({
    queryKey: ['user', 'usage', 'stats', normalized],
    queryFn: () => usageAPI.getStats(normalized)
  })
  const modelStats = useQuery({
    queryKey: ['user', 'usage', 'models', normalized],
    queryFn: () => usageAPI.getDashboardModels({ ...normalized, model_source: 'requested' })
  })
  const chart = useQuery({
    queryKey: ['user', 'usage', 'snapshot', normalized, granularity],
    queryFn: () =>
      usageAPI.getDashboardSnapshotV2({
        ...normalized,
        granularity,
        include_trend: true,
        include_model_stats: false,
        include_group_stats: true
      })
  })
  const apiKeys = useQuery({
    queryKey: ['user', 'usage', 'filter-keys'],
    queryFn: async () => {
      const first = await keysAPI.list(1, 100)
      const keys: ApiKey[] = [...first.items]
      for (let p = 2; p <= first.pages; p++) {
        const r = await keysAPI.list(p, 100)
        if (r.items.length === 0) break
        keys.push(...r.items)
      }
      return keys
    }
  })
  const groups = useQuery({
    queryKey: ['user', 'groups', 'available'],
    queryFn: () => userGroupsAPI.getAvailable()
  })

  const errParams = React.useMemo(() => {
    const s = errSorting[0]
    return {
      page: errPage,
      page_size: errPageSize,
      start_date: range.start,
      end_date: range.end,
      model: debouncedErrModel.trim() || undefined,
      category: errFilter.category || undefined,
      api_key_id: errFilter.api_key_id ? Number(errFilter.api_key_id) : undefined,
      status_code: errFilter.status_code ? Number(errFilter.status_code) : undefined,
      sort_by: s ? (s.id === 'status' ? 'status_code' : s.id) : 'created_at',
      sort_order: s?.desc === false ? ('asc' as const) : ('desc' as const)
    }
  }, [errPage, errPageSize, range, debouncedErrModel, errFilter, errSorting])
  const errors = useQuery({
    queryKey: ['user', 'usage', 'errors', errParams],
    enabled: errorViewEnabled && tab === 'errors',
    queryFn: () => usageAPI.listMyErrorRequests(errParams),
    placeholderData: (p) => p
  })

  const modelOptions = React.useMemo(() => {
    const set = new Set((modelStats.data?.models ?? []).map((m) => m.model).filter(Boolean))
    if (filters.model) set.add(filters.model)
    return [...set].sort()
  }, [modelStats.data, filters.model])

  const setFilter = (patch: Partial<Filters>) => {
    setFilters((f) => ({ ...f, ...patch }))
    setPage(1)
    setErrPage(1)
  }
  const onRange = (r: DateStrRange) => {
    setRange(r)
    setGranularity(granularityForRange(r.start, r.end))
    setPage(1)
    setErrPage(1)
  }
  const reset = () => {
    const r = last24h()
    onRange(r)
    setFilters(EMPTY_FILTERS)
    setErrFilter({ model: '', category: '', api_key_id: '', status_code: '' })
  }
  const refreshAll = () => {
    void logs.refetch()
    void stats.refetch()
    void modelStats.refetch()
    void chart.refetch()
    if (tab === 'errors') void errors.refetch()
  }

  const exportCsv = async () => {
    const total = logs.data?.total ?? 0
    if (total === 0) return showWarning(t('usage.noDataToExport'))
    setExporting(true)
    showInfo(t('usage.preparingExport'))
    try {
      const all: UsageLog[] = []
      const base: UsageQueryParams = { ...listParams, page_size: EXPORT_PAGE_SIZE }
      const totalPages = Math.ceil(total / EXPORT_PAGE_SIZE)
      for (let p = 1; p <= totalPages; p++) {
        // 逐页请求计入按用户的重查询限流；429 时按 Retry-After 等待后重试同一页
        for (let attempt = 0; ; attempt++) {
          try {
            all.push(...(await usageAPI.query({ ...base, page: p })).items)
            break
          } catch (error) {
            const e = error as { status?: number; retry_after_seconds?: number }
            if (e?.status !== 429 || attempt >= 3) throw error
            const wait = Math.min(Math.max(e.retry_after_seconds ?? 60, 1), 60)
            showInfo(t('usage.exportRateLimited', { seconds: wait }))
            await new Promise((r) => setTimeout(r, wait * 1000))
          }
        }
      }
      if (all.length === 0) return showWarning(t('usage.noDataToExport'))
      const headers = [
        'Time',
        'API Key Name',
        'Model',
        'Reasoning Effort',
        'Inbound Endpoint',
        'IP Address',
        'Type',
        'Billing Mode',
        'Input Tokens',
        'Output Tokens',
        'Cache Read Tokens',
        'Cache Creation Tokens',
        'Rate Multiplier',
        'Billed Cost',
        'Original Cost',
        'First Token (ms)',
        'Duration (ms)'
      ]
      const rows = all.map((log) =>
        csvRow([
          log.created_at,
          log.api_key?.name || '',
          log.model,
          formatReasoningEffort(log.reasoning_effort),
          log.inbound_endpoint || '',
          log.ip_address || '',
          requestTypeExportText(log),
          getBillingModeLabel(getDisplayBillingMode(log), t),
          log.input_tokens,
          log.output_tokens,
          log.cache_read_tokens,
          log.cache_creation_tokens,
          log.rate_multiplier,
          log.actual_cost.toFixed(8),
          log.total_cost.toFixed(8),
          log.first_token_ms ?? '',
          log.duration_ms ?? ''
        ])
      )
      const csv = [csvRow(headers), ...rows].join('\n')
      const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `usage_${base.start_date}_to_${base.end_date}.csv`
      a.click()
      URL.revokeObjectURL(url)
      showSuccess(t('usage.exportSuccess'))
    } catch (error) {
      console.error('CSV Export failed:', error)
      showError(t('usage.exportFailed'))
    } finally {
      setExporting(false)
    }
  }

  const s = stats.data
  const trend = chart.data?.trend ?? []
  const cols = (keys: string[], labelOf: (k: string) => string, always: string[]) =>
    keys.filter((k) => !always.includes(k)).map((key) => ({ key, label: labelOf(key) }))
  const usageLabel = (k: string) =>
    ({
      api_key: t('usage.apiKeyFilter'),
      model: t('usage.model'),
      reasoning_effort: t('usage.reasoningEffort'),
      endpoint: t('usage.endpoint'),
      ip_address: 'IP',
      group: t('admin.usage.group'),
      stream: t('usage.type'),
      billing_mode: t('admin.usage.billingMode'),
      tokens: t('usage.tokens'),
      cost: t('usage.cost'),
      latency: t('usage.latency'),
      created_at: t('usage.time'),
      user_agent: t('usage.userAgent')
    })[k] ?? k
  const errLabel = (k: string) =>
    ({
      key_name: t('usage.errors.keyName'),
      model: t('usage.errors.model'),
      endpoint: t('usage.errors.endpoint'),
      client_ip: 'IP',
      group: t('admin.usage.group'),
      type: t('usage.type'),
      platform: t('usage.errors.platform'),
      category: t('usage.errors.category'),
      status: t('usage.errors.status'),
      message: t('usage.errors.message'),
      created_at: t('usage.errors.time'),
      user_agent: t('usage.userAgent')
    })[k] ?? k

  const onSorting = (u: Updater<SortingState>) => {
    setSorting((p) => (typeof u === 'function' ? u(p) : u).slice(-1))
    setPage(1)
  }
  const onErrSorting = (u: Updater<SortingState>) => {
    setErrSorting((p) => (typeof u === 'function' ? u(p) : u).slice(-1))
    setErrPage(1)
  }

  const dist = (
    items: { name: string; requests: number; total_tokens: number; actual_cost: number; cost: number }[]
  ) =>
    items.map((i) => ({
      name: i.name,
      requests: i.requests,
      tokens: i.total_tokens,
      actualCost: i.actual_cost,
      cost: i.cost
    }))

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('usage.title')}
        description={t('usage.description')}
        actions={
          <>
            <Button variant="outline" onClick={refreshAll} loading={logs.isFetching}>
              <RefreshCw aria-hidden />
              {t('common.refresh')}
            </Button>
            {tab === 'usage' ? (
              <Button onClick={() => void exportCsv()} loading={exporting}>
                <Download aria-hidden />
                {exporting ? t('usage.exporting') : t('usage.exportCsv')}
              </Button>
            ) : null}
          </>
        }
      />

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          loading={stats.isLoading}
          label={t('usage.totalRequests')}
          value={(s?.total_requests ?? 0).toLocaleString()}
          hint={t('usage.inSelectedRange')}
        />
        <StatCard
          loading={stats.isLoading}
          label={t('usage.totalTokens')}
          value={formatTokensBig(s?.total_tokens ?? 0)}
          hint={`${t('usage.in')} ${formatTokensBig(s?.total_input_tokens ?? 0)} · ${t('usage.out')} ${formatTokensBig(s?.total_output_tokens ?? 0)} · ${t('usage.cacheTotal')} ${formatTokensBig(s?.total_cache_tokens ?? 0)}`}
        />
        <StatCard
          loading={stats.isLoading}
          label={t('usage.totalCost')}
          value={`$${formatCostFixed(s?.total_actual_cost ?? 0, 4)}`}
          hint={`${t('usage.standardCost')} $${formatCostFixed(s?.total_cost ?? 0, 4)}`}
        />
        <StatCard
          loading={stats.isLoading}
          label={t('usage.avgDuration')}
          value={formatLatency(Math.round(s?.average_duration_ms ?? 0))}
        />
      </section>

      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 space-y-0">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-medium">{t('admin.dashboard.timeRange')}</span>
            <DateRangeBar value={range} onChange={onRange} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <span className="font-medium">{t('admin.dashboard.granularity')}</span>
            <NativeSelect
              className="w-28"
              value={granularity}
              onChange={(e) => setGranularity(e.target.value as 'day' | 'hour')}
            >
              <option value="day">{t('admin.dashboard.day')}</option>
              <option value="hour">{t('admin.dashboard.hour')}</option>
            </NativeSelect>
          </label>
        </CardHeader>
        <CardContent className="grid gap-6 lg:grid-cols-2">
          <DistributionCard
            title={t('dashboard.modelDistribution')}
            items={dist((modelStats.data?.models ?? []).map((m) => ({ ...m, name: m.model })))}
            loading={modelStats.isLoading}
            metric={metrics.model}
            onMetricChange={(m) => setMetrics((x) => ({ ...x, model: m }))}
          />
          <DistributionCard
            title={t('dashboard.groupDistribution')}
            items={dist((chart.data?.groups ?? []).map((g) => ({ ...g, name: g.group_name })))}
            loading={chart.isLoading}
            metric={metrics.group}
            onMetricChange={(m) => setMetrics((x) => ({ ...x, group: m }))}
          />
          <DistributionCard
            title={t('usage.endpointDistribution')}
            items={dist((s?.endpoints ?? []).map((e) => ({ ...e, name: e.endpoint })))}
            loading={stats.isLoading}
            metric={metrics.endpoint}
            onMetricChange={(m) => setMetrics((x) => ({ ...x, endpoint: m }))}
          />
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">{t('dashboard.tokenUsageTrend')}</CardTitle>
            </CardHeader>
            <CardContent>
              <LazyTrendAreaChart
                data={trend as unknown as Record<string, unknown>[]}
                series={[
                  { key: 'input_tokens', label: t('dashboard.input'), stackId: 'a' },
                  { key: 'output_tokens', label: t('dashboard.output'), stackId: 'a' },
                  { key: 'cache_read_tokens', label: t('dashboard.cache'), stackId: 'a' }
                ]}
                height={200}
                yFormatter={formatTokensBig}
                tooltipFormatter={(v) => formatTokensBig(v)}
              />
            </CardContent>
          </Card>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="flex flex-wrap items-end gap-3">
            {tab === 'errors' ? (
              <>
                <FormField label={t('usage.errors.keyName')} className="w-full sm:w-52">
                  <NativeSelect
                    value={errFilter.api_key_id}
                    onChange={(e) => {
                      setErrFilter((f) => ({ ...f, api_key_id: e.target.value }))
                      setErrPage(1)
                    }}
                  >
                    <option value="">{t('usage.errors.allKeys')}</option>
                    {(apiKeys.data ?? []).map((k) => (
                      <option key={k.id} value={k.id}>
                        {k.name}
                      </option>
                    ))}
                  </NativeSelect>
                </FormField>
                <FormField label={t('usage.errors.model')} className="w-full sm:w-52">
                  <Input
                    value={errFilter.model}
                    placeholder={t('usage.errors.modelPlaceholder')}
                    onChange={(e) => {
                      setErrFilter((f) => ({ ...f, model: e.target.value }))
                      setErrPage(1)
                    }}
                  />
                </FormField>
                <FormField label={t('usage.errors.category')} className="w-full sm:w-48">
                  <NativeSelect
                    value={errFilter.category}
                    onChange={(e) => {
                      setErrFilter((f) => ({ ...f, category: e.target.value }))
                      setErrPage(1)
                    }}
                  >
                    <option value="">{t('usage.errors.allCategories')}</option>
                    {ERROR_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {t(`usage.errors.categories.${c}`)}
                      </option>
                    ))}
                  </NativeSelect>
                </FormField>
                <FormField label={t('usage.errors.status')} className="w-full sm:w-44">
                  <NativeSelect
                    value={errFilter.status_code}
                    onChange={(e) => {
                      setErrFilter((f) => ({ ...f, status_code: e.target.value }))
                      setErrPage(1)
                    }}
                  >
                    <option value="">{t('usage.errors.allStatuses')}</option>
                    {COMMON_ERROR_STATUS_CODES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </NativeSelect>
                </FormField>
              </>
            ) : (
              <>
                <FormField label={t('usage.apiKeyFilter')} className="w-full sm:w-48">
                  <NativeSelect
                    value={filters.api_key_id}
                    onChange={(e) => setFilter({ api_key_id: e.target.value })}
                  >
                    <option value="">{t('usage.allApiKeys')}</option>
                    {(apiKeys.data ?? []).map((k) => (
                      <option key={k.id} value={k.id}>
                        {k.name}
                      </option>
                    ))}
                  </NativeSelect>
                </FormField>
                <FormField label={t('usage.model')} className="w-full sm:w-52">
                  <NativeSelect value={filters.model} onChange={(e) => setFilter({ model: e.target.value })}>
                    <option value="">{t('admin.usage.allModels')}</option>
                    {modelOptions.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </NativeSelect>
                </FormField>
                <FormField label={t('admin.usage.group')} className="w-full sm:w-44">
                  <NativeSelect
                    value={filters.group_id}
                    onChange={(e) => setFilter({ group_id: e.target.value })}
                  >
                    <option value="">{t('admin.usage.allGroups')}</option>
                    {(groups.data ?? []).map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </NativeSelect>
                </FormField>
                <FormField label={t('usage.type')} className="w-full sm:w-40">
                  <NativeSelect
                    value={filters.request_type}
                    onChange={(e) => setFilter({ request_type: e.target.value })}
                  >
                    <option value="">{t('admin.usage.allTypes')}</option>
                    <option value="ws_v2">{t('usage.ws')}</option>
                    <option value="live">{t('usage.live')}</option>
                    <option value="stream">{t('usage.stream')}</option>
                    <option value="sync">{t('usage.sync')}</option>
                  </NativeSelect>
                </FormField>
                <FormField label={t('usage.compactionFilter')} className="w-full sm:w-44">
                  <NativeSelect
                    value={filters.native_compaction_v2}
                    onChange={(e) => setFilter({ native_compaction_v2: e.target.value })}
                  >
                    <option value="">{t('usage.allCompactionTypes')}</option>
                    <option value="true">{t('usage.compactionOnly')}</option>
                  </NativeSelect>
                </FormField>
                {subscriptionEnabled ? (
                  <FormField label={t('admin.usage.billingType')} className="w-full sm:w-44">
                    <NativeSelect
                      value={filters.billing_type}
                      onChange={(e) => setFilter({ billing_type: e.target.value })}
                    >
                      <option value="">{t('admin.usage.allBillingTypes')}</option>
                      <option value="0">{t('admin.usage.billingTypeBalance')}</option>
                      <option value="1">{t('admin.usage.billingTypeSubscription')}</option>
                    </NativeSelect>
                  </FormField>
                ) : null}
                <FormField label={t('admin.usage.billingMode')} className="w-full sm:w-44">
                  <NativeSelect
                    value={filters.billing_mode}
                    onChange={(e) => setFilter({ billing_mode: e.target.value })}
                  >
                    <option value="">{t('admin.usage.allBillingModes')}</option>
                    <option value="token">{t('admin.usage.billingModeToken')}</option>
                    <option value="per_request">{t('admin.usage.billingModePerRequest')}</option>
                    <option value="image">{t('admin.usage.billingModeImage')}</option>
                    <option value="video">{t('admin.usage.billingModeVideo')}</option>
                  </NativeSelect>
                </FormField>
              </>
            )}
            <div className="ml-auto flex gap-2">
              <Button variant="outline" onClick={reset}>
                {t('common.reset')}
              </Button>
              {tab === 'errors' ? (
                <ColumnSettings
                  columns={cols(ERROR_COLUMN_KEYS, errLabel, ['status', 'created_at'])}
                  isVisible={errCols.isVisible}
                  onToggle={errCols.toggle}
                  label={t('admin.users.columnSettings')}
                />
              ) : (
                <ColumnSettings
                  columns={cols(USAGE_COLUMNS, usageLabel, ['created_at'])}
                  isVisible={usageCols.isVisible}
                  onToggle={usageCols.toggle}
                  label={t('admin.users.columnSettings')}
                />
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {errorViewEnabled ? (
        <Tabs value={tab} onValueChange={(v) => setTab(v as 'usage' | 'errors')}>
          <TabsList>
            <TabsTrigger value="usage">{t('usage.tabs.usage')}</TabsTrigger>
            <TabsTrigger value="errors">{t('usage.tabs.errors')}</TabsTrigger>
          </TabsList>
        </Tabs>
      ) : null}

      {tab === 'usage' ? (
        <UsageLogTable
          data={logs.data?.items ?? []}
          loading={logs.isLoading}
          hiddenColumns={usageCols.hidden}
          sorting={sorting}
          onSortingChange={onSorting}
          onIpGeoBatchFailed={() => showError(t('usage.ipGeo.batchFailed'))}
          pagination={{
            page,
            pageSize,
            total: logs.data?.total ?? 0,
            pageSizeOptions: getConfiguredTablePageSizeOptions(),
            onPageChange: setPage,
            onPageSizeChange: (n) => {
              setPersistedPageSize(n)
              setPageSize(n)
              setPage(1)
            }
          }}
        />
      ) : (
        <UserErrorRequests
          rows={errors.data?.items ?? []}
          loading={errors.isLoading}
          hiddenColumns={errCols.hidden}
          sorting={errSorting}
          onSortingChange={onErrSorting}
          onIpGeoBatchFailed={() => showError(t('usage.ipGeo.batchFailed'))}
          pagination={{
            page: errPage,
            pageSize: errPageSize,
            total: errors.data?.total ?? 0,
            pageSizeOptions: getConfiguredTablePageSizeOptions(),
            onPageChange: setErrPage,
            onPageSizeChange: (n) => {
              setErrPageSize(n)
              setErrPage(1)
            }
          }}
        />
      )}
    </div>
  )
}
