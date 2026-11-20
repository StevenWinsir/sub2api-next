/** /admin/users：用户管理（列表 / 筛选 / 排序 / 列设置 / 余额 / 分组 / 批量）。 */
import * as React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ColumnDef, SortingState } from '@tanstack/react-table'
import { Plus, RefreshCw } from 'lucide-react'
import { adminAPI } from '@/api/admin'
import { ColumnSettings } from '@/components/ColumnSettings'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { DataTable } from '@/components/DataTable'
import { PageHeader } from '@/components/PageHeader'
import { SearchInput } from '@/components/SearchInput'
import { StatusBadge } from '@/components/StatusBadge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { STORAGE_KEYS } from '@/constants/storage'
import { FilterBar, FilterSelect } from '@/features/admin/common/FilterBar'
import { RowActions } from '@/features/admin/common/RowActions'
import { money } from '@/features/admin/common/fieldUtils'
import { readJSON, useTableState, writeJSON } from '@/features/admin/common/useTableState'
import { notifyError, notifySuccess } from '@/features/admin/common/notify'
import { useAdminAction } from '@/features/admin/common/useAdminAction'
import { TotpStepUpDialog } from '@/features/auth/TotpStepUpDialog'
import { useHiddenColumns } from '@/hooks/useHiddenColumns'
import { useStepUp } from '@/hooks/useStepUp'
import { t } from '@/i18n'
import { useLocale } from '@/i18n/react'
import type { AdminUser } from '@/types'
import { formatDateTime, formatRelativeTime } from '@/utils/format'
import {
  BulkLimitsDialog,
  UserApiKeysDialog,
  UserBalanceDialog,
  UserBalanceHistoryDialog,
  UserFormDialog,
  UserGroupsDialog,
  UserPlatformQuotaDialog
} from './UserDialogs'

const COLUMN_KEYS = [
  'email',
  'username',
  'notes',
  'role',
  'subscriptions',
  'balance',
  'concurrency',
  'status',
  'last_active_at',
  'created_at'
]
const SORT_KEY = 'admin-users-table-sort'
const SERVER_SORTABLE = new Set([
  'email',
  'username',
  'role',
  'balance',
  'concurrency',
  'status',
  'last_active_at',
  'created_at',
  'id'
])

type Dialog =
  | { kind: 'form'; user: AdminUser | null }
  | { kind: 'balance'; user: AdminUser }
  | { kind: 'groups'; user: AdminUser }
  | { kind: 'keys'; user: AdminUser }
  | { kind: 'history'; user: AdminUser }
  | { kind: 'quota'; user: AdminUser }
  | { kind: 'limits'; ids: number[] }
  | { kind: 'delete'; user: AdminUser }
  | { kind: 'bulkDisable'; ids: number[] }
  | null

export function UsersPage() {
  const locale = useLocale()
  const qc = useQueryClient()
  const stepUp = useStepUp()
  const { run } = useAdminAction()
  const table = useTableState()
  const [search, setSearch] = React.useState('')
  const [role, setRole] = React.useState('')
  const [status, setStatus] = React.useState('')
  const [sorting, setSorting] = React.useState<SortingState>([])
  const [selection, setSelection] = React.useState<Record<string, boolean>>({})
  const [dialog, setDialog] = React.useState<Dialog>(null)
  const columns = useHiddenColumns({
    storageKey: STORAGE_KEYS.userHiddenColumns,
    versionKey: STORAGE_KEYS.userColumnSettingsVersion,
    version: 1,
    allKeys: COLUMN_KEYS,
    alwaysVisible: ['email']
  })

  // 水合后读取持久化的排序（沿用原存储键）
  React.useEffect(() => {
    const saved = readJSON<{ key?: string; order?: 'asc' | 'desc' } | null>(SORT_KEY, null)
    if (saved?.key && SERVER_SORTABLE.has(saved.key)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 水合后一次性读取
      setSorting([{ id: saved.key, desc: saved.order === 'desc' }])
    }
  }, [])

  const sort = sorting[0]
  const query = useQuery({
    queryKey: ['admin', 'users', table.page, table.pageSize, search, role, status, sort?.id, sort?.desc],
    queryFn: ({ signal }) =>
      adminAPI.users.list(
        table.page,
        table.pageSize,
        {
          search: search || undefined,
          role: (role || undefined) as 'admin' | 'user' | undefined,
          status: (status || undefined) as 'active' | 'disabled' | undefined,
          include_subscriptions: true,
          sort_by: sort?.id,
          sort_order: sort ? (sort.desc ? 'desc' : 'asc') : undefined
        },
        { signal }
      ),
    placeholderData: (p) => p
  })
  const refresh = () => qc.invalidateQueries({ queryKey: ['admin', 'users'] })
  const closeAndRefresh = () => {
    setDialog(null)
    void refresh()
  }

  const toggleStatus = useMutation({
    mutationFn: (u: AdminUser) =>
      adminAPI.users.toggleStatus(u.id, u.status === 'active' ? 'disabled' : 'active'),
    onSuccess: (u) => {
      notifySuccess(u.status === 'active' ? t('admin.users.userEnabled') : t('admin.users.userDisabled'))
      void refresh()
    },
    onError: (e) => notifyError(e)
  })

  const rows = React.useMemo(() => query.data?.items ?? [], [query.data])

  const cols = React.useMemo<ColumnDef<AdminUser, unknown>[]>(
    () => [
      {
        id: 'email',
        accessorKey: 'email',
        header: t('admin.users.columns.email'),
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="max-w-56 truncate font-medium">{row.original.email}</p>
            <p className="text-xs text-muted-foreground">#{row.original.id}</p>
          </div>
        )
      },
      {
        id: 'username',
        accessorKey: 'username',
        header: t('admin.users.columns.username'),
        cell: ({ row }) => row.original.username || '—'
      },
      {
        id: 'notes',
        enableSorting: false,
        header: t('admin.users.columns.notes'),
        cell: ({ row }) => (
          <span className="block max-w-40 truncate text-muted-foreground">{row.original.notes || '—'}</span>
        )
      },
      {
        id: 'role',
        accessorKey: 'role',
        header: t('admin.users.columns.role'),
        cell: ({ row }) => (
          <Badge variant={row.original.role === 'admin' ? 'info' : 'secondary'}>
            {t(`admin.users.roles.${row.original.role}`)}
          </Badge>
        )
      },
      {
        id: 'subscriptions',
        enableSorting: false,
        header: t('admin.users.columns.subscriptions'),
        cell: ({ row }) => {
          const subs = (row.original.subscriptions ?? []).filter((s) => s.status === 'active')
          if (subs.length === 0)
            return <span className="text-muted-foreground">{t('admin.users.noSubscription')}</span>
          return (
            <div className="flex max-w-60 flex-wrap gap-1">
              {subs.slice(0, 3).map((s) => (
                <Badge key={s.id} variant="success">
                  {s.group?.name ?? `#${s.group_id}`}
                </Badge>
              ))}
              {subs.length > 3 ? <Badge variant="secondary">+{subs.length - 3}</Badge> : null}
            </div>
          )
        }
      },
      {
        id: 'balance',
        accessorKey: 'balance',
        header: t('admin.users.columns.balance'),
        cell: ({ row }) => (
          <button
            type="button"
            className="tabular rounded px-1 font-medium hover:bg-muted"
            onClick={() => setDialog({ kind: 'balance', user: row.original })}
            aria-label={`${t('admin.users.adjustBalance')} ${row.original.email}`}
          >
            {money(row.original.balance)}
          </button>
        )
      },
      {
        id: 'concurrency',
        accessorKey: 'concurrency',
        header: t('admin.users.columns.concurrency'),
        cell: ({ row }) => (
          <span className="tabular">
            {row.original.current_concurrency ?? 0}/{row.original.concurrency || '∞'}
          </span>
        )
      },
      {
        id: 'status',
        accessorKey: 'status',
        header: t('admin.users.columns.status'),
        cell: ({ row }) => (
          <StatusBadge status={row.original.status === 'active' ? 'success' : 'neutral'}>
            {row.original.status === 'active' ? t('common.active') : t('admin.users.disabled')}
          </StatusBadge>
        )
      },
      {
        id: 'last_active_at',
        accessorKey: 'last_active_at',
        header: t('admin.users.columns.lastActive'),
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {row.original.last_active_at ? formatRelativeTime(row.original.last_active_at) : '—'}
          </span>
        )
      },
      {
        id: 'created_at',
        accessorKey: 'created_at',
        header: t('admin.users.columns.created'),
        cell: ({ row }) => (
          <span className="text-muted-foreground">{formatDateTime(row.original.created_at)}</span>
        )
      },
      {
        id: 'actions',
        enableSorting: false,
        header: () => <span className="sr-only">{t('admin.users.columns.actions')}</span>,
        cell: ({ row }) => {
          const u = row.original
          return (
            <RowActions
              actions={[
                {
                  key: 'edit',
                  label: t('common.edit'),
                  onSelect: () => setDialog({ kind: 'form', user: u })
                },
                {
                  key: 'balance',
                  label: t('admin.users.adjustBalance'),
                  onSelect: () => setDialog({ kind: 'balance', user: u })
                },
                {
                  key: 'groups',
                  label: t('admin.users.groupConfig'),
                  onSelect: () => setDialog({ kind: 'groups', user: u })
                },
                {
                  key: 'keys',
                  label: t('admin.users.viewApiKeys'),
                  onSelect: () => setDialog({ kind: 'keys', user: u })
                },
                {
                  key: 'history',
                  label: t('admin.users.balanceHistory'),
                  onSelect: () => setDialog({ kind: 'history', user: u })
                },
                {
                  key: 'quota',
                  label: t('admin.users.platformQuota.menuItem'),
                  onSelect: () => setDialog({ kind: 'quota', user: u })
                },
                {
                  key: 'toggle',
                  separator: true,
                  label: u.status === 'active' ? t('admin.users.disableUser') : t('admin.users.enableUser'),
                  onSelect: () => toggleStatus.mutate(u)
                },
                {
                  key: 'delete',
                  label: t('common.delete'),
                  destructive: true,
                  onSelect: () => setDialog({ kind: 'delete', user: u })
                }
              ]}
            />
          )
        }
      }
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 列定义只依赖语言（t 在渲染时读取）
    [locale]
  )

  const columnVisibility = React.useMemo(
    () => Object.fromEntries(columns.hidden.map((k) => [k, false])),
    [columns.hidden]
  )

  const onSortingChange = (updater: SortingState | ((old: SortingState) => SortingState)) => {
    const next = typeof updater === 'function' ? updater(sorting) : updater
    setSorting(next)
    table.setPage(1)
    if (next[0]) writeJSON(SORT_KEY, { key: next[0].id, order: next[0].desc ? 'desc' : 'asc' })
    else window.localStorage.removeItem(SORT_KEY)
  }

  const bulkDisable = async (ids: number[]) => {
    const res = await run(() => adminAPI.users.batchDisable(ids), { stepUp })
    if (res) {
      notifySuccess(t('admin.users.userDisabled'))
      setSelection({})
      closeAndRefresh()
    }
  }

  return (
    <div>
      <PageHeader
        title={t('admin.users.title')}
        description={t('admin.users.description')}
        actions={
          <>
            <Button variant="outline" onClick={() => void refresh()} aria-label={t('common.refresh')}>
              <RefreshCw className={query.isFetching ? 'animate-spin' : undefined} aria-hidden />
            </Button>
            <ColumnSettings
              columns={COLUMN_KEYS.map((k) => ({ key: k, label: columnLabel(k) }))}
              isVisible={columns.isVisible}
              onToggle={columns.toggle}
            />
            <Button onClick={() => setDialog({ kind: 'form', user: null })}>
              <Plus aria-hidden />
              {t('admin.users.createUser')}
            </Button>
          </>
        }
      />
      <FilterBar
        onReset={() => {
          setSearch('')
          setRole('')
          setStatus('')
          table.setPage(1)
        }}
      >
        <SearchInput
          value={search}
          onValueChange={(v) => {
            setSearch(v)
            table.setPage(1)
          }}
          placeholder={t('admin.users.searchPlaceholder')}
          containerClassName="w-full sm:w-80"
        />
        <FilterSelect
          label={t('admin.users.roleFilter')}
          value={role}
          onChange={(v) => {
            setRole(v)
            table.setPage(1)
          }}
          options={[
            { value: '', label: t('admin.users.allRoles') },
            { value: 'admin', label: t('admin.users.roles.admin') },
            { value: 'user', label: t('admin.users.roles.user') }
          ]}
        />
        <FilterSelect
          label={t('admin.users.statusFilter')}
          value={status}
          onChange={(v) => {
            setStatus(v)
            table.setPage(1)
          }}
          options={[
            { value: '', label: t('admin.users.allStatus') },
            { value: 'active', label: t('common.active') },
            { value: 'disabled', label: t('admin.users.disabled') }
          ]}
        />
      </FilterBar>

      <DataTable
        columns={cols}
        data={rows}
        loading={query.isLoading}
        getRowId={(u) => String(u.id)}
        selectable
        rowSelection={selection}
        onRowSelectionChange={(u) => setSelection(typeof u === 'function' ? u(selection) : u)}
        columnVisibility={columnVisibility}
        sorting={sorting}
        onSortingChange={onSortingChange}
        pagination={table.pagination(query.data?.total ?? 0)}
        emptyTitle={t('admin.users.noUsersYet')}
        emptyDescription={t('admin.users.createFirstUser')}
        bulkActions={(selected) => (
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setDialog({ kind: 'limits', ids: selected.map((u) => u.id) })}
            >
              {t('admin.users.bulkLimits.action', { count: selected.length })}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setDialog({ kind: 'bulkDisable', ids: selected.map((u) => u.id) })}
            >
              {t('admin.users.disableUser')}
            </Button>
          </div>
        )}
      />

      {dialog?.kind === 'form' ? (
        <UserFormDialog
          user={dialog.user}
          onClose={() => setDialog(null)}
          onSaved={closeAndRefresh}
          stepUp={stepUp}
        />
      ) : null}
      {dialog?.kind === 'balance' ? (
        <UserBalanceDialog
          user={dialog.user}
          onClose={() => setDialog(null)}
          onSaved={closeAndRefresh}
          stepUp={stepUp}
        />
      ) : null}
      {dialog?.kind === 'groups' ? (
        <UserGroupsDialog
          user={dialog.user}
          onClose={() => setDialog(null)}
          onSaved={closeAndRefresh}
          stepUp={stepUp}
        />
      ) : null}
      {dialog?.kind === 'keys' ? (
        <UserApiKeysDialog user={dialog.user} onClose={() => setDialog(null)} />
      ) : null}
      {dialog?.kind === 'history' ? (
        <UserBalanceHistoryDialog user={dialog.user} onClose={() => setDialog(null)} />
      ) : null}
      {dialog?.kind === 'quota' ? (
        <UserPlatformQuotaDialog
          user={dialog.user}
          onClose={() => setDialog(null)}
          onSaved={closeAndRefresh}
          stepUp={stepUp}
        />
      ) : null}
      {dialog?.kind === 'limits' ? (
        <BulkLimitsDialog
          userIds={dialog.ids}
          onClose={() => setDialog(null)}
          onSaved={() => {
            setSelection({})
            closeAndRefresh()
          }}
          stepUp={stepUp}
        />
      ) : null}
      <ConfirmDialog
        open={dialog?.kind === 'delete'}
        onOpenChange={(o) => !o && setDialog(null)}
        title={t('admin.users.deleteUser')}
        description={
          dialog?.kind === 'delete' ? t('admin.users.deleteConfirm', { email: dialog.user.email }) : undefined
        }
        destructive
        confirmText={t('common.delete')}
        onConfirm={async () => {
          if (dialog?.kind !== 'delete') return
          const u = dialog.user
          const ok = await run(() => adminAPI.users.delete(u.id), {
            success: t('admin.users.userDeleted'),
            fallback: t('admin.users.failedToDelete'),
            stepUp
          })
          if (ok) closeAndRefresh()
        }}
      />
      <ConfirmDialog
        open={dialog?.kind === 'bulkDisable'}
        onOpenChange={(o) => !o && setDialog(null)}
        title={t('admin.users.disableUser')}
        description={
          dialog?.kind === 'bulkDisable'
            ? t('admin.users.bulkLimits.selectedCount', { count: dialog.ids.length })
            : undefined
        }
        destructive
        onConfirm={async () => {
          if (dialog?.kind === 'bulkDisable') await bulkDisable(dialog.ids)
        }}
      />
      <TotpStepUpDialog controller={stepUp} />
    </div>
  )
}

function columnLabel(key: string): string {
  const map: Record<string, string> = {
    email: 'email',
    username: 'username',
    notes: 'notes',
    role: 'role',
    subscriptions: 'subscriptions',
    balance: 'balance',
    concurrency: 'concurrency',
    status: 'status',
    last_active_at: 'lastActive',
    created_at: 'created'
  }
  return t(`admin.users.columns.${map[key] ?? key}`)
}
