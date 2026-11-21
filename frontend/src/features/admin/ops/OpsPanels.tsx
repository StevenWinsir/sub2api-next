/** 运维看板面板：并发 / 令牌统计 / 告警事件 / 系统日志。 */
import * as React from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { RefreshCw } from 'lucide-react'
import { opsAPI } from '@/api/admin/ops'
import type {
  AlertEvent,
  OpsOpenAITokenStatsTimeRange,
  OpsRuntimeLogConfig,
  OpsSystemLog
} from '@/api/admin/ops'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { DataTable } from '@/components/DataTable'
import { FormField } from '@/components/FormField'
import { NativeSelect } from '@/components/NativeSelect'
import { StatusBadge } from '@/components/StatusBadge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { AdminFormDialog } from '@/features/admin/common/AdminFormDialog'
import { FilterSelect } from '@/features/admin/common/FilterBar'
import { notifyError, notifySuccess } from '@/features/admin/common/notify'
import { useAdminAction } from '@/features/admin/common/useAdminAction'
import { useTableState } from '@/features/admin/common/useTableState'
import { t } from '@/i18n'
import { useLocale } from '@/i18n/react'
import { cn } from '@/lib/utils'
import { formatDateTime } from '@/utils/format'

const loadTone = (p: number) => (p >= 90 ? 'bg-destructive' : p >= 70 ? 'bg-warning' : 'bg-success')

/* ------------------------------ 并发 ------------------------------ */
export function ConcurrencyCard({
  platform,
  groupId,
  refreshToken,
  enabled
}: {
  platform: string
  groupId: number | null
  refreshToken: number
  enabled: boolean
}) {
  const [view, setView] = React.useState<'platform' | 'user'>('platform')
  const stats = useQuery({
    queryKey: ['admin', 'ops', 'concurrency', platform, groupId, refreshToken],
    queryFn: () => opsAPI.getConcurrencyStats(platform || undefined, groupId),
    enabled: view === 'platform'
  })
  const users = useQuery({
    queryKey: ['admin', 'ops', 'user-concurrency', refreshToken],
    queryFn: () => opsAPI.getUserConcurrencyStats(),
    enabled: view === 'user'
  })
  const rows =
    view === 'platform'
      ? [
          ...Object.values(stats.data?.platform ?? {}).map((p) => ({
            key: `p-${p.platform}`,
            name: p.platform,
            sub: t('admin.ops.concurrency.byPlatform'),
            ...p
          })),
          ...Object.values(stats.data?.group ?? {}).map((g) => ({
            key: `g-${g.group_id}`,
            name: g.group_name,
            sub: g.platform,
            ...g
          })),
          ...Object.values(stats.data?.account ?? {}).map((a) => ({
            key: `a-${a.account_id}`,
            name: a.account_name || `#${a.account_id}`,
            sub: a.group_name,
            ...a
          }))
        ]
      : Object.values(users.data?.user ?? {}).map((u) => ({
          key: `u-${u.user_id}`,
          name: u.username || u.user_email,
          sub: u.user_email,
          ...u
        }))
  const loading = view === 'platform' ? stats.isLoading : users.isLoading
  const unavailable =
    view === 'platform' ? stats.data && !stats.data.enabled : users.data && !users.data.enabled
  return (
    <Card className="flex h-full min-h-[360px] flex-col p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{t('admin.ops.concurrency.title')}</h3>
        <Button
          size="sm"
          variant="ghost"
          title={view === 'platform' ? t('admin.ops.concurrency.showByUserTooltip') : undefined}
          onClick={() => setView((v) => (v === 'platform' ? 'user' : 'platform'))}
        >
          {view === 'platform'
            ? t('admin.ops.concurrency.switchToUser')
            : t('admin.ops.concurrency.switchToPlatform')}
        </Button>
      </div>
      {!enabled || unavailable ? (
        <p className="text-sm text-muted-foreground">{t('admin.ops.concurrency.disabledHint')}</p>
      ) : loading ? (
        <Skeleton className="h-56" />
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('admin.ops.concurrency.empty')}</p>
      ) : (
        <ul className="grid max-h-[290px] gap-2 overflow-y-auto pr-1">
          {rows.map((r) => (
            <li key={r.key} className="text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-medium">{r.name}</span>
                <span className="tabular-nums text-muted-foreground">
                  {r.current_in_use}/{r.max_capacity}
                  {r.waiting_in_queue
                    ? ` · ${t('admin.ops.concurrency.queued', { count: r.waiting_in_queue })}`
                    : ''}
                </span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded bg-muted">
                <div
                  className={cn('h-full', loadTone(r.load_percentage))}
                  style={{ width: `${Math.min(100, r.load_percentage)}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

/* ------------------------------ OpenAI 令牌统计 ------------------------------ */
export function TokenStatsCard({
  platform,
  groupId,
  refreshToken
}: {
  platform: string
  groupId: number | null
  refreshToken: number
}) {
  const [range, setRange] = React.useState<OpsOpenAITokenStatsTimeRange>('30m')
  const [mode, setMode] = React.useState<'topn' | 'page'>('topn')
  const [page, setPage] = React.useState(1)
  const params =
    mode === 'topn'
      ? { time_range: range, platform: platform || undefined, group_id: groupId, top_n: 20 }
      : { time_range: range, platform: platform || undefined, group_id: groupId, page, page_size: 10 }
  const q = useQuery({
    queryKey: ['admin', 'ops', 'token-stats', params, refreshToken],
    queryFn: () => opsAPI.getOpenAITokenStats(params),
    placeholderData: (p) => p
  })
  React.useEffect(() => {
    if (q.error) notifyError(q.error, t('admin.ops.openaiTokenStats.failedToLoad'))
  }, [q.error])
  const pages = Math.max(1, Math.ceil((q.data?.total ?? 0) / 10))
  return (
    <Card className="p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{t('admin.ops.openaiTokenStats.title')}</h3>
        <div className="flex flex-wrap gap-2">
          <FilterSelect
            label={t('admin.ops.systemLogs.timeRange')}
            value={range}
            onChange={(v) => {
              setRange(v as OpsOpenAITokenStatsTimeRange)
              setPage(1)
            }}
            options={(['30m', '1h', '1d', '15d', '30d'] as const).map((r) => ({
              value: r,
              label: t(`admin.ops.timeRange.${r}`)
            }))}
            className="w-32"
          />
          <FilterSelect
            label="mode"
            value={mode}
            onChange={(v) => {
              setMode(v as typeof mode)
              setPage(1)
            }}
            options={[
              { value: 'topn', label: t('admin.ops.openaiTokenStats.viewModeTopN') },
              { value: 'page', label: t('admin.ops.openaiTokenStats.viewModePagination') }
            ]}
            className="w-36"
          />
        </div>
      </div>
      {q.isLoading ? (
        <Skeleton className="h-32" />
      ) : (q.data?.items ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('admin.ops.openaiTokenStats.empty')}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-muted-foreground">
              <tr>
                {(
                  [
                    'model',
                    'requestCount',
                    'avgTokensPerSec',
                    'avgFirstTokenMs',
                    'totalOutputTokens',
                    'avgDurationMs',
                    'requestsWithFirstToken'
                  ] as const
                ).map((k) => (
                  <th key={k} className="px-2 py-1.5 font-medium">
                    {t(`admin.ops.openaiTokenStats.table.${k}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {q.data!.items.map((i) => (
                <tr key={i.model} className="border-t">
                  <td className="px-2 py-1.5 font-mono">{i.model}</td>
                  <td className="px-2 py-1.5 tabular-nums">{i.request_count}</td>
                  <td className="px-2 py-1.5 tabular-nums">
                    {i.avg_tokens_per_sec != null ? i.avg_tokens_per_sec.toFixed(1) : '—'}
                  </td>
                  <td className="px-2 py-1.5 tabular-nums">
                    {i.avg_first_token_ms != null ? Math.round(i.avg_first_token_ms) : '—'}
                  </td>
                  <td className="px-2 py-1.5 tabular-nums">{i.total_output_tokens}</td>
                  <td className="px-2 py-1.5 tabular-nums">{Math.round(i.avg_duration_ms)}</td>
                  <td className="px-2 py-1.5 tabular-nums">{i.requests_with_first_token}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {mode === 'page' ? (
        <div className="mt-3 flex items-center justify-end gap-2 text-xs">
          <span>{t('admin.ops.openaiTokenStats.totalModels', { total: q.data?.total ?? 0 })}</span>
          <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            {t('admin.ops.openaiTokenStats.prevPage')}
          </Button>
          <span>{t('admin.ops.openaiTokenStats.pageInfo', { page, total: pages })}</span>
          <Button size="sm" variant="outline" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
            {t('admin.ops.openaiTokenStats.nextPage')}
          </Button>
        </div>
      ) : null}
    </Card>
  )
}

/* ------------------------------ 告警事件 ------------------------------ */
export function AlertEventsCard({ refreshToken }: { refreshToken: number }) {
  const qc = useQueryClient()
  const { busy, run } = useAdminAction()
  const [status, setStatus] = React.useState('')
  const [severity, setSeverity] = React.useState('')
  const [open, setOpen] = React.useState<AlertEvent | null>(null)
  const q = useQuery({
    queryKey: ['admin', 'ops', 'alert-events', status, severity, refreshToken],
    queryFn: () =>
      opsAPI.listAlertEvents({ limit: 20, status: status || undefined, severity: severity || undefined })
  })
  React.useEffect(() => {
    if (q.error) notifyError(q.error, t('admin.ops.alertEvents.loadFailed'))
  }, [q.error])
  const tone = (s: string) => (s === 'firing' ? 'error' : 'success')
  const sevTone = (s: string) => (s === 'critical' ? 'error' : s === 'warning' ? 'warning' : 'info')
  const statusText = (s: string) =>
    s === 'firing'
      ? t('admin.ops.alertEvents.status.firing')
      : s === 'resolved'
        ? t('admin.ops.alertEvents.status.resolved')
        : s === 'manual_resolved'
          ? t('admin.ops.alertEvents.status.manualResolved')
          : s
  const [now] = React.useState(() => Date.now())
  const duration = (e: AlertEvent) => {
    const end = e.resolved_at ? new Date(e.resolved_at).getTime() : now
    const mins = Math.max(0, Math.round((end - new Date(e.fired_at).getTime()) / 60000))
    return mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`
  }
  const refresh = () => qc.invalidateQueries({ queryKey: ['admin', 'ops', 'alert-events'] })
  return (
    <Card className="p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">{t('admin.ops.alertEvents.title')}</h3>
          <p className="text-xs text-muted-foreground">{t('admin.ops.alertEvents.description')}</p>
        </div>
        <div className="flex gap-2">
          <FilterSelect
            label={t('admin.ops.alertEvents.table.status')}
            value={status}
            onChange={setStatus}
            options={[
              { value: '', label: t('common.all') },
              { value: 'firing', label: t('admin.ops.alertEvents.status.firing') },
              { value: 'resolved', label: t('admin.ops.alertEvents.status.resolved') },
              { value: 'manual_resolved', label: t('admin.ops.alertEvents.status.manualResolved') }
            ]}
            className="w-40"
          />
          <FilterSelect
            label={t('admin.ops.alertEvents.table.severity')}
            value={severity}
            onChange={setSeverity}
            options={[
              { value: '', label: t('common.all') },
              ...['critical', 'warning', 'info'].map((s) => ({ value: s, label: s }))
            ]}
            className="w-32"
          />
          <Button
            size="icon"
            variant="outline"
            aria-label={t('common.refresh')}
            onClick={() => void q.refetch()}
          >
            <RefreshCw className={q.isFetching ? 'animate-spin' : undefined} aria-hidden />
          </Button>
        </div>
      </div>
      {q.isLoading ? (
        <Skeleton className="h-24" />
      ) : (q.data ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('admin.ops.alertEvents.empty')}</p>
      ) : (
        <ul className="divide-y">
          {q.data!.map((e) => (
            <li key={e.id}>
              <button
                type="button"
                className="flex w-full flex-wrap items-center gap-3 py-2 text-left text-sm hover:bg-muted/40"
                onClick={() => setOpen(e)}
              >
                <StatusBadge status={tone(e.status)}>{statusText(e.status)}</StatusBadge>
                <StatusBadge status={sevTone(String(e.severity))} dot={false}>
                  {String(e.severity)}
                </StatusBadge>
                <span className="min-w-0 flex-1 truncate">{e.title || `#${e.rule_id}`}</span>
                <span className="text-xs text-muted-foreground">
                  {e.metric_value != null ? `${e.metric_value.toFixed(2)} / ${e.threshold_value ?? '—'}` : ''}
                </span>
                <span className="text-xs text-muted-foreground">{duration(e)}</span>
                <span className="text-xs whitespace-nowrap text-muted-foreground">
                  {formatDateTime(e.fired_at)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <AdminFormDialog
        open={open !== null}
        onOpenChange={(o) => !o && setOpen(null)}
        title={t('admin.ops.alertEvents.detail.title')}
        size="lg"
      >
        {open ? (
          <div className="grid gap-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={tone(open.status)}>{statusText(open.status)}</StatusBadge>
              <b>{open.title}</b>
            </div>
            {open.description ? <p className="text-muted-foreground">{open.description}</p> : null}
            <dl className="grid gap-2 sm:grid-cols-2">
              <div>
                <dt className="text-xs text-muted-foreground">{t('admin.ops.alertEvents.detail.firedAt')}</dt>
                <dd>{formatDateTime(open.fired_at)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">
                  {t('admin.ops.alertEvents.detail.resolvedAt')}
                </dt>
                <dd>{open.resolved_at ? formatDateTime(open.resolved_at) : '—'}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{t('admin.ops.alertEvents.detail.ruleId')}</dt>
                <dd>{open.rule_id}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{t('admin.ops.alertEvents.table.email')}</dt>
                <dd>
                  {open.email_sent
                    ? t('admin.ops.alertEvents.table.emailSent')
                    : t('admin.ops.alertEvents.table.emailIgnored')}
                </dd>
              </div>
            </dl>
            {open.dimensions && Object.keys(open.dimensions).length ? (
              <div>
                <h4 className="mb-1 text-xs font-semibold text-muted-foreground uppercase">
                  {t('admin.ops.alertEvents.detail.dimensions')}
                </h4>
                <pre className="rounded-md bg-muted/40 p-3 text-xs">
                  {JSON.stringify(open.dimensions, null, 2)}
                </pre>
              </div>
            ) : null}
            {open.status === 'firing' ? (
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  loading={busy}
                  onClick={async () => {
                    const ok = await run(() => opsAPI.updateAlertEventStatus(open.id, 'manual_resolved'), {
                      success: t('admin.ops.alertEvents.detail.manualResolvedSuccess'),
                      fallback: t('admin.ops.alertEvents.detail.manualResolvedFailed')
                    })
                    if (ok !== undefined) {
                      setOpen(null)
                      void refresh()
                    }
                  }}
                >
                  {t('admin.ops.alertEvents.detail.manualResolve')}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  loading={busy}
                  onClick={async () => {
                    const ok = await run(
                      () =>
                        opsAPI.createAlertSilence({
                          rule_id: open.rule_id,
                          platform: String(open.dimensions?.platform ?? ''),
                          group_id: (open.dimensions?.group_id as number | undefined) ?? null,
                          until: new Date(Date.now() + 3_600_000).toISOString(),
                          reason: 'silenced from console'
                        }),
                      {
                        success: t('admin.ops.alertEvents.detail.silenceSuccess'),
                        fallback: t('admin.ops.alertEvents.detail.silenceFailed')
                      }
                    )
                    if (ok !== undefined) {
                      setOpen(null)
                      void refresh()
                    }
                  }}
                >
                  {t('admin.ops.alertEvents.detail.silence')}
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}
      </AdminFormDialog>
    </Card>
  )
}

/* ------------------------------ 系统日志 ------------------------------ */
const LEVELS = ['debug', 'info', 'warn', 'error']
const lvlTone = (l: string) =>
  l === 'error' ? 'error' : l === 'warn' ? 'warning' : l === 'debug' ? 'neutral' : 'info'

export function SystemLogTable({ platform, refreshToken }: { platform: string; refreshToken: number }) {
  const locale = useLocale()
  const table = useTableState(10)
  const { busy, run } = useAdminAction()
  const [f, setF] = React.useState({
    time_range: '1h',
    level: '',
    component: '',
    request_id: '',
    q: '',
    host: ''
  })
  const [applied, setApplied] = React.useState(f)
  const [detail, setDetail] = React.useState<OpsSystemLog | null>(null)
  const [cleanup, setCleanup] = React.useState(false)
  const [cfgOpen, setCfgOpen] = React.useState(false)
  const params = {
    ...applied,
    platform: platform || undefined,
    page: table.page,
    page_size: table.pageSize,
    time_range: applied.time_range as '1h'
  }
  const clean = (o: Record<string, unknown>) =>
    Object.fromEntries(Object.entries(o).filter(([, v]) => v !== '' && v !== undefined))
  const list = useQuery({
    queryKey: ['admin', 'ops', 'syslogs', params, refreshToken],
    queryFn: () => opsAPI.listSystemLogs(clean(params)),
    placeholderData: (p) => p
  })
  const health = useQuery({
    queryKey: ['admin', 'ops', 'syslog-health', refreshToken],
    queryFn: () => opsAPI.getSystemLogSinkHealth()
  })
  React.useEffect(() => {
    if (list.error) notifyError(list.error, t('admin.ops.systemLogs.loadFailed'))
  }, [list.error])
  const search = () => {
    setApplied(f)
    table.setPage(1)
  }
  const columns = React.useMemo<ColumnDef<OpsSystemLog, unknown>[]>(
    () => [
      {
        id: 'time',
        header: t('admin.ops.systemLogs.time'),
        cell: ({ row }) => (
          <span className="text-xs whitespace-nowrap">{formatDateTime(row.original.created_at)}</span>
        )
      },
      {
        id: 'level',
        header: t('admin.ops.systemLogs.level'),
        cell: ({ row }) => (
          <StatusBadge status={lvlTone(row.original.level)}>{row.original.level}</StatusBadge>
        )
      },
      {
        id: 'component',
        header: t('admin.ops.systemLogs.component'),
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.component}</span>
      },
      {
        id: 'message',
        header: t('admin.ops.errorLog.message'),
        cell: ({ row }) => (
          <button
            type="button"
            className="line-clamp-2 max-w-md text-left text-xs hover:underline"
            onClick={() => setDetail(row.original)}
          >
            {row.original.message}
          </button>
        )
      },
      {
        id: 'request',
        header: 'request_id',
        cell: ({ row }) => (
          <span className="font-mono text-xs">{row.original.request_id?.slice(0, 10) || '—'}</span>
        )
      }
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [locale]
  )
  const hasFilter = Object.entries(applied).some(([k, v]) => k !== 'time_range' && v) || Boolean(platform)
  const doCleanup = async () => {
    setCleanup(false)
    if (!hasFilter) return notifyError(new Error(t('admin.ops.systemLogs.cleanupFilterRequired')))
    const body = clean({
      level: applied.level,
      component: applied.component,
      request_id: applied.request_id,
      q: applied.q,
      host: applied.host,
      platform
    })
    const r = await run(() => opsAPI.cleanupSystemLogs(body), {
      fallback: t('admin.ops.systemLogs.cleanupFailed')
    })
    if (r) {
      notifySuccess(t('admin.ops.systemLogs.cleanupSuccess', { count: r.deleted }))
      void list.refetch()
    }
  }
  return (
    <Card className="p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">{t('admin.ops.systemLogs.title')}</h3>
          <p className="text-xs text-muted-foreground">{t('admin.ops.systemLogs.description')}</p>
          {health.data ? (
            <p className="mt-1 text-xs text-muted-foreground">
              {t('admin.ops.systemLogs.queue')} {health.data.queue_depth}/{health.data.queue_capacity} ·{' '}
              {t('admin.ops.systemLogs.written')} {health.data.written_count} ·{' '}
              {t('admin.ops.systemLogs.dropped')} {health.data.dropped_count} ·{' '}
              {t('admin.ops.systemLogs.failed')} {health.data.write_failed_count}
              {health.data.last_error
                ? ` · ${t('admin.ops.systemLogs.latestWriteError')} ${health.data.last_error}`
                : ''}
            </p>
          ) : null}
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setCfgOpen(true)}>
            {t('admin.ops.systemLogs.runtimeConfig')}
          </Button>
          <Button size="sm" variant="destructive" disabled={busy} onClick={() => setCleanup(true)}>
            {t('admin.ops.systemLogs.cleanCurrentFilters')}
          </Button>
        </div>
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <FilterSelect
          label={t('admin.ops.systemLogs.timeRange')}
          value={f.time_range}
          onChange={(v) => setF({ ...f, time_range: v })}
          options={['5m', '30m', '1h', '6h', '24h', '7d', '30d'].map((r) => ({
            value: r,
            label: t(`admin.ops.timeRange.${r}`)
          }))}
          className="w-32"
        />
        <FilterSelect
          label={t('admin.ops.systemLogs.level')}
          value={f.level}
          onChange={(v) => setF({ ...f, level: v })}
          options={[
            { value: '', label: t('admin.ops.systemLogs.all') },
            ...LEVELS.map((l) => ({ value: l, label: l }))
          ]}
          className="w-28"
        />
        <Input
          className="w-40"
          aria-label={t('admin.ops.systemLogs.component')}
          placeholder={t('admin.ops.systemLogs.componentPlaceholder')}
          value={f.component}
          onChange={(e) => setF({ ...f, component: e.target.value })}
          onKeyDown={(e) => e.key === 'Enter' && search()}
        />
        <Input
          className="w-44"
          aria-label="request_id"
          placeholder="request_id"
          value={f.request_id}
          onChange={(e) => setF({ ...f, request_id: e.target.value })}
          onKeyDown={(e) => e.key === 'Enter' && search()}
        />
        <Input
          className="w-48"
          aria-label={t('admin.ops.systemLogs.keyword')}
          placeholder={t('admin.ops.systemLogs.keywordPlaceholder')}
          value={f.q}
          onChange={(e) => setF({ ...f, q: e.target.value })}
          onKeyDown={(e) => e.key === 'Enter' && search()}
        />
        <Button onClick={search}>{t('admin.ops.systemLogs.search')}</Button>
      </div>
      <DataTable
        columns={columns}
        data={list.data?.items ?? []}
        loading={list.isLoading}
        getRowId={(r) => String(r.id)}
        pagination={table.pagination(list.data?.total ?? 0)}
        emptyTitle={t('admin.ops.systemLogs.empty')}
      />
      <AdminFormDialog
        open={detail !== null}
        onOpenChange={(o) => !o && setDetail(null)}
        title={t('admin.ops.systemLogs.logDetails')}
        size="lg"
      >
        {detail ? (
          <pre className="max-h-96 overflow-auto rounded-md bg-muted/40 p-3 font-mono text-xs whitespace-pre-wrap">
            {JSON.stringify(detail, null, 2)}
          </pre>
        ) : null}
      </AdminFormDialog>
      <ConfirmDialog
        open={cleanup}
        onOpenChange={setCleanup}
        title={t('admin.ops.systemLogs.cleanCurrentFilters')}
        description={t('admin.ops.systemLogs.cleanupConfirm')}
        destructive
        onConfirm={() => void doCleanup()}
      />
      {cfgOpen ? <RuntimeLogConfigDialog onClose={() => setCfgOpen(false)} /> : null}
    </Card>
  )
}

function RuntimeLogConfigDialog({ onClose }: { onClose: () => void }) {
  const { busy, run } = useAdminAction()
  const [cfg, setCfg] = React.useState<OpsRuntimeLogConfig | null>(null)
  const [confirmReset, setConfirmReset] = React.useState(false)
  React.useEffect(() => {
    opsAPI
      .getRuntimeLogConfig()
      .then(setCfg)
      .catch((e) => {
        notifyError(e, t('admin.ops.systemLogs.runtimeConfigLoadFailed'))
        onClose()
      })
  }, [onClose])
  const set = (p: Partial<OpsRuntimeLogConfig>) => setCfg((c) => (c ? { ...c, ...p } : c))
  const save = async () => {
    if (!cfg) return
    const days = (n: number) => Number.isInteger(n) && n >= 0 && n <= 3650
    if (!(cfg.retention_days >= 1 && cfg.retention_days <= 3650) || !days(cfg.request_retention_days))
      return notifyError(new Error(t('admin.ops.systemLogs.retentionDaysInvalid')))
    const r = await run(() => opsAPI.updateRuntimeLogConfig(cfg), {
      success: t('admin.ops.systemLogs.runtimeConfigActive'),
      fallback: t('admin.ops.systemLogs.runtimeConfigSaveFailed')
    })
    if (r) setCfg(r)
  }
  return (
    <>
      <AdminFormDialog
        open
        onOpenChange={(o) => !o && onClose()}
        title={t('admin.ops.systemLogs.runtimeConfig')}
        size="lg"
        onSubmit={save}
        submitting={busy}
        submitText={t('admin.ops.systemLogs.saveAndApply')}
        footerExtra={
          <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmReset(true)}>
            {t('admin.ops.systemLogs.resetDefaults')}
          </Button>
        }
      >
        {!cfg ? (
          <Skeleton className="h-40" />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label={t('admin.ops.systemLogs.level')}>
              <NativeSelect
                value={cfg.level}
                onChange={(e) => set({ level: e.target.value as OpsRuntimeLogConfig['level'] })}
              >
                {LEVELS.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
            <FormField label={t('admin.ops.systemLogs.stacktraceThreshold')}>
              <NativeSelect
                value={cfg.stacktrace_level}
                onChange={(e) =>
                  set({ stacktrace_level: e.target.value as OpsRuntimeLogConfig['stacktrace_level'] })
                }
              >
                {['none', 'error', 'fatal'].map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
            <FormField label={t('admin.ops.systemLogs.samplingInitial')}>
              <Input
                type="number"
                min={1}
                value={cfg.sampling_initial}
                onChange={(e) => set({ sampling_initial: Number(e.target.value) })}
              />
            </FormField>
            <FormField label={t('admin.ops.systemLogs.samplingThereafter')}>
              <Input
                type="number"
                min={1}
                value={cfg.sampling_thereafter}
                onChange={(e) => set({ sampling_thereafter: Number(e.target.value) })}
              />
            </FormField>
            <FormField
              label={t('admin.ops.systemLogs.retentionDays')}
              description={t('admin.ops.systemLogs.retentionDaysHint')}
            >
              <Input
                type="number"
                min={1}
                max={3650}
                value={cfg.retention_days}
                onChange={(e) => set({ retention_days: Number(e.target.value) })}
              />
            </FormField>
            <FormField
              label={t('admin.ops.systemLogs.requestRetentionDays')}
              description={t('admin.ops.systemLogs.requestRetentionDaysHint')}
            >
              <Input
                type="number"
                min={0}
                max={3650}
                value={cfg.request_retention_days}
                onChange={(e) => set({ request_retention_days: Number(e.target.value) })}
              />
            </FormField>
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={cfg.caller} onCheckedChange={(v) => set({ caller: v })} />
              {t('admin.ops.systemLogs.caller')}
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={cfg.enable_sampling} onCheckedChange={(v) => set({ enable_sampling: v })} />
              {t('admin.ops.systemLogs.sampling')}
            </label>
            <label className="flex items-start gap-2 text-sm sm:col-span-2">
              <Switch
                checked={cfg.persist_access_logs}
                onCheckedChange={(v) => set({ persist_access_logs: v })}
              />
              <span>
                {t('admin.ops.systemLogs.persistAccessLogs')}
                <span className="block text-xs text-muted-foreground">
                  {t('admin.ops.systemLogs.persistAccessLogsHint')}
                </span>
              </span>
            </label>
          </div>
        )}
      </AdminFormDialog>
      <ConfirmDialog
        open={confirmReset}
        onOpenChange={setConfirmReset}
        title={t('admin.ops.systemLogs.resetDefaults')}
        description={t('admin.ops.systemLogs.resetRuntimeConfigConfirm')}
        onConfirm={async () => {
          setConfirmReset(false)
          const r = await run(() => opsAPI.resetRuntimeLogConfig(), {
            success: t('admin.ops.systemLogs.runtimeConfigReset'),
            fallback: t('admin.ops.systemLogs.runtimeConfigResetFailed')
          })
          if (r) setCfg(r)
        }}
      />
    </>
  )
}
