/** /admin/subscriptions：订阅管理（分配 / 批量分配 / 延期 / 撤销 / 恢复 / 重置配额 / 批量操作）。 */
import * as React from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { Plus, RefreshCw } from 'lucide-react'
import { adminAPI } from '@/api/admin'
import { ColumnSettings } from '@/components/ColumnSettings'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { DataTable } from '@/components/DataTable'
import { FormField } from '@/components/FormField'
import { NativeSelect } from '@/components/NativeSelect'
import { PageHeader } from '@/components/PageHeader'
import { SearchInput } from '@/components/SearchInput'
import { StatusBadge } from '@/components/StatusBadge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { STORAGE_KEYS } from '@/constants/storage'
import { AdminFormDialog } from '@/features/admin/common/AdminFormDialog'
import { FilterBar, FilterSelect } from '@/features/admin/common/FilterBar'
import { money, numOrUndef } from '@/features/admin/common/fieldUtils'
import { notifyError, notifySuccess } from '@/features/admin/common/notify'
import { RowActions } from '@/features/admin/common/RowActions'
import { useAdminAction } from '@/features/admin/common/useAdminAction'
import { useTableState } from '@/features/admin/common/useTableState'
import { useHiddenColumns } from '@/hooks/useHiddenColumns'
import { t } from '@/i18n'
import { useLocale } from '@/i18n/react'
import type { UserSubscription } from '@/types'
import { formatDateTime } from '@/utils/format'

const COLUMN_KEYS = ['group', 'status', 'usage', 'starts_at', 'expires_at']
const STATUSES = ['active', 'expired', 'revoked', 'suspended'] as const
const TONE = { active: 'success', expired: 'warning', revoked: 'error', suspended: 'neutral' } as const

function UsageBar({ used, limit }: { used: number; limit: number | null | undefined }) {
  if (!limit) return <span className="tabular text-xs text-muted-foreground">{money(used)} / ∞</span>
  const pct = Math.min(100, (used / limit) * 100)
  return (
    <div className="w-32 space-y-0.5">
      <Progress value={pct} className="h-1.5" />
      <span className="tabular text-xs text-muted-foreground">
        {money(used)} / {money(limit)}
      </span>
    </div>
  )
}

function AssignDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { busy, run } = useAdminAction()
  const groups = useQuery({
    queryKey: ['admin', 'groups', 'all-including-inactive'],
    queryFn: () => adminAPI.groups.getAllIncludingInactive()
  })
  const [userQuery, setUserQuery] = React.useState('')
  const [picked, setPicked] = React.useState<Record<number, string>>({})
  const [groupId, setGroupId] = React.useState('')
  const [days, setDays] = React.useState('30')
  const users = useQuery({
    queryKey: ['admin', 'users', 'picker', userQuery],
    queryFn: () => adminAPI.users.list(1, 8, { search: userQuery }),
    enabled: userQuery.trim().length >= 2
  })
  const subGroups = (groups.data ?? []).filter((g) => g.subscription_type === 'subscription')
  const ids = Object.keys(picked).map(Number)

  const submit = async () => {
    const validity = numOrUndef(days)
    if (ids.length === 0 || !groupId) return
    if (ids.length === 1) {
      const ok = await run(
        () =>
          adminAPI.subscriptions.assign({
            user_id: ids[0],
            group_id: Number(groupId),
            validity_days: validity
          }),
        {
          success: t('admin.subscriptions.subscriptionAssigned'),
          fallback: t('admin.subscriptions.failedToAssign')
        }
      )
      if (ok) onDone()
      return
    }
    const res = await run(
      () =>
        adminAPI.subscriptions.bulkAssign({
          user_ids: ids,
          group_id: Number(groupId),
          validity_days: validity
        }),
      { fallback: t('admin.subscriptions.failedToAssign') }
    )
    if (res) {
      if (res.failed_count > 0)
        notifyError(new Error(res.errors.slice(0, 3).join('; ') || t('admin.subscriptions.failedToAssign')))
      else notifySuccess(t('admin.subscriptions.subscriptionAssigned'))
      onDone()
    }
  }

  return (
    <AdminFormDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={t('admin.subscriptions.assignSubscription')}
      onSubmit={submit}
      submitting={busy}
      submitDisabled={ids.length === 0 || !groupId}
    >
      <FormField label={t('admin.subscriptions.form.user')}>
        <SearchInput
          value={userQuery}
          onValueChange={setUserQuery}
          placeholder={t('admin.users.searchUsers')}
        />
      </FormField>
      {users.data && userQuery.trim().length >= 2 ? (
        <ul className="max-h-36 divide-y overflow-y-auto rounded-md border text-sm">
          {users.data.items.map((u) => (
            <li key={u.id}>
              <button
                type="button"
                className="flex w-full justify-between px-3 py-1.5 text-left hover:bg-muted"
                onClick={() => setPicked((p) => ({ ...p, [u.id]: u.email }))}
              >
                <span className="truncate">{u.email}</span>
                <span className="text-xs text-muted-foreground">#{u.id}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {ids.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(picked).map(([id, email]) => (
            <button
              key={id}
              type="button"
              className="rounded-full border bg-muted px-2.5 py-0.5 text-xs hover:bg-destructive/10"
              onClick={() =>
                setPicked((p) => Object.fromEntries(Object.entries(p).filter(([k]) => k !== id)))
              }
              aria-label={`${t('common.remove')} ${email}`}
            >
              {email} ×
            </button>
          ))}
        </div>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label={t('admin.subscriptions.form.group')}>
          <NativeSelect value={groupId} onChange={(e) => setGroupId(e.target.value)}>
            <option value="">{t('admin.subscriptions.selectGroup')}</option>
            {subGroups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField label={t('admin.subscriptions.form.validityDays')}>
          <Input type="number" min={1} value={days} onChange={(e) => setDays(e.target.value)} />
        </FormField>
      </div>
    </AdminFormDialog>
  )
}

type Dlg =
  | { kind: 'assign' }
  | { kind: 'extend'; sub: UserSubscription }
  | { kind: 'reset'; sub: UserSubscription }
  | { kind: 'revoke'; sub: UserSubscription }
  | { kind: 'bulk'; action: 'extend' | 'revoke' | 'restore' | 'reset_quota'; ids: number[] }
  | null

export function SubscriptionsAdminPage() {
  const locale = useLocale()
  const qc = useQueryClient()
  const { busy, run } = useAdminAction()
  const table = useTableState()
  const [search, setSearch] = React.useState('')
  const [status, setStatus] = React.useState('')
  const [groupId, setGroupId] = React.useState('')
  const [selection, setSelection] = React.useState<Record<string, boolean>>({})
  const [dlg, setDlg] = React.useState<Dlg>(null)
  const [days, setDays] = React.useState('30')
  const [resetOpts, setResetOpts] = React.useState({ daily: true, weekly: false, monthly: false })
  const columns = useHiddenColumns({
    storageKey: STORAGE_KEYS.subscriptionHiddenColumns,
    allKeys: COLUMN_KEYS
  })

  const groups = useQuery({
    queryKey: ['admin', 'groups', 'all-including-inactive'],
    queryFn: () => adminAPI.groups.getAllIncludingInactive()
  })
  const filters = React.useMemo(
    () => ({
      status: (status || undefined) as (typeof STATUSES)[number] | undefined,
      group_id: groupId ? Number(groupId) : undefined
    }),
    [status, groupId]
  )
  const query = useQuery({
    queryKey: ['admin', 'subscriptions', 'list', table.page, table.pageSize, filters],
    queryFn: ({ signal }) => adminAPI.subscriptions.list(table.page, table.pageSize, filters, { signal }),
    placeholderData: (p) => p
  })
  const refresh = () => qc.invalidateQueries({ queryKey: ['admin', 'subscriptions'] })

  const items = React.useMemo(() => {
    const rows = query.data?.items ?? []
    if (!search.trim()) return rows
    const q = search.trim().toLowerCase()
    return rows.filter((s) => (s.user?.email ?? '').toLowerCase().includes(q) || String(s.user_id) === q)
  }, [query.data, search])

  const cols = React.useMemo<ColumnDef<UserSubscription, unknown>[]>(
    () => [
      {
        id: 'user',
        header: t('admin.subscriptions.columns.user'),
        cell: ({ row }) => (
          <span className="block max-w-52 truncate font-medium">
            {row.original.user?.email ?? `#${row.original.user_id}`}
          </span>
        )
      },
      {
        id: 'group',
        header: t('admin.subscriptions.columns.group'),
        cell: ({ row }) => row.original.group?.name ?? `#${row.original.group_id}`
      },
      {
        id: 'status',
        header: t('admin.subscriptions.columns.status'),
        cell: ({ row }) => (
          <StatusBadge status={TONE[row.original.status]}>
            {t(`admin.subscriptions.status.${row.original.status}`)}
          </StatusBadge>
        )
      },
      {
        id: 'usage',
        header: t('admin.subscriptions.columns.usage'),
        cell: ({ row }) => (
          <div className="space-y-1">
            <UsageBar used={row.original.daily_usage_usd} limit={row.original.group?.daily_limit_usd} />
            <UsageBar used={row.original.monthly_usage_usd} limit={row.original.group?.monthly_limit_usd} />
          </div>
        )
      },
      {
        id: 'starts_at',
        header: t('adminUi.subscriptions.started'),
        cell: ({ row }) => (
          <span className="text-muted-foreground">{formatDateTime(row.original.starts_at)}</span>
        )
      },
      {
        id: 'expires_at',
        header: t('admin.subscriptions.columns.expires'),
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {row.original.expires_at
              ? formatDateTime(row.original.expires_at)
              : t('admin.subscriptions.noExpiration')}
          </span>
        )
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">{t('admin.subscriptions.columns.actions')}</span>,
        cell: ({ row }) => {
          const s = row.original
          return (
            <RowActions
              actions={[
                {
                  key: 'extend',
                  label: t('admin.subscriptions.adjust'),
                  hidden: s.status === 'revoked',
                  onSelect: () => setDlg({ kind: 'extend', sub: s })
                },
                {
                  key: 'reset',
                  label: t('admin.subscriptions.resetQuota'),
                  hidden: s.status === 'revoked',
                  onSelect: () => setDlg({ kind: 'reset', sub: s })
                },
                {
                  key: 'restore',
                  label: t('admin.subscriptions.restore'),
                  hidden: s.status !== 'revoked',
                  onSelect: async () => {
                    const ok = await run(() => adminAPI.subscriptions.restore(s.id), {
                      success: t('common.saved')
                    })
                    if (ok) void refresh()
                  }
                },
                {
                  key: 'revoke',
                  separator: true,
                  label: t('admin.subscriptions.revoke'),
                  destructive: true,
                  hidden: s.status === 'revoked',
                  onSelect: () => setDlg({ kind: 'revoke', sub: s })
                }
              ]}
            />
          )
        }
      }
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 只依赖语言
    [locale]
  )
  const visibility = React.useMemo(
    () => Object.fromEntries(columns.hidden.map((k) => [k, false])),
    [columns.hidden]
  )

  const runBulk = async (action: 'extend' | 'revoke' | 'restore' | 'reset_quota', ids: number[]) => {
    const res = await run(
      () =>
        adminAPI.subscriptions.bulkAction(
          {
            subscription_ids: ids,
            action,
            ...(action === 'extend' ? { days: numOrUndef(days) ?? 30 } : {}),
            ...(action === 'reset_quota' ? resetOpts : {})
          },
          crypto.randomUUID()
        ),
      {}
    )
    if (!res) return
    if (res.failed_count > 0)
      notifyError(
        new Error(
          t('admin.accounts.bulkActions.partialSuccess', {
            success: res.success_count,
            failed: res.failed_count
          })
        )
      )
    else notifySuccess(t('common.saved'))
    setSelection({})
    setDlg(null)
    void refresh()
  }

  return (
    <div>
      <PageHeader
        title={t('admin.subscriptions.title')}
        description={t('admin.subscriptions.description')}
        actions={
          <>
            <Button variant="outline" aria-label={t('common.refresh')} onClick={() => void refresh()}>
              <RefreshCw className={query.isFetching ? 'animate-spin' : undefined} aria-hidden />
            </Button>
            <ColumnSettings
              columns={[
                { key: 'group', label: t('admin.subscriptions.columns.group') },
                { key: 'status', label: t('admin.subscriptions.columns.status') },
                { key: 'usage', label: t('admin.subscriptions.columns.usage') },
                { key: 'starts_at', label: t('adminUi.subscriptions.started') },
                { key: 'expires_at', label: t('admin.subscriptions.columns.expires') }
              ]}
              isVisible={columns.isVisible}
              onToggle={columns.toggle}
            />
            <Button onClick={() => setDlg({ kind: 'assign' })}>
              <Plus aria-hidden />
              {t('admin.subscriptions.assignSubscription')}
            </Button>
          </>
        }
      />
      <FilterBar
        onReset={() => {
          setSearch('')
          setStatus('')
          setGroupId('')
          table.setPage(1)
        }}
      >
        <SearchInput
          value={search}
          onValueChange={setSearch}
          placeholder={t('admin.users.searchUsers')}
          containerClassName="w-full sm:w-72"
        />
        <FilterSelect
          label={t('admin.subscriptions.columns.status')}
          value={status}
          onChange={(v) => {
            setStatus(v)
            table.setPage(1)
          }}
          options={[
            { value: '', label: t('admin.subscriptions.allStatus') },
            ...STATUSES.map((s) => ({ value: s, label: t(`admin.subscriptions.status.${s}`) }))
          ]}
        />
        <FilterSelect
          label={t('admin.subscriptions.columns.group')}
          value={groupId}
          onChange={(v) => {
            setGroupId(v)
            table.setPage(1)
          }}
          options={[
            { value: '', label: t('admin.subscriptions.allGroups') },
            ...(groups.data ?? [])
              .filter((g) => g.subscription_type === 'subscription')
              .map((g) => ({ value: String(g.id), label: g.name }))
          ]}
        />
      </FilterBar>
      <DataTable
        columns={cols}
        data={items}
        loading={query.isLoading}
        getRowId={(s) => String(s.id)}
        selectable
        rowSelection={selection}
        onRowSelectionChange={(u) => setSelection(typeof u === 'function' ? u(selection) : u)}
        columnVisibility={visibility}
        pagination={table.pagination(query.data?.total ?? 0)}
        emptyTitle={t('admin.subscriptions.noSubscriptionsYet')}
        emptyDescription={t('admin.subscriptions.assignFirstSubscription')}
        bulkActions={(selected) => {
          const ids = selected.map((s) => s.id)
          return (
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setDlg({ kind: 'bulk', action: 'extend', ids })}
              >
                {t('admin.subscriptions.adjust')}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setDlg({ kind: 'bulk', action: 'reset_quota', ids })}
              >
                {t('admin.subscriptions.resetQuota')}
              </Button>
              <Button size="sm" variant="outline" onClick={() => void runBulk('restore', ids)}>
                {t('admin.subscriptions.restore')}
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => setDlg({ kind: 'bulk', action: 'revoke', ids })}
              >
                {t('admin.subscriptions.revoke')}
              </Button>
            </div>
          )
        }}
      />
      {dlg?.kind === 'assign' ? (
        <AssignDialog
          onClose={() => setDlg(null)}
          onDone={() => {
            setDlg(null)
            void refresh()
          }}
        />
      ) : null}
      {dlg?.kind === 'extend' || (dlg?.kind === 'bulk' && dlg.action === 'extend') ? (
        <AdminFormDialog
          open
          onOpenChange={(o) => !o && setDlg(null)}
          title={t('admin.subscriptions.adjustSubscription')}
          onSubmit={async () => {
            if (dlg?.kind === 'extend') {
              const sub = dlg.sub
              const ok = await run(
                () => adminAPI.subscriptions.extend(sub.id, { days: numOrUndef(days) ?? 0 }),
                { success: t('common.saved') }
              )
              if (ok) {
                setDlg(null)
                void refresh()
              }
            } else if (dlg?.kind === 'bulk') await runBulk('extend', dlg.ids)
          }}
          submitting={busy}
        >
          <FormField
            label={t('admin.subscriptions.form.adjustDays')}
            description={t('admin.subscriptions.adjustHint')}
          >
            <Input type="number" value={days} onChange={(e) => setDays(e.target.value)} />
          </FormField>
        </AdminFormDialog>
      ) : null}
      {dlg?.kind === 'reset' || (dlg?.kind === 'bulk' && dlg.action === 'reset_quota') ? (
        <AdminFormDialog
          open
          onOpenChange={(o) => !o && setDlg(null)}
          title={t('admin.subscriptions.resetQuotaTitle')}
          onSubmit={async () => {
            if (dlg?.kind === 'reset') {
              const sub = dlg.sub
              const ok = await run(() => adminAPI.subscriptions.resetQuota(sub.id, resetOpts), {
                success: t('common.saved')
              })
              if (ok) {
                setDlg(null)
                void refresh()
              }
            } else if (dlg?.kind === 'bulk') await runBulk('reset_quota', dlg.ids)
          }}
          submitting={busy}
          submitDisabled={!resetOpts.daily && !resetOpts.weekly && !resetOpts.monthly}
        >
          {(['daily', 'weekly', 'monthly'] as const).map((w) => (
            <label key={w} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={resetOpts[w]}
                onCheckedChange={(v) => setResetOpts((o) => ({ ...o, [w]: v === true }))}
              />
              {t(`admin.groups.subscription.${w}Limit`)}
            </label>
          ))}
        </AdminFormDialog>
      ) : null}
      <ConfirmDialog
        open={dlg?.kind === 'revoke' || (dlg?.kind === 'bulk' && dlg.action === 'revoke')}
        onOpenChange={(o) => !o && setDlg(null)}
        title={t('admin.subscriptions.revokeSubscription')}
        description={t('admin.subscriptions.revokeConfirm', {
          user: dlg?.kind === 'revoke' ? (dlg.sub.user?.email ?? `#${dlg.sub.user_id}`) : ''
        })}
        destructive
        confirmText={t('admin.subscriptions.revoke')}
        loading={busy}
        onConfirm={async () => {
          if (dlg?.kind === 'revoke') {
            const sub = dlg.sub
            const ok = await run(() => adminAPI.subscriptions.revoke(sub.id), {
              success: t('admin.subscriptions.subscriptionRevoked')
            })
            if (ok) {
              setDlg(null)
              void refresh()
            }
          } else if (dlg?.kind === 'bulk') await runBulk('revoke', dlg.ids)
        }}
      />
    </div>
  )
}
