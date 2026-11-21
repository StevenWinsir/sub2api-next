/** /admin/usage：使用记录（统计卡 / 多维筛选 / 明细表 / CSV 导出 / 清理任务）。 */
import * as React from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { ColumnDef, SortingState } from '@tanstack/react-table'
import { Download, Eraser, RefreshCw } from 'lucide-react'
import { saveAs } from 'file-saver'
import { adminAPI } from '@/api/admin'
import type { UsageCleanupTask } from '@/api/admin/usage'
import { ColumnSettings } from '@/components/ColumnSettings'
import { DataTable } from '@/components/DataTable'
import { DateRangeBar, DATE_PRESETS, type DateStrRange } from '@/components/DateRangeBar'
import { FormField } from '@/components/FormField'
import { PageHeader } from '@/components/PageHeader'
import { SearchInput } from '@/components/SearchInput'
import { StatCard } from '@/components/StatCard'
import { StatusBadge } from '@/components/StatusBadge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { STORAGE_KEYS } from '@/constants/storage'
import { AdminFormDialog } from '@/features/admin/common/AdminFormDialog'
import { FilterBar, FilterSelect } from '@/features/admin/common/FilterBar'
import { money, numOrUndef } from '@/features/admin/common/fieldUtils'
import { notifySuccess } from '@/features/admin/common/notify'
import { useAdminAction } from '@/features/admin/common/useAdminAction'
import { useTableState } from '@/features/admin/common/useTableState'
import { useDebouncedValue } from '@/hooks/useDebounce'
import { useHiddenColumns } from '@/hooks/useHiddenColumns'
import { t } from '@/i18n'
import { useLocale } from '@/i18n/react'
import type { AdminUsageLog, UsageRequestType } from '@/types'
import { formatCompactNumber, formatDateTime, getBrowserTimeZone } from '@/utils/format'
import { Input } from '@/components/ui/input'
import { Pagination } from '@/components/ui/pagination'

const COLUMN_KEYS = [
  'user',
  'account',
  'model',
  'endpoint',
  'tokens',
  'cost',
  'duration',
  'type',
  'created_at'
]
const REQUEST_TYPES: UsageRequestType[] = ['sync', 'stream', 'ws_v2']

const USAGE_LABELS: Record<string, string> = {
  user: 'admin.usage.user',
  account: 'admin.usage.account',
  model: 'adminUi.usage.model',
  endpoint: 'usage.endpoint',
  tokens: 'usage.tokens',
  cost: 'usage.cost',
  duration: 'usage.duration',
  type: 'adminUi.usage.type',
  created_at: 'adminUi.usage.time'
}
const usageColumnLabel = (k: string) => t(USAGE_LABELS[k] ?? k)

const csvCell = (v: unknown) => {
  const s = String(v ?? '')
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function CleanupDialog({ onClose }: { onClose: () => void }) {
  const { busy, run } = useAdminAction()
  const qc = useQueryClient()
  const [page, setPage] = React.useState(1)
  const [range, setRange] = React.useState<DateStrRange>(() =>
    DATE_PRESETS.find((p) => p.key === '30days')!.range()
  )
  const [userId, setUserId] = React.useState('')
  const [model, setModel] = React.useState('')
  const tasks = useQuery({
    queryKey: ['admin', 'usage', 'cleanup-tasks', page],
    queryFn: () => adminAPI.usage.listCleanupTasks({ page, page_size: 5 }),
    refetchInterval: (q) =>
      (q.state.data?.items ?? []).some((x) => x.status === 'pending' || x.status === 'running') ? 3000 : false
  })
  const submit = async () => {
    const res = await run(
      () =>
        adminAPI.usage.createCleanupTask({
          start_date: range.start,
          end_date: range.end,
          timezone: getBrowserTimeZone(),
          ...(numOrUndef(userId) ? { user_id: numOrUndef(userId) } : {}),
          ...(model.trim() ? { model: model.trim() } : {})
        }),
      { success: t('admin.usage.cleanup.submitSuccess') }
    )
    if (res) void qc.invalidateQueries({ queryKey: ['admin', 'usage', 'cleanup-tasks'] })
  }
  const cancel = async (task: UsageCleanupTask) => {
    const ok = await run(() => adminAPI.usage.cancelCleanupTask(task.id), {
      success: t('admin.usage.cleanup.cancelSuccess')
    })
    if (ok) void tasks.refetch()
  }
  return (
    <AdminFormDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={t('admin.usage.cleanup.title')}
      description={t('admin.usage.cleanup.warning')}
      onSubmit={submit}
      submitting={busy}
      destructive
      submitText={t('admin.usage.cleanup.submit')}
      size="lg"
    >
      <DateRangeBar value={range} onChange={setRange} presets={['30days', 'thisMonth', 'lastMonth']} />
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label={t('adminUi.usage.userId')}>
          <Input type="number" value={userId} onChange={(e) => setUserId(e.target.value)} />
        </FormField>
        <FormField label={t('adminUi.usage.model')}>
          <Input value={model} onChange={(e) => setModel(e.target.value)} />
        </FormField>
      </div>
      <section aria-label={t('admin.usage.cleanup.recentTasks')} className="space-y-2">
        <h3 className="text-sm font-semibold">{t('admin.usage.cleanup.recentTasks')}</h3>
        <ul className="divide-y rounded-md border text-sm">
          {(tasks.data?.items ?? []).map((task) => (
            <li key={task.id} className="flex items-center justify-between gap-3 px-3 py-2">
              <span className="min-w-0 truncate text-xs">
                #{task.id} · {task.filters.start_time.slice(0, 10)} → {task.filters.end_time.slice(0, 10)} ·{' '}
                {task.deleted_rows}
              </span>
              <span className="flex items-center gap-2">
                <Badge
                  variant={
                    task.status === 'succeeded'
                      ? 'success'
                      : task.status === 'failed'
                        ? 'destructive'
                        : 'secondary'
                  }
                >
                  {task.status}
                </Badge>
                {task.status === 'pending' || task.status === 'running' ? (
                  <Button type="button" size="sm" variant="ghost" onClick={() => void cancel(task)}>
                    {t('common.cancel')}
                  </Button>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
        <Pagination
          page={page}
          pageCount={Math.max(1, Math.ceil((tasks.data?.total ?? 0) / 5))}
          onPageChange={setPage}
        />
      </section>
    </AdminFormDialog>
  )
}

export function AdminUsagePage() {
  const locale = useLocale()
  const qc = useQueryClient()
  const { run } = useAdminAction()
  const table = useTableState()
  const [range, setRange] = React.useState<DateStrRange>(() =>
    DATE_PRESETS.find((p) => p.key === '7days')!.range()
  )
  const [model, setModel] = React.useState('')
  const [userSearch, setUserSearch] = React.useState('')
  const [userId, setUserId] = React.useState<number | undefined>(undefined)
  const [requestType, setRequestType] = React.useState('')
  const [groupId, setGroupId] = React.useState('')
  const [sorting, setSorting] = React.useState<SortingState>([{ id: 'created_at', desc: true }])
  const [cleanup, setCleanup] = React.useState(false)
  const [exporting, setExporting] = React.useState<number | null>(null)
  const debouncedModel = useDebouncedValue(model, 300)
  const columns = useHiddenColumns({
    storageKey: STORAGE_KEYS.usageHiddenColumns,
    versionKey: STORAGE_KEYS.usageHiddenColumnsVersion,
    version: 1,
    allKeys: COLUMN_KEYS,
    defaultHidden: ['endpoint']
  })

  const groups = useQuery({
    queryKey: ['admin', 'groups', 'all-including-inactive'],
    queryFn: () => adminAPI.groups.getAllIncludingInactive()
  })
  const userHits = useQuery({
    queryKey: ['admin', 'usage', 'search-users', userSearch],
    queryFn: () => adminAPI.usage.searchUsers(userSearch),
    enabled: userSearch.trim().length >= 2 && userId === undefined
  })

  const base = React.useMemo(
    () => ({
      start_date: range.start,
      end_date: range.end,
      timezone: getBrowserTimeZone(),
      ...(debouncedModel ? { model: debouncedModel } : {}),
      ...(userId ? { user_id: userId } : {}),
      ...(groupId ? { group_id: Number(groupId) } : {}),
      ...(requestType ? { request_type: requestType as UsageRequestType } : {})
    }),
    [range, debouncedModel, userId, groupId, requestType]
  )
  const sort = sorting[0]
  const listParams = React.useMemo(
    () => ({
      ...base,
      page: table.page,
      page_size: table.pageSize,
      sort_by: sort?.id ?? 'created_at',
      sort_order: sort?.desc === false ? ('asc' as const) : ('desc' as const)
    }),
    [base, table.page, table.pageSize, sort]
  )

  const logs = useQuery({
    queryKey: ['admin', 'usage', 'logs', listParams],
    queryFn: ({ signal }) => adminAPI.usage.list(listParams, { signal }),
    placeholderData: (p) => p
  })
  const stats = useQuery({
    queryKey: ['admin', 'usage', 'stats', base],
    queryFn: () => adminAPI.usage.getStats(base)
  })
  const refresh = () => qc.invalidateQueries({ queryKey: ['admin', 'usage'] })

  const exportCsv = async () => {
    setExporting(0)
    const rows: AdminUsageLog[] = []
    const ok = await run(
      async () => {
        const size = 200
        for (let p = 1; p <= 50; p++) {
          const res = await adminAPI.usage.list({
            ...base,
            page: p,
            page_size: size,
            sort_by: 'created_at',
            sort_order: 'desc'
          })
          rows.push(...res.items)
          setExporting(rows.length)
          if (rows.length >= res.total || res.items.length < size) break
        }
        return true
      },
      { fallback: t('usage.exportFailed') }
    )
    setExporting(null)
    if (!ok) return
    const header = [
      'time',
      'user_id',
      'api_key_id',
      'account_id',
      'model',
      'inbound_endpoint',
      'input_tokens',
      'output_tokens',
      'cache_read_tokens',
      'cache_creation_tokens',
      'rate_multiplier',
      'actual_cost',
      'total_cost',
      'duration_ms',
      'request_id'
    ]
    const lines = rows.map((l) =>
      [
        l.created_at,
        l.user_id,
        l.api_key_id,
        l.account_id ?? '',
        l.model,
        l.inbound_endpoint ?? '',
        l.input_tokens,
        l.output_tokens,
        l.cache_read_tokens,
        l.cache_creation_tokens,
        l.rate_multiplier,
        l.actual_cost.toFixed(8),
        l.total_cost.toFixed(8),
        l.duration_ms ?? '',
        l.request_id
      ]
        .map(csvCell)
        .join(',')
    )
    saveAs(
      new Blob(['﻿' + [header.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8;' }),
      `admin_usage_${range.start}_to_${range.end}.csv`
    )
    notifySuccess(t('usage.exportSuccess'))
  }

  const cols = React.useMemo<ColumnDef<AdminUsageLog, unknown>[]>(
    () => [
      {
        id: 'user',
        enableSorting: false,
        header: t('admin.usage.user'),
        cell: ({ row }) => (
          <span className="block max-w-40 truncate">
            {row.original.user?.email ?? `#${row.original.user_id}`}
          </span>
        )
      },
      {
        id: 'account',
        enableSorting: false,
        header: t('admin.usage.account'),
        cell: ({ row }) => (
          <span className="block max-w-36 truncate">
            {row.original.account?.name ?? (row.original.account_id ? `#${row.original.account_id}` : '—')}
          </span>
        )
      },
      {
        id: 'model',
        header: t('adminUi.usage.model'),
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="max-w-52 truncate font-mono text-xs">{row.original.model}</p>
            {row.original.upstream_model && row.original.upstream_model !== row.original.model ? (
              <p className="max-w-52 truncate text-xs text-muted-foreground">
                → {row.original.upstream_model}
              </p>
            ) : null}
          </div>
        )
      },
      {
        id: 'endpoint',
        enableSorting: false,
        header: t('usage.endpoint'),
        cell: ({ row }) => (
          <span className="font-mono text-xs text-muted-foreground">
            {row.original.inbound_endpoint ?? '—'}
          </span>
        )
      },
      {
        id: 'tokens',
        enableSorting: false,
        header: t('usage.tokens'),
        cell: ({ row }) => (
          <span className="tabular text-xs">
            {formatCompactNumber(row.original.input_tokens)} /{' '}
            {formatCompactNumber(row.original.output_tokens)}
            {row.original.cache_read_tokens ? (
              <span className="text-muted-foreground">
                {' '}
                · {formatCompactNumber(row.original.cache_read_tokens)}
              </span>
            ) : null}
          </span>
        )
      },
      {
        id: 'cost',
        enableSorting: false,
        header: t('usage.cost'),
        cell: ({ row }) => (
          <span className="tabular text-xs">
            {money(row.original.actual_cost, 6)}
            {row.original.account_stats_cost != null ? (
              <span className="text-muted-foreground"> ({money(row.original.account_stats_cost, 6)})</span>
            ) : null}
          </span>
        )
      },
      {
        id: 'duration',
        enableSorting: false,
        header: t('usage.duration'),
        cell: ({ row }) => (
          <span className="tabular text-xs">
            {row.original.duration_ms != null ? `${row.original.duration_ms} ms` : '—'}
          </span>
        )
      },
      {
        id: 'type',
        enableSorting: false,
        header: t('adminUi.usage.type'),
        cell: ({ row }) => (
          <StatusBadge status={row.original.stream ? 'info' : 'neutral'} dot={false}>
            {row.original.request_type ?? (row.original.stream ? 'stream' : 'sync')}
          </StatusBadge>
        )
      },
      {
        id: 'created_at',
        header: t('usage.time'),
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">{formatDateTime(row.original.created_at)}</span>
        )
      }
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 只依赖语言
    [locale]
  )
  const visibility = React.useMemo(
    () => Object.fromEntries(columns.hidden.map((k) => [k, false])),
    [columns.hidden]
  )
  const s = stats.data

  return (
    <div>
      <PageHeader
        title={t('admin.usage.title')}
        description={t('admin.usage.description')}
        actions={
          <>
            <Button variant="outline" aria-label={t('common.refresh')} onClick={() => void refresh()}>
              <RefreshCw className={logs.isFetching ? 'animate-spin' : undefined} aria-hidden />
            </Button>
            <ColumnSettings
              columns={COLUMN_KEYS.map((k) => ({ key: k, label: usageColumnLabel(k) }))}
              isVisible={columns.isVisible}
              onToggle={columns.toggle}
            />
            <Button variant="outline" loading={exporting !== null} onClick={() => void exportCsv()}>
              <Download aria-hidden />
              <span className="hidden md:inline">
                {exporting ? `${exporting}…` : t('adminUi.usage.exportCsv')}
              </span>
            </Button>
            <Button variant="outline" onClick={() => setCleanup(true)}>
              <Eraser aria-hidden />
              <span className="hidden md:inline">{t('admin.usage.cleanup.button')}</span>
            </Button>
          </>
        }
      />
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label={t('usage.totalRequests')}
          value={formatCompactNumber(s?.total_requests ?? 0)}
          loading={stats.isLoading}
        />
        <StatCard
          label={t('usage.totalTokens')}
          value={formatCompactNumber(s?.total_tokens ?? 0)}
          loading={stats.isLoading}
        />
        <StatCard
          label={t('usage.totalCost')}
          value={money(s?.total_actual_cost, 4)}
          hint={`${money(s?.total_cost, 4)}`}
          loading={stats.isLoading}
        />
        <StatCard
          label={t('usage.avgDuration')}
          value={`${Math.round(s?.average_duration_ms ?? 0)} ms`}
          loading={stats.isLoading}
        />
      </div>
      <div className="mb-3">
        <DateRangeBar
          value={range}
          onChange={(r) => {
            setRange(r)
            table.setPage(1)
          }}
        />
      </div>
      <FilterBar
        onReset={() => {
          setModel('')
          setUserSearch('')
          setUserId(undefined)
          setRequestType('')
          setGroupId('')
          table.setPage(1)
        }}
      >
        <SearchInput
          value={model}
          onValueChange={(v) => {
            setModel(v)
            table.setPage(1)
          }}
          placeholder={t('adminUi.usage.model')}
          containerClassName="w-full sm:w-56"
        />
        <div className="relative w-full sm:w-64">
          <SearchInput
            value={userSearch}
            onValueChange={(v) => {
              setUserSearch(v)
              setUserId(undefined)
              table.setPage(1)
            }}
            placeholder={t('admin.usage.user')}
          />
          {userHits.data && userId === undefined && userSearch.trim().length >= 2 ? (
            <ul className="absolute z-20 mt-1 max-h-48 w-full overflow-y-auto rounded-md border bg-popover text-sm shadow-md">
              {userHits.data.map((u) => (
                <li key={u.id}>
                  <button
                    type="button"
                    className="w-full truncate px-3 py-1.5 text-left hover:bg-muted"
                    onClick={() => {
                      setUserId(u.id)
                      setUserSearch(u.email)
                      table.setPage(1)
                    }}
                  >
                    {u.email}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <FilterSelect
          label={t('adminUi.usage.type')}
          value={requestType}
          onChange={(v) => {
            setRequestType(v)
            table.setPage(1)
          }}
          options={[
            { value: '', label: t('common.all') },
            ...REQUEST_TYPES.map((x) => ({ value: x, label: x }))
          ]}
        />
        <FilterSelect
          label={t('admin.usage.group')}
          value={groupId}
          onChange={(v) => {
            setGroupId(v)
            table.setPage(1)
          }}
          options={[
            { value: '', label: t('admin.users.allGroups') },
            ...(groups.data ?? []).map((g) => ({ value: String(g.id), label: g.name }))
          ]}
        />
      </FilterBar>
      <DataTable
        columns={cols}
        data={logs.data?.items ?? []}
        loading={logs.isLoading}
        getRowId={(l) => String(l.id)}
        columnVisibility={visibility}
        sorting={sorting}
        onSortingChange={(u) => {
          setSorting(typeof u === 'function' ? u(sorting) : u)
          table.setPage(1)
        }}
        pagination={table.pagination(logs.data?.total ?? 0)}
      />
      {cleanup ? <CleanupDialog onClose={() => setCleanup(false)} /> : null}
    </div>
  )
}
