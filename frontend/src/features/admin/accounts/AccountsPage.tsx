/**
 * /admin/accounts：账号管理。
 * 列表（服务端分页 / 排序）、筛选与排序持久化（account-filter-values / account-table-sort）、
 * 列设置持久化（account-hidden-columns）、自动刷新（account-auto-refresh）、批量操作栏、
 * 行内操作（测试 / 统计 / 调度开关 / 刷新令牌 / 清除错误 / 恢复 / 重置配额 / 复制 / 删除）、导入导出（Step-up）。
 */
import * as React from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { ColumnDef, SortingState } from '@tanstack/react-table'
import { Download, Plus, RefreshCw, Upload } from 'lucide-react'
import { adminAPI } from '@/api/admin'
import { AutoRefreshButton } from '@/components/AutoRefreshButton'
import { ColumnSettings } from '@/components/ColumnSettings'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { DataTable } from '@/components/DataTable'
import { PageHeader } from '@/components/PageHeader'
import { PlatformIcon } from '@/components/PlatformIcon'
import { SearchInput } from '@/components/SearchInput'
import { StatusBadge } from '@/components/StatusBadge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { CONCRETE_PLATFORM_OPTIONS } from '@/constants/platforms'
import { STORAGE_KEYS } from '@/constants/storage'
import { FilterBar, FilterSelect } from '@/features/admin/common/FilterBar'
import { RowActions } from '@/features/admin/common/RowActions'
import { notifyError, notifySuccess } from '@/features/admin/common/notify'
import { useAdminAction } from '@/features/admin/common/useAdminAction'
import { readJSON, useTableState, writeJSON } from '@/features/admin/common/useTableState'
import { TotpStepUpDialog } from '@/features/auth/TotpStepUpDialog'
import { useAutoRefresh } from '@/hooks/useAutoRefresh'
import { useHiddenColumns } from '@/hooks/useHiddenColumns'
import { usePageVisible } from '@/hooks/usePageVisibility'
import { useStepUp } from '@/hooks/useStepUp'
import { t } from '@/i18n'
import { useLocale } from '@/i18n/react'
import type { Account, AccountListItem } from '@/types'
import { formatDateTime, formatRelativeTime } from '@/utils/format'
import { AccountExportDialog, AccountImportDialog } from './AccountDataDialogs'
import { AccountFormDialog } from './AccountFormDialog'
import { AccountStatsDialog } from './AccountStatsDialog'
import { AccountTestDialog } from './AccountTestDialog'
import { accountDisplayStatus, STATUS_TONE } from './accountStatus'

const COLUMN_KEYS = [
  'platform',
  'status',
  'schedulable',
  'priority',
  'concurrency',
  'groups',
  'proxy',
  'last_used_at',
  'expires_at'
]
const SORTABLE = new Set([
  'id',
  'name',
  'status',
  'schedulable',
  'priority',
  'rate_multiplier',
  'last_used_at',
  'created_at',
  'expires_at'
])
const STATUS_FILTERS = [
  'active',
  'inactive',
  'error',
  'rate_limited',
  'temp_unschedulable',
  'unschedulable'
] as const

type Dlg =
  | { kind: 'form'; account: Account | null }
  | { kind: 'test'; account: Account }
  | { kind: 'stats'; account: Account }
  | { kind: 'delete'; account: Account }
  | { kind: 'bulkDelete'; ids: number[] }
  | { kind: 'export'; ids: number[] }
  | { kind: 'import' }
  | null

export function AccountsPage() {
  const locale = useLocale()
  const qc = useQueryClient()
  const stepUp = useStepUp()
  const { run } = useAdminAction()
  const visible = usePageVisible()
  const table = useTableState()
  const [search, setSearch] = React.useState('')
  const [platform, setPlatform] = React.useState('')
  const [type, setType] = React.useState('')
  const [status, setStatus] = React.useState('')
  const [group, setGroup] = React.useState('')
  const [sorting, setSorting] = React.useState<SortingState>([{ id: 'name', desc: false }])
  const [selection, setSelection] = React.useState<Record<string, boolean>>({})
  const [dlg, setDlg] = React.useState<Dlg>(null)
  const columns = useHiddenColumns({
    storageKey: STORAGE_KEYS.accountHiddenColumns,
    allKeys: COLUMN_KEYS,
    defaultHidden: []
  })

  // 水合后恢复持久化的筛选与排序（沿用原存储键与结构）
  React.useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- 水合后一次性读取 localStorage */
    const f = readJSON<{ platform?: string; status?: string }>(STORAGE_KEYS.accountFilterValues, {})
    if (typeof f.platform === 'string' && CONCRETE_PLATFORM_OPTIONS.some((o) => o.value === f.platform))
      setPlatform(f.platform)
    if (typeof f.status === 'string' && (STATUS_FILTERS as readonly string[]).includes(f.status))
      setStatus(f.status)
    const s = readJSON<{ key?: string; order?: string }>(STORAGE_KEYS.accountTableSort, {})
    if (s.key && SORTABLE.has(s.key)) setSorting([{ id: s.key, desc: s.order === 'desc' }])
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [])
  const persistFilters = (next: { platform: string; status: string }) =>
    writeJSON(STORAGE_KEYS.accountFilterValues, next)

  const sort = sorting[0]
  const filters = React.useMemo(
    () => ({
      platform: platform || undefined,
      type: type || undefined,
      status: status || undefined,
      group: group || undefined,
      search: search || undefined,
      sort_by: sort?.id,
      sort_order: sort ? (sort.desc ? ('desc' as const) : ('asc' as const)) : undefined
    }),
    [platform, type, status, group, search, sort]
  )

  const query = useQuery({
    queryKey: ['admin', 'accounts', 'list', table.page, table.pageSize, filters],
    queryFn: ({ signal }) => adminAPI.accounts.list(table.page, table.pageSize, filters, { signal }),
    placeholderData: (p) => p
  })
  const groups = useQuery({
    queryKey: ['admin', 'groups', 'all-including-inactive'],
    queryFn: () => adminAPI.groups.getAllIncludingInactive()
  })
  const proxies = useQuery({
    queryKey: ['admin', 'proxies', 'all'],
    queryFn: () => adminAPI.proxies.getAll()
  })
  const groupName = React.useMemo(
    () => new Map((groups.data ?? []).map((g) => [g.id, g.name])),
    [groups.data]
  )
  const proxyName = React.useMemo(
    () => new Map((proxies.data ?? []).map((p) => [p.id, p.name])),
    [proxies.data]
  )

  const refresh = React.useCallback(
    () => qc.invalidateQueries({ queryKey: ['admin', 'accounts', 'list'] }),
    [qc]
  )
  const auto = useAutoRefresh({
    storageKey: STORAGE_KEYS.accountAutoRefresh,
    intervals: [5, 10, 15, 30],
    onRefresh: async () => {
      await refresh()
    },
    shouldPause: () => !visible || query.isFetching || dlg !== null
  })

  const mutate = async (fn: () => Promise<unknown>, success: string, fallback?: string) => {
    const ok = await run(fn, { success, fallback })
    if (ok !== undefined) void refresh()
  }

  const items = React.useMemo(() => query.data?.items ?? [], [query.data])
  const cols = React.useMemo<ColumnDef<AccountListItem, unknown>[]>(
    () => [
      {
        id: 'name',
        header: t('admin.accounts.columns.name'),
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="max-w-56 truncate font-medium">{row.original.name}</p>
            <p className="text-xs text-muted-foreground">
              #{row.original.id} · {row.original.type}
            </p>
          </div>
        )
      },
      {
        id: 'platform',
        enableSorting: false,
        header: t('admin.accounts.columns.platform'),
        cell: ({ row }) => (
          <span className="inline-flex items-center gap-1.5">
            <PlatformIcon platform={row.original.platform} />
            {row.original.platform}
          </span>
        )
      },
      {
        id: 'status',
        header: t('admin.accounts.columns.status'),
        cell: ({ row }) => {
          const s = accountDisplayStatus(row.original)
          const label =
            s === 'rate_limited'
              ? t('admin.accounts.status.rateLimited')
              : s === 'overloaded'
                ? t('admin.accounts.status.overloaded')
                : s === 'temp_unschedulable'
                  ? t('admin.accounts.status.tempUnschedulable')
                  : s === 'unschedulable'
                    ? t('admin.accounts.status.unschedulable')
                    : t(`admin.accounts.status.${s}`)
          return (
            <div className="space-y-0.5">
              <StatusBadge status={STATUS_TONE[s]}>{label}</StatusBadge>
              {s === 'error' && row.original.error_message ? (
                <p className="max-w-52 truncate text-xs text-destructive" title={row.original.error_message}>
                  {row.original.error_message}
                </p>
              ) : null}
            </div>
          )
        }
      },
      {
        id: 'schedulable',
        header: t('admin.accounts.schedulable'),
        cell: ({ row }) => (
          <Switch
            checked={row.original.schedulable}
            aria-label={`${t('admin.accounts.schedulable')} ${row.original.name}`}
            onCheckedChange={(v) =>
              void mutate(
                () => adminAPI.accounts.setSchedulable(row.original.id, v),
                v ? t('admin.accounts.schedulableEnabled') : t('admin.accounts.schedulableDisabled'),
                t('admin.accounts.failedToToggleSchedulable')
              )
            }
          />
        )
      },
      {
        id: 'priority',
        header: t('admin.accounts.columns.priority'),
        cell: ({ row }) => <span className="tabular">{row.original.priority}</span>
      },
      {
        id: 'concurrency',
        enableSorting: false,
        header: t('admin.accounts.columns.capacity'),
        cell: ({ row }) => (
          <span className="tabular">
            {row.original.current_concurrency ?? 0}/{row.original.concurrency}
          </span>
        )
      },
      {
        id: 'groups',
        enableSorting: false,
        header: t('admin.accounts.columns.groups'),
        cell: ({ row }) => {
          const gs = (row.original.group_ids ?? []).map((id) => ({ id, name: groupName.get(id) ?? `#${id}` }))
          if (gs.length === 0)
            return <span className="text-muted-foreground">{t('admin.accounts.ungroupedGroup')}</span>
          return (
            <div className="flex max-w-56 flex-wrap gap-1">
              {gs.slice(0, 2).map((g) => (
                <Badge key={g.id} variant="secondary">
                  {g.name}
                </Badge>
              ))}
              {gs.length > 2 ? <Badge variant="outline">+{gs.length - 2}</Badge> : null}
            </div>
          )
        }
      },
      {
        id: 'proxy',
        enableSorting: false,
        header: t('admin.accounts.columns.proxy'),
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {row.original.proxy_id
              ? (proxyName.get(row.original.proxy_id) ?? `#${row.original.proxy_id}`)
              : '—'}
          </span>
        )
      },
      {
        id: 'last_used_at',
        header: t('admin.accounts.columns.lastUsed'),
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {row.original.last_used_at ? formatRelativeTime(row.original.last_used_at) : '—'}
          </span>
        )
      },
      {
        id: 'expires_at',
        header: t('admin.accounts.columns.expiresAt'),
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {row.original.expires_at
              ? formatDateTime(new Date(row.original.expires_at * 1000).toISOString())
              : '—'}
          </span>
        )
      },
      {
        id: 'actions',
        enableSorting: false,
        header: () => <span className="sr-only">{t('admin.accounts.columns.actions')}</span>,
        cell: ({ row }) => {
          const a = row.original
          return (
            <RowActions
              actions={[
                {
                  key: 'edit',
                  label: t('common.edit'),
                  onSelect: () => setDlg({ kind: 'form', account: a })
                },
                {
                  key: 'test',
                  label: t('admin.accounts.testConnection'),
                  onSelect: () => setDlg({ kind: 'test', account: a })
                },
                {
                  key: 'stats',
                  label: t('admin.accounts.viewStats'),
                  onSelect: () => setDlg({ kind: 'stats', account: a })
                },
                {
                  key: 'refresh',
                  label: t('admin.accounts.refreshToken'),
                  hidden: a.type !== 'oauth' && a.type !== 'setup-token',
                  onSelect: () =>
                    void mutate(
                      () => adminAPI.accounts.refreshCredentials(a.id),
                      t('admin.accounts.tokenRefreshed')
                    )
                },
                {
                  key: 'clearError',
                  separator: true,
                  label: t('adminUi.accounts.clearError'),
                  hidden: a.status !== 'error',
                  onSelect: () => void mutate(() => adminAPI.accounts.clearError(a.id), t('common.saved'))
                },
                {
                  key: 'clearRate',
                  label: t('admin.accounts.clearRateLimit'),
                  onSelect: () =>
                    void mutate(
                      () => adminAPI.accounts.clearRateLimit(a.id),
                      t('admin.accounts.rateLimitCleared'),
                      t('admin.accounts.failedToClearRateLimit')
                    )
                },
                {
                  key: 'recover',
                  label: t('admin.accounts.recoverState'),
                  onSelect: () =>
                    void mutate(
                      () => adminAPI.accounts.recoverState(a.id),
                      t('admin.accounts.recoverStateSuccess'),
                      t('admin.accounts.recoverStateFailed')
                    )
                },
                {
                  key: 'resetQuota',
                  label: t('admin.accounts.resetQuota'),
                  onSelect: () =>
                    void mutate(() => adminAPI.accounts.resetAccountQuota(a.id), t('common.saved'))
                },
                {
                  key: 'dup',
                  label: t('adminUi.accounts.duplicate'),
                  onSelect: () => void mutate(() => adminAPI.accounts.duplicate(a.id), t('common.saved'))
                },
                {
                  key: 'delete',
                  separator: true,
                  label: t('common.delete'),
                  destructive: true,
                  onSelect: () => setDlg({ kind: 'delete', account: a })
                }
              ]}
            />
          )
        }
      }
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 列定义只依赖语言与代理名称
    [locale, proxyName, groupName]
  )
  const visibility = React.useMemo(
    () => Object.fromEntries(columns.hidden.map((k) => [k, false])),
    [columns.hidden]
  )

  const onSortingChange = (u: SortingState | ((o: SortingState) => SortingState)) => {
    const next = typeof u === 'function' ? u(sorting) : u
    setSorting(next)
    table.setPage(1)
    if (next[0])
      writeJSON(STORAGE_KEYS.accountTableSort, { key: next[0].id, order: next[0].desc ? 'desc' : 'asc' })
  }

  const bulk = async (
    ids: number[],
    fn: () => Promise<{ success?: number; failed?: number } | undefined>,
    successKey: string
  ) => {
    const res = await run(fn)
    if (!res) return
    const failed = res.failed ?? 0
    if (failed > 0)
      notifyError(
        new Error(
          t('admin.accounts.bulkActions.partialSuccess', {
            success: res.success ?? ids.length - failed,
            failed
          })
        )
      )
    else notifySuccess(t(successKey, { count: res.success ?? ids.length }))
    setSelection({})
    void refresh()
  }

  return (
    <div>
      <PageHeader
        title={t('admin.accounts.title')}
        description={t('admin.accounts.description')}
        actions={
          <>
            <Button variant="outline" aria-label={t('common.refresh')} onClick={() => void refresh()}>
              <RefreshCw className={query.isFetching ? 'animate-spin' : undefined} aria-hidden />
            </Button>
            <AutoRefreshButton
              enabled={auto.enabled}
              intervals={auto.intervals}
              intervalSeconds={auto.intervalSeconds}
              countdown={auto.countdown}
              onEnabledChange={auto.setEnabled}
              onIntervalChange={auto.setInterval}
            />
            <ColumnSettings
              columns={COLUMN_KEYS.map((k) => ({
                key: k,
                label: t(
                  `admin.accounts.columns.${k === 'concurrency' ? 'capacity' : k === 'last_used_at' ? 'lastUsed' : k === 'expires_at' ? 'expiresAt' : k === 'schedulable' ? 'schedulable' : k}`
                )
              }))}
              isVisible={columns.isVisible}
              onToggle={columns.toggle}
              label={t('admin.accounts.viewColumns')}
            />
            <Button variant="outline" onClick={() => setDlg({ kind: 'import' })}>
              <Upload aria-hidden />
              <span className="hidden md:inline">{t('admin.accounts.dataImport')}</span>
            </Button>
            <Button variant="outline" onClick={() => setDlg({ kind: 'export', ids: [] })}>
              <Download aria-hidden />
              <span className="hidden md:inline">{t('admin.accounts.dataExport')}</span>
            </Button>
            <Button onClick={() => setDlg({ kind: 'form', account: null })}>
              <Plus aria-hidden />
              {t('admin.accounts.createAccount')}
            </Button>
          </>
        }
      />
      <FilterBar
        onReset={() => {
          setSearch('')
          setPlatform('')
          setType('')
          setStatus('')
          setGroup('')
          persistFilters({ platform: '', status: '' })
          table.setPage(1)
        }}
      >
        <SearchInput
          value={search}
          onValueChange={(v) => {
            setSearch(v)
            table.setPage(1)
          }}
          placeholder={t('admin.accounts.searchAccounts')}
          containerClassName="w-full sm:w-72"
        />
        <FilterSelect
          label={t('admin.accounts.columns.platform')}
          value={platform}
          onChange={(v) => {
            setPlatform(v)
            persistFilters({ platform: v, status })
            table.setPage(1)
          }}
          options={[
            { value: '', label: t('admin.accounts.allPlatforms') },
            ...CONCRETE_PLATFORM_OPTIONS.map((o) => ({ value: o.value, label: o.label }))
          ]}
        />
        <FilterSelect
          label={t('admin.accounts.columns.type')}
          value={type}
          onChange={(v) => {
            setType(v)
            table.setPage(1)
          }}
          options={[
            { value: '', label: t('admin.accounts.allTypes') },
            { value: 'oauth', label: t('admin.accounts.oauthType') },
            { value: 'setup-token', label: t('admin.accounts.setupToken') },
            { value: 'apikey', label: t('admin.accounts.apiKey') }
          ]}
        />
        <FilterSelect
          label={t('admin.accounts.columns.status')}
          value={status}
          onChange={(v) => {
            setStatus(v)
            persistFilters({ platform, status: v })
            table.setPage(1)
          }}
          options={[
            { value: '', label: t('admin.accounts.allStatus') },
            ...STATUS_FILTERS.map((s) => ({
              value: s,
              label:
                s === 'rate_limited'
                  ? t('admin.accounts.status.rateLimited')
                  : s === 'temp_unschedulable'
                    ? t('admin.accounts.status.tempUnschedulable')
                    : t(`admin.accounts.status.${s}`)
            }))
          ]}
        />
        <FilterSelect
          label={t('admin.accounts.columns.groups')}
          value={group}
          onChange={(v) => {
            setGroup(v)
            table.setPage(1)
          }}
          options={[
            { value: '', label: t('admin.accounts.allGroups') },
            { value: 'ungrouped', label: t('admin.accounts.ungroupedGroup') },
            ...(groups.data ?? []).map((g) => ({ value: String(g.id), label: g.name }))
          ]}
        />
      </FilterBar>

      <DataTable
        columns={cols}
        data={items}
        loading={query.isLoading}
        getRowId={(a) => String(a.id)}
        selectable
        rowSelection={selection}
        onRowSelectionChange={(u) => setSelection(typeof u === 'function' ? u(selection) : u)}
        columnVisibility={visibility}
        sorting={sorting}
        onSortingChange={onSortingChange}
        pagination={table.pagination(query.data?.total ?? 0)}
        emptyTitle={t('admin.accounts.noAccountsYet')}
        emptyDescription={t('admin.accounts.createFirstAccount')}
        bulkActions={(selected) => {
          const ids = selected.map((a) => a.id)
          return (
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  void bulk(
                    ids,
                    () => adminAPI.accounts.bulkUpdate(ids, { schedulable: true }),
                    'admin.accounts.bulkSchedulableEnabled'
                  )
                }
              >
                {t('admin.accounts.bulkActions.enableScheduling')}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  void bulk(
                    ids,
                    () => adminAPI.accounts.bulkUpdate(ids, { schedulable: false }),
                    'admin.accounts.bulkSchedulableDisabled'
                  )
                }
              >
                {t('admin.accounts.bulkActions.disableScheduling')}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  void bulk(
                    ids,
                    () => adminAPI.accounts.batchClearError(ids),
                    'admin.accounts.bulkActions.resetStatusSuccess'
                  )
                }
              >
                {t('admin.accounts.bulkActions.resetStatus')}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  void bulk(
                    ids,
                    () => adminAPI.accounts.batchRefresh(ids),
                    'admin.accounts.bulkActions.refreshTokenSuccess'
                  )
                }
              >
                {t('admin.accounts.bulkActions.refreshToken')}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setDlg({ kind: 'export', ids })}>
                {t('admin.accounts.dataExportSelected')}
              </Button>
              <Button size="sm" variant="destructive" onClick={() => setDlg({ kind: 'bulkDelete', ids })}>
                {t('admin.accounts.bulkActions.delete')}
              </Button>
            </div>
          )
        }}
      />

      {dlg?.kind === 'form' ? (
        <AccountFormDialog
          account={dlg.account}
          onClose={() => setDlg(null)}
          onSaved={() => {
            setDlg(null)
            void refresh()
          }}
        />
      ) : null}
      {dlg?.kind === 'test' ? <AccountTestDialog account={dlg.account} onClose={() => setDlg(null)} /> : null}
      {dlg?.kind === 'stats' ? (
        <AccountStatsDialog account={dlg.account} onClose={() => setDlg(null)} />
      ) : null}
      {dlg?.kind === 'export' ? (
        <AccountExportDialog ids={dlg.ids} filters={filters} stepUp={stepUp} onClose={() => setDlg(null)} />
      ) : null}
      {dlg?.kind === 'import' ? (
        <AccountImportDialog stepUp={stepUp} onClose={() => setDlg(null)} onImported={() => void refresh()} />
      ) : null}
      <ConfirmDialog
        open={dlg?.kind === 'delete'}
        onOpenChange={(o) => !o && setDlg(null)}
        title={t('admin.accounts.deleteAccount')}
        description={
          dlg?.kind === 'delete' ? t('admin.accounts.deleteConfirm', { name: dlg.account.name }) : undefined
        }
        destructive
        confirmText={t('common.delete')}
        onConfirm={async () => {
          if (dlg?.kind !== 'delete') return
          const a = dlg.account
          const ok = await run(() => adminAPI.accounts.delete(a.id), {
            success: t('admin.accounts.accountDeleted')
          })
          if (ok) {
            setDlg(null)
            void refresh()
          }
        }}
      />
      <ConfirmDialog
        open={dlg?.kind === 'bulkDelete'}
        onOpenChange={(o) => !o && setDlg(null)}
        title={t('admin.accounts.bulkDeleteTitle')}
        description={
          dlg?.kind === 'bulkDelete'
            ? t('admin.accounts.bulkActions.confirmDelete', { count: dlg.ids.length })
            : undefined
        }
        destructive
        confirmText={t('common.delete')}
        onConfirm={async () => {
          if (dlg?.kind !== 'bulkDelete') return
          const ids = dlg.ids
          setDlg(null)
          await bulk(
            ids,
            () => adminAPI.accounts.batchDelete(ids),
            'admin.accounts.bulkActions.deleteSuccess'
          )
        }}
      />
      <TotpStepUpDialog controller={stepUp} />
    </div>
  )
}
