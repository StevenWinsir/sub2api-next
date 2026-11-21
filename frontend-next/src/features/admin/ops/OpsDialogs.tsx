/** 运维看板对话框：错误列表 / 错误详情 / 请求明细 / 告警规则 / 设置（运维 + 告警运行时 + 邮件通知）。 */
import * as React from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { ArrowLeft, Plus, Trash2 } from 'lucide-react'
import { adminAPI } from '@/api/admin'
import { opsAPI } from '@/api/admin/ops'
import type {
  AlertRule,
  EmailNotificationConfig,
  OpsAdvancedSettings,
  OpsAlertRuntimeSettings,
  OpsErrorLog,
  OpsRequestDetail
} from '@/api/admin/ops'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { DataTable } from '@/components/DataTable'
import { FormField } from '@/components/FormField'
import { NativeSelect } from '@/components/NativeSelect'
import { StatusBadge } from '@/components/StatusBadge'
import { Button } from '@/components/ui/button'
import { Input, Textarea } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AdminFormDialog } from '@/features/admin/common/AdminFormDialog'
import { FilterSelect } from '@/features/admin/common/FilterBar'
import { notifyError } from '@/features/admin/common/notify'
import { useAdminAction } from '@/features/admin/common/useAdminAction'
import { useTableState } from '@/features/admin/common/useTableState'
import { t } from '@/i18n'
import { useLocale } from '@/i18n/react'
import { formatDateTime } from '@/utils/format'
import { buildApiParams, type OpsFilterState } from './opsModel'

export interface Scope {
  filters: OpsFilterState
  custom: { start: string | null; end: string | null }
}

/* ------------------------------ 错误详情 ------------------------------ */
export function ErrorDetailDialog({
  id,
  kind,
  canGoBack,
  onBack,
  onClose
}: {
  id: number
  kind: 'request' | 'upstream'
  canGoBack: boolean
  onBack: () => void
  onClose: () => void
}) {
  const qc = useQueryClient()
  const { busy, run } = useAdminAction()
  const q = useQuery({
    queryKey: ['admin', 'ops', 'error-detail', kind, id],
    queryFn: () =>
      kind === 'upstream' ? opsAPI.getUpstreamErrorDetail(id) : opsAPI.getRequestErrorDetail(id)
  })
  React.useEffect(() => {
    if (q.error) notifyError(q.error, t('admin.ops.failedToLoadErrorDetail'))
  }, [q.error])
  const d = q.data
  const toggle = async () => {
    if (!d) return
    const next = !d.resolved
    const ok = await run(
      () =>
        kind === 'upstream'
          ? opsAPI.updateUpstreamErrorResolved(d.id, next)
          : opsAPI.updateRequestErrorResolved(d.id, next),
      { fallback: t('admin.ops.errorDetail.failedToUpdateResolvedStatus') }
    )
    if (ok !== undefined) {
      void qc.invalidateQueries({ queryKey: ['admin', 'ops', 'error-detail', kind, id] })
      void qc.invalidateQueries({ queryKey: ['admin', 'ops', 'errors'] })
    }
  }
  const rows: [string, React.ReactNode][] = d
    ? [
        [
          t('admin.ops.errorDetail.requestId'),
          <span key="r" className="font-mono text-xs break-all">
            {d.request_id || d.client_request_id || '—'}
          </span>
        ],
        [t('admin.ops.errorDetail.time'), formatDateTime(d.created_at)],
        [t('admin.ops.errorDetail.phase'), d.phase],
        [t('admin.ops.errorDetail.status'), String(d.status_code)],
        [
          t('admin.ops.errorDetail.upstreamStatus'),
          d.upstream_status_code != null ? String(d.upstream_status_code) : '—'
        ],
        [t('admin.ops.errorDetail.platform'), d.platform || '—'],
        [t('admin.ops.errorDetail.model'), d.model || '—'],
        [t('admin.ops.errorDetail.user'), d.user_email || (d.user_id ? `#${d.user_id}` : '—')],
        [t('admin.ops.errorDetail.apiKeyPrefix'), d.api_key_prefix || d.api_key_name || '—'],
        [t('admin.ops.errorDetail.businessLimited'), d.is_business_limited ? 'true' : 'false']
      ]
    : []
  const timings: [string, number | null | undefined][] = d
    ? [
        [t('admin.ops.errorDetail.auth'), d.auth_latency_ms],
        [t('admin.ops.errorDetail.routing'), d.routing_latency_ms],
        [t('admin.ops.errorDetail.upstream'), d.upstream_latency_ms],
        [t('admin.ops.errorDetail.response'), d.response_latency_ms],
        ['TTFT', d.time_to_first_token_ms]
      ]
    : []
  return (
    <AdminFormDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={d ? t('admin.ops.errorDetail.titleWithId', { id: d.id }) : t('admin.ops.errorDetail.title')}
      size="xl"
      footerExtra={
        canGoBack ? (
          <Button type="button" variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft aria-hidden />
            {t('admin.ops.errorDetail.backToList')}
          </Button>
        ) : null
      }
    >
      {q.isLoading || !d ? (
        <Skeleton className="h-40" />
      ) : (
        <Tabs defaultValue="overview">
          <TabsList>
            <TabsTrigger value="overview">{t('admin.ops.errorDetail.tabOverview')}</TabsTrigger>
            <TabsTrigger value="request">{t('admin.ops.errorDetail.tabRequest')}</TabsTrigger>
            <TabsTrigger value="response">{t('admin.ops.errorDetail.tabResponse')}</TabsTrigger>
          </TabsList>
          <TabsContent value="overview" className="grid gap-4 text-sm">
            <div className="flex items-center justify-between gap-3">
              <StatusBadge status={d.resolved ? 'success' : 'error'}>
                {d.resolved ? t('admin.ops.errorDetails.resolved') : t('admin.ops.errorDetails.unresolved')}
              </StatusBadge>
              <Button type="button" size="sm" variant="outline" loading={busy} onClick={() => void toggle()}>
                {d.resolved
                  ? t('admin.ops.errorDetail.markUnresolved')
                  : t('admin.ops.errorDetail.markResolved')}
              </Button>
            </div>
            <dl className="grid gap-3 sm:grid-cols-2">
              {rows.map(([l, v]) => (
                <div key={l}>
                  <dt className="text-xs text-muted-foreground">{l}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
            <div>
              <h4 className="mb-1 text-xs font-semibold text-muted-foreground uppercase">
                {t('admin.ops.errorDetail.message')}
              </h4>
              <p className="rounded-md bg-muted/40 p-3 break-words">{d.message || '—'}</p>
            </div>
            <div>
              <h4 className="mb-1 text-xs font-semibold text-muted-foreground uppercase">
                {t('admin.ops.errorDetail.latency')}
              </h4>
              <ul className="flex flex-wrap gap-x-5 gap-y-1 text-xs">
                {timings.map(([l, v]) => (
                  <li key={l}>
                    {l}: <b>{v != null ? `${v} ms` : '—'}</b>
                  </li>
                ))}
              </ul>
            </div>
            {d.upstream_error_message || d.upstream_error_detail ? (
              <div>
                <h4 className="mb-1 text-xs font-semibold text-muted-foreground uppercase">
                  {t('admin.ops.errorDetail.rootCause')}
                </h4>
                <pre className="max-h-48 overflow-auto rounded-md bg-muted/40 p-3 text-xs whitespace-pre-wrap">
                  {d.upstream_error_message}
                  {d.upstream_error_detail ? `\n${d.upstream_error_detail}` : ''}
                </pre>
              </div>
            ) : null}
          </TabsContent>
          <TabsContent value="request">
            <pre className="max-h-96 overflow-auto rounded-md bg-muted/40 p-3 font-mono text-xs whitespace-pre-wrap">
              {d.upstream_errors || '—'}
            </pre>
          </TabsContent>
          <TabsContent value="response">
            <h4 className="mb-1 text-xs font-semibold text-muted-foreground uppercase">
              {t('admin.ops.errorDetail.errorBody')}
            </h4>
            <pre className="max-h-96 overflow-auto rounded-md bg-muted/40 p-3 font-mono text-xs whitespace-pre-wrap">
              {d.error_body || '—'}
            </pre>
          </TabsContent>
        </Tabs>
      )}
    </AdminFormDialog>
  )
}

/* ------------------------------ 错误列表 ------------------------------ */
export function ErrorListDialog({
  kind,
  scope,
  onOpenDetail,
  onClose
}: {
  kind: 'request' | 'upstream'
  scope: Scope
  onOpenDetail: (id: number) => void
  onClose: () => void
}) {
  const locale = useLocale()
  const table = useTableState(10)
  const [q, setQ] = React.useState('')
  const [applied, setApplied] = React.useState('')
  const [resolved, setResolved] = React.useState('false')
  const [status, setStatus] = React.useState('')
  const [view, setView] = React.useState<'errors' | 'excluded' | 'all'>('errors')
  const params = {
    ...buildApiParams(scope.filters, scope.custom),
    page: table.page,
    page_size: table.pageSize,
    q: applied || undefined,
    resolved: resolved || undefined,
    status_codes: status || undefined,
    view
  }
  const list = useQuery({
    queryKey: ['admin', 'ops', 'errors', kind, params],
    queryFn: () =>
      kind === 'upstream' ? opsAPI.listUpstreamErrors(params) : opsAPI.listRequestErrors(params),
    placeholderData: (p) => p
  })
  React.useEffect(() => {
    if (list.error) notifyError(list.error, t('admin.ops.failedToLoadData'))
  }, [list.error])
  const columns = React.useMemo<ColumnDef<OpsErrorLog, unknown>[]>(
    () => [
      {
        id: 'time',
        header: t('admin.ops.errorLog.time'),
        cell: ({ row }) => (
          <span className="text-xs whitespace-nowrap">{formatDateTime(row.original.created_at)}</span>
        )
      },
      {
        id: 'platform',
        header: t('admin.ops.errorLog.platform'),
        cell: ({ row }) => <span className="text-xs">{row.original.platform || '—'}</span>
      },
      {
        id: 'model',
        header: t('admin.ops.errorLog.model'),
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.model || '—'}</span>
      },
      {
        id: 'status',
        header: t('admin.ops.errorLog.status'),
        cell: ({ row }) => (
          <StatusBadge status={row.original.status_code >= 500 ? 'error' : 'warning'}>
            {row.original.status_code}
          </StatusBadge>
        )
      },
      {
        id: 'user',
        header: t('admin.ops.errorLog.user'),
        cell: ({ row }) => <span className="text-xs">{row.original.user_email || '—'}</span>
      },
      {
        id: 'message',
        header: t('admin.ops.errorLog.message'),
        cell: ({ row }) => <span className="line-clamp-2 max-w-xs text-xs">{row.original.message}</span>
      },
      {
        id: 'resolved',
        header: t('admin.ops.errorDetails.resolved'),
        cell: ({ row }) => (
          <StatusBadge status={row.original.resolved ? 'success' : 'neutral'}>
            {row.original.resolved
              ? t('admin.ops.errorDetails.resolved')
              : t('admin.ops.errorDetails.unresolved')}
          </StatusBadge>
        )
      },
      {
        id: 'actions',
        header: t('admin.ops.errorLog.details'),
        cell: ({ row }) => (
          <Button size="sm" variant="ghost" onClick={() => onOpenDetail(row.original.id)}>
            {t('admin.ops.errorLog.details')}
          </Button>
        )
      }
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [locale]
  )
  return (
    <AdminFormDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={
        kind === 'upstream'
          ? t('admin.ops.errorDetails.upstreamErrors')
          : t('admin.ops.errorDetails.requestErrors')
      }
      size="xl"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Input
          className="w-56"
          aria-label={t('admin.ops.errorDetails.searchPlaceholder')}
          placeholder={t('admin.ops.errorDetails.searchPlaceholder')}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              setApplied(q)
              table.setPage(1)
            }
          }}
        />
        <FilterSelect
          label={t('admin.ops.errorDetails.resolved')}
          value={resolved}
          onChange={(v) => {
            setResolved(v)
            table.setPage(1)
          }}
          options={[
            { value: '', label: t('common.all') },
            { value: 'false', label: t('admin.ops.errorDetails.unresolved') },
            { value: 'true', label: t('admin.ops.errorDetails.resolved') }
          ]}
        />
        <FilterSelect
          label={t('admin.ops.errorLog.status')}
          value={status}
          onChange={(v) => {
            setStatus(v)
            table.setPage(1)
          }}
          options={[
            { value: '', label: t('common.all') },
            ...['400', '401', '403', '429', '500', '502', '503', '529'].map((s) => ({ value: s, label: s })),
            { value: 'other', label: t('admin.ops.errorDetails.statusCodeOther') }
          ]}
          className="w-32"
        />
        <FilterSelect
          label={t('admin.ops.errorDetails.viewErrors')}
          value={view}
          onChange={(v) => {
            setView(v as typeof view)
            table.setPage(1)
          }}
          options={[
            { value: 'errors', label: t('admin.ops.errorDetails.viewErrors') },
            { value: 'excluded', label: t('admin.ops.errorDetails.viewExcluded') },
            { value: 'all', label: t('common.all') }
          ]}
          className="w-44"
        />
        <Button
          type="button"
          onClick={() => {
            setApplied(q)
            table.setPage(1)
          }}
        >
          {t('common.search')}
        </Button>
      </div>
      <DataTable
        columns={columns}
        data={list.data?.items ?? []}
        loading={list.isLoading}
        getRowId={(r) => String(r.id)}
        pagination={table.pagination(list.data?.total ?? 0)}
        emptyTitle={t('admin.ops.errorLog.noErrors')}
      />
    </AdminFormDialog>
  )
}

/* ------------------------------ 请求明细 ------------------------------ */
export interface RequestDetailsPreset {
  title?: string
  kind?: 'all' | 'success' | 'error'
  sort?: 'created_at_desc' | 'duration_desc' | 'ttft_desc'
  platform?: string
  group_id?: number | null
}

export function RequestDetailsDialog({
  scope,
  preset,
  onOpenError,
  onClose
}: {
  scope: Scope
  preset: RequestDetailsPreset
  onOpenError: (id: number) => void
  onClose: () => void
}) {
  const locale = useLocale()
  const table = useTableState(10)
  const [kind, setKind] = React.useState(preset.kind ?? 'all')
  const [sort, setSort] = React.useState(preset.sort ?? 'created_at_desc')
  const [q, setQ] = React.useState('')
  const [applied, setApplied] = React.useState('')
  const base = buildApiParams(scope.filters, scope.custom)
  const params = {
    time_range: base.time_range as '1h' | undefined,
    start_time: base.start_time,
    end_time: base.end_time,
    platform: preset.platform ?? base.platform,
    group_id: preset.group_id ?? base.group_id,
    kind,
    sort,
    q: applied || undefined,
    page: table.page,
    page_size: table.pageSize
  }
  const list = useQuery({
    queryKey: ['admin', 'ops', 'requests', params],
    queryFn: () => opsAPI.listRequestDetails(params),
    placeholderData: (p) => p
  })
  React.useEffect(() => {
    if (list.error) notifyError(list.error, t('admin.ops.requestDetails.failedToLoad'))
  }, [list.error])
  const columns = React.useMemo<ColumnDef<OpsRequestDetail, unknown>[]>(
    () => [
      {
        id: 'time',
        header: t('admin.ops.requestDetails.table.time'),
        cell: ({ row }) => (
          <span className="text-xs whitespace-nowrap">{formatDateTime(row.original.created_at)}</span>
        )
      },
      {
        id: 'kind',
        header: t('admin.ops.requestDetails.table.kind'),
        cell: ({ row }) => (
          <StatusBadge status={row.original.kind === 'error' ? 'error' : 'success'}>
            {t(`admin.ops.requestDetails.kind.${row.original.kind}`)}
          </StatusBadge>
        )
      },
      {
        id: 'platform',
        header: t('admin.ops.requestDetails.table.platform'),
        cell: ({ row }) => <span className="text-xs">{row.original.platform || '—'}</span>
      },
      {
        id: 'model',
        header: t('admin.ops.requestDetails.table.model'),
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.model || '—'}</span>
      },
      {
        id: 'duration',
        header: t('admin.ops.requestDetails.table.duration'),
        cell: ({ row }) => <span className="text-xs">{row.original.duration_ms ?? '—'}</span>
      },
      {
        id: 'status',
        header: t('admin.ops.requestDetails.table.status'),
        cell: ({ row }) => <span className="text-xs">{row.original.status_code ?? '—'}</span>
      },
      {
        id: 'rid',
        header: t('admin.ops.requestDetails.table.requestId'),
        cell: ({ row }) => (
          <span className="font-mono text-xs">{row.original.request_id?.slice(0, 12) || '—'}</span>
        )
      },
      {
        id: 'actions',
        header: t('common.actions'),
        cell: ({ row }) =>
          row.original.error_id ? (
            <Button size="sm" variant="ghost" onClick={() => onOpenError(row.original.error_id!)}>
              {t('admin.ops.requestDetails.viewError')}
            </Button>
          ) : null
      }
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [locale]
  )
  return (
    <AdminFormDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={preset.title || t('admin.ops.requestDetails.title')}
      size="xl"
    >
      <div className="flex flex-wrap items-center gap-2">
        <FilterSelect
          label={t('admin.ops.requestDetails.table.kind')}
          value={kind}
          onChange={(v) => {
            setKind(v as typeof kind)
            table.setPage(1)
          }}
          options={[
            { value: 'all', label: t('common.all') },
            { value: 'success', label: t('admin.ops.requestDetails.kind.success') },
            { value: 'error', label: t('admin.ops.requestDetails.kind.error') }
          ]}
        />
        <FilterSelect
          label={t('admin.ops.requestDetails.table.duration')}
          value={sort}
          onChange={(v) => setSort(v as typeof sort)}
          options={[
            { value: 'created_at_desc', label: t('admin.ops.requestDetails.table.time') },
            { value: 'duration_desc', label: t('admin.ops.requestDetails.table.duration') },
            { value: 'ttft_desc', label: 'TTFT' }
          ]}
        />
        <Input
          className="w-56"
          aria-label={t('common.search')}
          placeholder={t('common.search')}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              setApplied(q)
              table.setPage(1)
            }
          }}
        />
        <Button
          type="button"
          onClick={() => {
            setApplied(q)
            table.setPage(1)
          }}
        >
          {t('common.search')}
        </Button>
      </div>
      <DataTable
        columns={columns}
        data={list.data?.items ?? []}
        loading={list.isLoading}
        getRowId={(r, i) => `${r.request_id}-${i}`}
        pagination={table.pagination(list.data?.total ?? 0)}
        emptyTitle={t('admin.ops.requestDetails.empty')}
        emptyDescription={t('admin.ops.requestDetails.emptyHint')}
      />
    </AdminFormDialog>
  )
}

/* ------------------------------ 告警规则 ------------------------------ */
const METRICS: { value: AlertRule['metric_type']; key: string; group: 'system' | 'group' | 'account' }[] = [
  { value: 'success_rate', key: 'successRate', group: 'system' },
  { value: 'error_rate', key: 'errorRate', group: 'system' },
  { value: 'upstream_error_rate', key: 'upstreamErrorRate', group: 'system' },
  { value: 'cpu_usage_percent', key: 'cpu', group: 'system' },
  { value: 'memory_usage_percent', key: 'memory', group: 'system' },
  { value: 'concurrency_queue_depth', key: 'queueDepth', group: 'system' },
  { value: 'group_available_accounts', key: 'groupAvailableAccounts', group: 'group' },
  { value: 'group_available_ratio', key: 'groupAvailableRatio', group: 'group' },
  { value: 'group_rate_limit_ratio', key: 'groupRateLimitRatio', group: 'group' },
  { value: 'account_rate_limited_count', key: 'accountRateLimitedCount', group: 'account' },
  { value: 'account_error_count', key: 'accountErrorCount', group: 'account' },
  { value: 'account_error_ratio', key: 'accountErrorRatio', group: 'account' },
  { value: 'account_temp_unscheduled_count', key: 'accountTempUnscheduledCount', group: 'account' },
  { value: 'overload_account_count', key: 'overloadAccountCount', group: 'account' }
]
const OPERATORS: AlertRule['operator'][] = ['>', '>=', '<', '<=', '==', '!=']
const isGroupMetric = (m: string) => METRICS.find((x) => x.value === m)?.group === 'group'

export function validateRule(r: AlertRule): string[] {
  const errs: string[] = []
  if (!r.name.trim()) errs.push('nameRequired')
  if (!r.metric_type) errs.push('metricRequired')
  if (isGroupMetric(r.metric_type) && !(Number(r.filters?.group_id) > 0)) errs.push('groupIdRequired')
  if (!r.operator) errs.push('operatorRequired')
  if (!Number.isFinite(r.threshold)) errs.push('thresholdRequired')
  if (![1, 5, 60].includes(r.window_minutes)) errs.push('windowRange')
  if (!(r.sustained_minutes >= 1 && r.sustained_minutes <= 1440)) errs.push('sustainedRange')
  if (!(r.cooldown_minutes >= 0 && r.cooldown_minutes <= 1440)) errs.push('cooldownRange')
  return errs
}

const newRule = (): AlertRule => ({
  name: '',
  description: '',
  enabled: true,
  metric_type: 'success_rate',
  operator: '<',
  threshold: 99,
  window_minutes: 5,
  sustained_minutes: 2,
  severity: 'warning',
  cooldown_minutes: 10,
  notify_email: true,
  filters: {}
})

export function AlertRulesDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const { busy, run } = useAdminAction()
  const [editing, setEditing] = React.useState<AlertRule | null>(null)
  const [errors, setErrors] = React.useState<string[]>([])
  const [removing, setRemoving] = React.useState<AlertRule | null>(null)
  const rules = useQuery({ queryKey: ['admin', 'ops', 'rules'], queryFn: () => opsAPI.listAlertRules() })
  const groups = useQuery({
    queryKey: ['admin', 'ops', 'groups-all'],
    queryFn: () => adminAPI.groups.getAll()
  })
  React.useEffect(() => {
    if (rules.error) notifyError(rules.error, t('admin.ops.alertRules.loadFailed'))
  }, [rules.error])
  const refresh = () => qc.invalidateQueries({ queryKey: ['admin', 'ops', 'rules'] })
  const save = async () => {
    if (!editing) return
    const errs = validateRule(editing)
    setErrors(errs)
    if (errs.length) return
    const payload: AlertRule = { ...editing, name: editing.name.trim() }
    const ok = await run(
      () => (editing.id ? opsAPI.updateAlertRule(editing.id, payload) : opsAPI.createAlertRule(payload)),
      {
        success: t('admin.ops.alertRules.saveSuccess'),
        fallback: t('admin.ops.alertRules.saveFailed')
      }
    )
    if (ok) {
      setEditing(null)
      void refresh()
    }
  }
  const set = (p: Partial<AlertRule>) => setEditing((r) => (r ? { ...r, ...p } : r))
  return (
    <>
      <AdminFormDialog
        open
        onOpenChange={(o) => !o && onClose()}
        title={t('admin.ops.alertRules.title')}
        description={t('admin.ops.alertRules.description')}
        size="xl"
        footerExtra={
          <Button
            type="button"
            size="sm"
            onClick={() => {
              setErrors([])
              setEditing(newRule())
            }}
          >
            <Plus aria-hidden />
            {t('admin.ops.alertRules.create')}
          </Button>
        }
      >
        {rules.isLoading ? (
          <Skeleton className="h-32" />
        ) : (rules.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('admin.ops.alertRules.empty')}</p>
        ) : (
          <ul className="grid gap-2">
            {(rules.data ?? []).map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-center gap-3 rounded-md border px-3 py-2 text-sm"
              >
                <Switch
                  checked={r.enabled}
                  aria-label={t('admin.ops.alertRules.table.enabled')}
                  onCheckedChange={async (v) => {
                    if (!r.id) return
                    const ok = await run(() => opsAPI.updateAlertRule(r.id!, { ...r, enabled: v }), {
                      fallback: t('admin.ops.alertRules.saveFailed')
                    })
                    if (ok) void refresh()
                  }}
                />
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{r.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {t(
                      `admin.ops.alertRules.metrics.${METRICS.find((m) => m.value === r.metric_type)?.key ?? 'successRate'}`
                    )}{' '}
                    {r.operator} {r.threshold}
                  </div>
                </div>
                <StatusBadge
                  status={r.severity === 'critical' ? 'error' : r.severity === 'warning' ? 'warning' : 'info'}
                >
                  {r.severity}
                </StatusBadge>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setErrors([])
                    setEditing(structuredClone(r))
                  }}
                >
                  {t('common.edit')}
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="size-8"
                  aria-label={t('common.delete')}
                  onClick={() => setRemoving(r)}
                >
                  <Trash2 aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </AdminFormDialog>

      <AdminFormDialog
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        title={editing?.id ? t('admin.ops.alertRules.editTitle') : t('admin.ops.alertRules.createTitle')}
        size="lg"
        onSubmit={save}
        submitting={busy}
      >
        {editing ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {errors.length ? (
              <div
                role="alert"
                className="rounded-md bg-destructive/10 p-3 text-xs text-destructive sm:col-span-2"
              >
                <b>{t('admin.ops.alertRules.validation.title')}</b>
                <ul className="list-disc pl-5">
                  {errors.map((e) => (
                    <li key={e}>{t(`admin.ops.alertRules.validation.${e}`)}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            <FormField label={t('admin.ops.alertRules.form.name')} required>
              <Input value={editing.name} onChange={(e) => set({ name: e.target.value })} />
            </FormField>
            <FormField label={t('admin.ops.alertRules.form.severity')}>
              <NativeSelect value={editing.severity} onChange={(e) => set({ severity: e.target.value })}>
                {['critical', 'warning', 'info'].map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
            <FormField label={t('admin.ops.alertRules.form.description')} className="sm:col-span-2">
              <Textarea
                rows={2}
                value={editing.description ?? ''}
                onChange={(e) => set({ description: e.target.value })}
              />
            </FormField>
            <FormField
              label={t('admin.ops.alertRules.form.metric')}
              className="sm:col-span-2"
              description={t(
                `admin.ops.alertRules.metricDescriptions.${METRICS.find((m) => m.value === editing.metric_type)?.key ?? 'successRate'}`
              )}
            >
              <NativeSelect
                value={editing.metric_type}
                onChange={(e) => set({ metric_type: e.target.value as AlertRule['metric_type'] })}
              >
                {(['system', 'group', 'account'] as const).map((g) => (
                  <optgroup key={g} label={t(`admin.ops.alertRules.metricGroups.${g}`)}>
                    {METRICS.filter((m) => m.group === g).map((m) => (
                      <option key={m.value} value={m.value}>
                        {t(`admin.ops.alertRules.metrics.${m.key}`)}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </NativeSelect>
            </FormField>
            <FormField
              label={t('admin.ops.alertRules.form.groupId')}
              description={
                isGroupMetric(editing.metric_type)
                  ? t('admin.ops.alertRules.hints.groupRequired')
                  : t('admin.ops.alertRules.hints.groupOptional')
              }
              className="sm:col-span-2"
            >
              <NativeSelect
                value={String(editing.filters?.group_id ?? '')}
                onChange={(e) =>
                  set({
                    filters: {
                      ...(editing.filters ?? {}),
                      group_id: e.target.value ? Number(e.target.value) : undefined
                    }
                  })
                }
              >
                <option value="">{t('admin.ops.alertRules.form.allGroups')}</option>
                {(groups.data ?? []).map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
            <FormField label={t('admin.ops.alertRules.form.operator')}>
              <NativeSelect
                value={editing.operator}
                onChange={(e) => set({ operator: e.target.value as AlertRule['operator'] })}
              >
                {OPERATORS.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
            <FormField label={t('admin.ops.alertRules.form.threshold')}>
              <Input
                type="number"
                step="any"
                value={editing.threshold}
                onChange={(e) => set({ threshold: Number(e.target.value) })}
              />
            </FormField>
            <FormField label={t('admin.ops.alertRules.form.window')}>
              <NativeSelect
                value={editing.window_minutes}
                onChange={(e) => set({ window_minutes: Number(e.target.value) })}
              >
                {[1, 5, 60].map((w) => (
                  <option key={w} value={w}>
                    {w}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
            <FormField label={t('admin.ops.alertRules.form.sustained')}>
              <Input
                type="number"
                min={1}
                max={1440}
                value={editing.sustained_minutes}
                onChange={(e) => set({ sustained_minutes: Number(e.target.value) })}
              />
            </FormField>
            <FormField label={t('admin.ops.alertRules.form.cooldown')}>
              <Input
                type="number"
                min={0}
                max={1440}
                value={editing.cooldown_minutes}
                onChange={(e) => set({ cooldown_minutes: Number(e.target.value) })}
              />
            </FormField>
            <div className="grid gap-2">
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={editing.enabled} onCheckedChange={(v) => set({ enabled: v })} />
                {t('admin.ops.alertRules.form.enabled')}
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={editing.notify_email} onCheckedChange={(v) => set({ notify_email: v })} />
                {t('admin.ops.alertRules.form.notifyEmail')}
              </label>
            </div>
          </div>
        ) : null}
      </AdminFormDialog>

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={t('admin.ops.alertRules.deleteConfirmTitle')}
        description={t('admin.ops.alertRules.deleteConfirmMessage')}
        destructive
        onConfirm={async () => {
          const r = removing
          setRemoving(null)
          if (!r?.id) return
          const ok = await run(() => opsAPI.deleteAlertRule(r.id!), {
            success: t('admin.ops.alertRules.deleteSuccess'),
            fallback: t('admin.ops.alertRules.deleteFailed')
          })
          if (ok !== undefined) void refresh()
        }}
      />
    </>
  )
}

/* ------------------------------ 设置 ------------------------------ */
const splitList = (s: string) =>
  s
    .split(/[\n,;]/)
    .map((x) => x.trim())
    .filter(Boolean)

export function OpsSettingsDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { busy, run } = useAdminAction()
  const [adv, setAdv] = React.useState<OpsAdvancedSettings | null>(null)
  const [rt, setRt] = React.useState<OpsAlertRuntimeSettings | null>(null)
  const [email, setEmail] = React.useState<EmailNotificationConfig | null>(null)
  const [alertRecipients, setAlertRecipients] = React.useState('')
  const [reportRecipients, setReportRecipients] = React.useState('')
  const [loadErr, setLoadErr] = React.useState(false)

  React.useEffect(() => {
    let alive = true
    Promise.all([
      opsAPI.getAdvancedSettings(),
      opsAPI.getAlertRuntimeSettings(),
      opsAPI.getEmailNotificationConfig()
    ])
      .then(([a, r, e]) => {
        if (!alive) return
        setAdv(a)
        setRt(r)
        setEmail(e)
        setAlertRecipients((e.alert.recipients ?? []).join('\n'))
        setReportRecipients((e.report.recipients ?? []).join('\n'))
      })
      .catch((err) => {
        if (!alive) return
        setLoadErr(true)
        notifyError(err, t('admin.ops.settings.loadFailed'))
      })
    return () => {
      alive = false
    }
  }, [])

  const save = async () => {
    if (!adv || !rt || !email) return
    const ok = await run(
      async () => {
        await opsAPI.updateAdvancedSettings(adv)
        await opsAPI.updateAlertRuntimeSettings(rt)
        await opsAPI.updateEmailNotificationConfig({
          alert: { ...email.alert, recipients: splitList(alertRecipients) },
          report: { ...email.report, recipients: splitList(reportRecipients) }
        })
        return true
      },
      { success: t('admin.ops.settings.saveSuccess'), fallback: t('admin.ops.settings.saveFailed') }
    )
    if (ok) {
      onSaved()
      onClose()
    }
  }
  const sw = (label: string, checked: boolean, on: (v: boolean) => void, hint?: string) => (
    <label className="flex items-start justify-between gap-3 rounded-md border p-3 text-sm">
      <span>
        {label}
        {hint ? <span className="block text-xs text-muted-foreground">{hint}</span> : null}
      </span>
      <Switch checked={checked} onCheckedChange={on} aria-label={label} />
    </label>
  )
  const patchAdv = (p: Partial<OpsAdvancedSettings>) => setAdv((a) => (a ? { ...a, ...p } : a))
  const num = (v: string) => Number(v)
  return (
    <AdminFormDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={t('admin.ops.settings.title')}
      size="xl"
      onSubmit={save}
      submitting={busy}
      submitDisabled={!adv || !rt || !email}
    >
      {loadErr ? (
        <p className="text-sm text-destructive">{t('admin.ops.settings.loadFailed')}</p>
      ) : !adv || !rt || !email ? (
        <Skeleton className="h-48" />
      ) : (
        <Tabs defaultValue="dashboard">
          <TabsList className="flex h-auto flex-wrap">
            <TabsTrigger value="dashboard">{t('admin.ops.settings.dashboardCards')}</TabsTrigger>
            <TabsTrigger value="retention">{t('admin.ops.settings.dataRetention')}</TabsTrigger>
            <TabsTrigger value="alert">{t('admin.ops.runtime.alertTitle')}</TabsTrigger>
            <TabsTrigger value="email">{t('admin.ops.email.title')}</TabsTrigger>
          </TabsList>
          <TabsContent value="dashboard" className="grid gap-3">
            {sw(
              t('admin.ops.settings.enableAutoRefresh'),
              adv.auto_refresh_enabled,
              (v) => patchAdv({ auto_refresh_enabled: v }),
              t('admin.ops.settings.enableAutoRefreshHint')
            )}
            <FormField label={t('admin.ops.settings.refreshInterval')}>
              <NativeSelect
                value={adv.auto_refresh_interval_seconds}
                onChange={(e) => patchAdv({ auto_refresh_interval_seconds: num(e.target.value) })}
              >
                {[15, 30, 60].map((s) => (
                  <option key={s} value={s}>
                    {t(`admin.ops.settings.refreshInterval${s}s`)}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
            {sw(
              t('admin.ops.settings.displayAlertEvents'),
              adv.display_alert_events,
              (v) => patchAdv({ display_alert_events: v }),
              t('admin.ops.settings.displayAlertEventsHint')
            )}
            {sw(
              t('admin.ops.settings.displayOpenAITokenStats'),
              adv.display_openai_token_stats,
              (v) => patchAdv({ display_openai_token_stats: v }),
              t('admin.ops.settings.displayOpenAITokenStatsHint')
            )}
            <h4 className="mt-2 text-sm font-semibold">{t('admin.ops.settings.errorFiltering')}</h4>
            {sw(
              t('admin.ops.settings.ignoreCountTokensErrors'),
              adv.ignore_count_tokens_errors,
              (v) => patchAdv({ ignore_count_tokens_errors: v }),
              t('admin.ops.settings.ignoreCountTokensErrorsHint')
            )}
            {sw(
              t('admin.ops.settings.ignoreContextCanceled'),
              adv.ignore_context_canceled,
              (v) => patchAdv({ ignore_context_canceled: v }),
              t('admin.ops.settings.ignoreContextCanceledHint')
            )}
            {sw(
              t('admin.ops.settings.ignoreNoAvailableAccounts'),
              adv.ignore_no_available_accounts,
              (v) => patchAdv({ ignore_no_available_accounts: v }),
              t('admin.ops.settings.ignoreNoAvailableAccountsHint')
            )}
            {sw(
              t('admin.ops.settings.ignoreInsufficientBalanceErrors'),
              adv.ignore_insufficient_balance_errors,
              (v) => patchAdv({ ignore_insufficient_balance_errors: v }),
              t('admin.ops.settings.ignoreInsufficientBalanceErrorsHint')
            )}
          </TabsContent>
          <TabsContent value="retention" className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              {sw(t('admin.ops.settings.enableCleanup'), adv.data_retention.cleanup_enabled, (v) =>
                patchAdv({ data_retention: { ...adv.data_retention, cleanup_enabled: v } })
              )}
            </div>
            <FormField
              label={t('admin.ops.settings.cleanupSchedule')}
              description={t('admin.ops.settings.cleanupScheduleHint')}
              className="sm:col-span-2"
            >
              <Input
                value={adv.data_retention.cleanup_schedule}
                onChange={(e) =>
                  patchAdv({ data_retention: { ...adv.data_retention, cleanup_schedule: e.target.value } })
                }
              />
            </FormField>
            <FormField label={t('admin.ops.settings.errorLogRetentionDays')}>
              <Input
                type="number"
                min={1}
                value={adv.data_retention.error_log_retention_days}
                onChange={(e) =>
                  patchAdv({
                    data_retention: { ...adv.data_retention, error_log_retention_days: num(e.target.value) }
                  })
                }
              />
            </FormField>
            <FormField label={t('admin.ops.settings.minuteMetricsRetentionDays')}>
              <Input
                type="number"
                min={1}
                value={adv.data_retention.minute_metrics_retention_days}
                onChange={(e) =>
                  patchAdv({
                    data_retention: {
                      ...adv.data_retention,
                      minute_metrics_retention_days: num(e.target.value)
                    }
                  })
                }
              />
            </FormField>
            <FormField label={t('admin.ops.settings.hourlyMetricsRetentionDays')}>
              <Input
                type="number"
                min={1}
                value={adv.data_retention.hourly_metrics_retention_days}
                onChange={(e) =>
                  patchAdv({
                    data_retention: {
                      ...adv.data_retention,
                      hourly_metrics_retention_days: num(e.target.value)
                    }
                  })
                }
              />
            </FormField>
            <div className="sm:col-span-2">
              {sw(
                t('admin.ops.settings.enableAggregation'),
                adv.aggregation.aggregation_enabled,
                (v) => patchAdv({ aggregation: { aggregation_enabled: v } }),
                t('admin.ops.settings.aggregationHint')
              )}
            </div>
            <FormField
              label={t('admin.ops.settings.openaiQuotaAutoPauseDefault5h')}
              description={t('admin.ops.settings.openaiQuotaAutoPauseThresholdHint')}
            >
              <Input
                type="number"
                min={0}
                max={1}
                step="0.01"
                value={adv.openai_account_quota_auto_pause.default_threshold_5h}
                onChange={(e) =>
                  patchAdv({
                    openai_account_quota_auto_pause: {
                      ...adv.openai_account_quota_auto_pause,
                      default_threshold_5h: num(e.target.value)
                    }
                  })
                }
              />
            </FormField>
            <FormField label={t('admin.ops.settings.openaiQuotaAutoPauseDefault7d')}>
              <Input
                type="number"
                min={0}
                max={1}
                step="0.01"
                value={adv.openai_account_quota_auto_pause.default_threshold_7d}
                onChange={(e) =>
                  patchAdv({
                    openai_account_quota_auto_pause: {
                      ...adv.openai_account_quota_auto_pause,
                      default_threshold_7d: num(e.target.value)
                    }
                  })
                }
              />
            </FormField>
          </TabsContent>
          <TabsContent value="alert" className="grid gap-3 sm:grid-cols-2">
            <FormField
              label={t('admin.ops.runtime.evalIntervalSeconds')}
              description={t('admin.ops.runtime.evalIntervalHint')}
            >
              <Input
                type="number"
                min={1}
                value={rt.evaluation_interval_seconds}
                onChange={(e) => setRt({ ...rt, evaluation_interval_seconds: num(e.target.value) })}
              />
            </FormField>
            <div />
            <h4 className="text-sm font-semibold sm:col-span-2">{t('admin.ops.runtime.metricThresholds')}</h4>
            {(
              [
                ['sla_percent_min', 'slaMinPercent'],
                ['ttft_p99_ms_max', 'ttftP99MaxMs'],
                ['request_error_rate_percent_max', 'requestErrorRateMaxPercent'],
                ['upstream_error_rate_percent_max', 'upstreamErrorRateMaxPercent']
              ] as const
            ).map(([k, label]) => (
              <FormField
                key={k}
                label={t(`admin.ops.runtime.${label}`)}
                description={t(`admin.ops.runtime.${label}Hint`)}
              >
                <Input
                  type="number"
                  step="any"
                  value={rt.thresholds?.[k] ?? ''}
                  onChange={(e) =>
                    setRt({
                      ...rt,
                      thresholds: {
                        ...rt.thresholds,
                        [k]: e.target.value === '' ? null : num(e.target.value)
                      }
                    })
                  }
                />
              </FormField>
            ))}
          </TabsContent>
          <TabsContent value="email" className="grid gap-3">
            {sw(t('admin.ops.settings.enableAlert'), email.alert.enabled, (v) =>
              setEmail({ ...email, alert: { ...email.alert, enabled: v } })
            )}
            <FormField
              label={t('admin.ops.email.recipients')}
              description={t('admin.ops.email.recipientsHint')}
            >
              <Textarea
                rows={3}
                placeholder={t('admin.ops.settings.emailPlaceholder')}
                value={alertRecipients}
                onChange={(e) => setAlertRecipients(e.target.value)}
              />
            </FormField>
            <div className="grid gap-3 sm:grid-cols-3">
              <FormField label={t('admin.ops.email.minSeverity')}>
                <NativeSelect
                  value={email.alert.min_severity}
                  onChange={(e) =>
                    setEmail({
                      ...email,
                      alert: {
                        ...email.alert,
                        min_severity: e.target.value as EmailNotificationConfig['alert']['min_severity']
                      }
                    })
                  }
                >
                  <option value="">{t('admin.ops.email.minSeverityAll')}</option>
                  {['critical', 'warning', 'info'].map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </NativeSelect>
              </FormField>
              <FormField label={t('admin.ops.email.rateLimitPerHour')}>
                <Input
                  type="number"
                  min={0}
                  value={email.alert.rate_limit_per_hour}
                  onChange={(e) =>
                    setEmail({
                      ...email,
                      alert: { ...email.alert, rate_limit_per_hour: num(e.target.value) }
                    })
                  }
                />
              </FormField>
              <FormField label={t('admin.ops.email.batchWindowSeconds')}>
                <Input
                  type="number"
                  min={0}
                  value={email.alert.batching_window_seconds}
                  onChange={(e) =>
                    setEmail({
                      ...email,
                      alert: { ...email.alert, batching_window_seconds: num(e.target.value) }
                    })
                  }
                />
              </FormField>
            </div>
            {sw(t('admin.ops.email.includeResolved'), email.alert.include_resolved_alerts, (v) =>
              setEmail({ ...email, alert: { ...email.alert, include_resolved_alerts: v } })
            )}
            <h4 className="mt-2 text-sm font-semibold">{t('admin.ops.email.reportTitle')}</h4>
            {sw(
              t('admin.ops.settings.enableReport'),
              email.report.enabled,
              (v) => setEmail({ ...email, report: { ...email.report, enabled: v } }),
              t('admin.ops.email.reportHint')
            )}
            <FormField label={t('admin.ops.email.recipients')}>
              <Textarea
                rows={3}
                value={reportRecipients}
                onChange={(e) => setReportRecipients(e.target.value)}
              />
            </FormField>
            {(
              [
                ['daily_summary_enabled', 'daily_summary_schedule', 'dailySummary'],
                ['weekly_summary_enabled', 'weekly_summary_schedule', 'weeklySummary'],
                ['error_digest_enabled', 'error_digest_schedule', 'errorDigest'],
                ['account_health_enabled', 'account_health_schedule', 'accountHealth']
              ] as const
            ).map(([en, sch, label]) => (
              <div key={en} className="grid items-center gap-2 sm:grid-cols-[1fr_14rem]">
                {sw(t(`admin.ops.email.${label}`), email.report[en], (v) =>
                  setEmail({ ...email, report: { ...email.report, [en]: v } })
                )}
                <Input
                  aria-label={`${t(`admin.ops.email.${label}`)} cron`}
                  placeholder={t('admin.ops.email.cronPlaceholder')}
                  value={email.report[sch]}
                  onChange={(e) => setEmail({ ...email, report: { ...email.report, [sch]: e.target.value } })}
                />
              </div>
            ))}
          </TabsContent>
        </Tabs>
      )}
    </AdminFormDialog>
  )
}
