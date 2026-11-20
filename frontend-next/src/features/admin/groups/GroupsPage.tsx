/** /admin/groups：分组管理（列表 / 筛选 / 复制 / 状态 / 专属倍率 / 专属 RPM）。 */
import * as React from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { Plus, RefreshCw } from 'lucide-react'
import { adminAPI } from '@/api/admin'
import { ColumnSettings } from '@/components/ColumnSettings'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { DataTable } from '@/components/DataTable'
import { GroupBadge } from '@/components/GroupBadge'
import { PageHeader } from '@/components/PageHeader'
import { SearchInput } from '@/components/SearchInput'
import { StatusBadge } from '@/components/StatusBadge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { GROUP_PLATFORM_OPTIONS } from '@/constants/platforms'
import { STORAGE_KEYS } from '@/constants/storage'
import { FilterBar, FilterSelect } from '@/features/admin/common/FilterBar'
import { RowActions } from '@/features/admin/common/RowActions'
import { notifySuccess } from '@/features/admin/common/notify'
import { useAdminAction } from '@/features/admin/common/useAdminAction'
import { useTableState } from '@/features/admin/common/useTableState'
import { useHiddenColumns } from '@/hooks/useHiddenColumns'
import { t } from '@/i18n'
import { useLocale } from '@/i18n/react'
import type { AdminGroup } from '@/types'
import { GroupFormDialog } from './GroupFormDialog'
import { GroupRatesDialog } from './GroupRatesDialog'

const COLUMN_KEYS = ['platform', 'rate', 'type', 'accounts', 'usage', 'status']

type Dlg =
  | { kind: 'form'; group: AdminGroup | null }
  | { kind: 'rates'; group: AdminGroup; mode: 'rate' | 'rpm' }
  | { kind: 'delete'; group: AdminGroup }
  | null

export function GroupsPage() {
  const locale = useLocale()
  const qc = useQueryClient()
  const { busy, run } = useAdminAction()
  const table = useTableState()
  const [search, setSearch] = React.useState('')
  const [platform, setPlatform] = React.useState('')
  const [status, setStatus] = React.useState('')
  const [exclusive, setExclusive] = React.useState('')
  const [dlg, setDlg] = React.useState<Dlg>(null)
  const columns = useHiddenColumns({
    storageKey: STORAGE_KEYS.groupHiddenColumns,
    versionKey: STORAGE_KEYS.groupColumnSettingsVersion,
    version: 1,
    allKeys: COLUMN_KEYS
  })

  const query = useQuery({
    queryKey: ['admin', 'groups', 'list', table.page, table.pageSize, search, platform, status, exclusive],
    queryFn: ({ signal }) =>
      adminAPI.groups.list(
        table.page,
        table.pageSize,
        {
          search: search || undefined,
          platform: (platform || undefined) as AdminGroup['platform'] | undefined,
          status: (status || undefined) as 'active' | 'inactive' | undefined,
          is_exclusive: exclusive === '' ? undefined : exclusive === 'true'
        },
        { signal }
      ),
    placeholderData: (p) => p
  })
  const allGroups = useQuery({
    queryKey: ['admin', 'groups', 'all-including-inactive'],
    queryFn: () => adminAPI.groups.getAllIncludingInactive()
  })
  const usage = useQuery({
    queryKey: ['admin', 'groups', 'usage-summary'],
    queryFn: () => adminAPI.groups.getUsageSummary()
  })

  const refresh = () => qc.invalidateQueries({ queryKey: ['admin', 'groups'] })
  const usageMap = React.useMemo(() => new Map((usage.data ?? []).map((u) => [u.group_id, u])), [usage.data])

  const cols = React.useMemo<ColumnDef<AdminGroup, unknown>[]>(
    () => [
      {
        id: 'name',
        header: t('admin.groups.columns.name'),
        cell: ({ row }) => (
          <div className="min-w-0">
            <GroupBadge
              name={row.original.name}
              platform={row.original.platform}
              subscriptionType={row.original.subscription_type}
              rateMultiplier={row.original.rate_multiplier}
              showRate={false}
            />
            <p className="mt-0.5 text-xs text-muted-foreground">#{row.original.id}</p>
          </div>
        )
      },
      {
        id: 'platform',
        header: t('admin.groups.columns.platform'),
        cell: ({ row }) => <Badge variant="secondary">{row.original.platform}</Badge>
      },
      {
        id: 'rate',
        header: t('admin.groups.columns.rateMultiplier'),
        cell: ({ row }) => <span className="tabular">{row.original.rate_multiplier}x</span>
      },
      {
        id: 'type',
        header: t('admin.groups.columns.type'),
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-1">
            <Badge variant={row.original.subscription_type === 'subscription' ? 'info' : 'secondary'}>
              {row.original.subscription_type === 'subscription'
                ? t('admin.groups.subscription.subscription')
                : t('admin.groups.subscription.standard')}
            </Badge>
            {row.original.is_exclusive ? (
              <Badge variant="warning">{t('admin.groups.exclusive')}</Badge>
            ) : (
              <Badge variant="outline">{t('admin.groups.public')}</Badge>
            )}
          </div>
        )
      },
      {
        id: 'accounts',
        header: t('admin.groups.columns.accounts'),
        cell: ({ row }) => (
          <span className="tabular text-xs">
            {row.original.active_account_count ?? 0}/{row.original.account_count ?? 0}
            {row.original.rate_limited_account_count ? (
              <span className="ml-1 text-warning">({row.original.rate_limited_account_count})</span>
            ) : null}
          </span>
        )
      },
      {
        id: 'usage',
        header: t('admin.groups.columns.usage'),
        cell: ({ row }) => {
          const u = usageMap.get(row.original.id)
          return u ? (
            <span className="tabular text-xs">
              {t('admin.groups.usageToday')} ${u.today_cost.toFixed(2)} · {t('admin.groups.usageTotal')} $
              {u.total_cost.toFixed(2)}
            </span>
          ) : (
            '—'
          )
        }
      },
      {
        id: 'status',
        header: t('admin.groups.columns.status'),
        cell: ({ row }) => (
          <StatusBadge status={row.original.status === 'active' ? 'success' : 'neutral'}>
            {row.original.status === 'active' ? t('common.active') : t('common.inactive')}
          </StatusBadge>
        )
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">{t('admin.groups.columns.actions')}</span>,
        cell: ({ row }) => {
          const g = row.original
          return (
            <RowActions
              actions={[
                { key: 'edit', label: t('common.edit'), onSelect: () => setDlg({ kind: 'form', group: g }) },
                {
                  key: 'rate',
                  label: t('admin.groups.rateMultipliers'),
                  onSelect: () => setDlg({ kind: 'rates', group: g, mode: 'rate' })
                },
                {
                  key: 'rpm',
                  label: t('admin.groups.rpmOverrides'),
                  onSelect: () => setDlg({ kind: 'rates', group: g, mode: 'rpm' })
                },
                {
                  key: 'dup',
                  label: t('admin.groups.duplicate'),
                  onSelect: async () => {
                    const copy = await run(() => adminAPI.groups.duplicate(g.id), {
                      fallback: t('admin.groups.duplicateFailed')
                    })
                    if (copy) {
                      notifySuccess(t('admin.groups.duplicateSuccess', { name: copy.name }))
                      void refresh()
                    }
                  }
                },
                {
                  key: 'toggle',
                  separator: true,
                  label: g.status === 'active' ? t('common.inactive') : t('common.active'),
                  onSelect: async () => {
                    const ok = await run(
                      () => adminAPI.groups.toggleStatus(g.id, g.status === 'active' ? 'inactive' : 'active'),
                      {
                        success: t('admin.groups.groupUpdatedSuccess')
                      }
                    )
                    if (ok) void refresh()
                  }
                },
                {
                  key: 'delete',
                  label: t('common.delete'),
                  destructive: true,
                  onSelect: () => setDlg({ kind: 'delete', group: g })
                }
              ]}
            />
          )
        }
      }
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 列定义只依赖语言与用量汇总
    [locale, usageMap]
  )
  const visibility = React.useMemo(
    () => Object.fromEntries(columns.hidden.map((k) => [k, false])),
    [columns.hidden]
  )

  return (
    <div>
      <PageHeader
        title={t('admin.groups.title')}
        description={t('admin.groups.description')}
        actions={
          <>
            <Button variant="outline" aria-label={t('common.refresh')} onClick={() => void refresh()}>
              <RefreshCw className={query.isFetching ? 'animate-spin' : undefined} aria-hidden />
            </Button>
            <ColumnSettings
              columns={[
                { key: 'platform', label: t('admin.groups.columns.platform') },
                { key: 'rate', label: t('admin.groups.columns.rateMultiplier') },
                { key: 'type', label: t('admin.groups.columns.type') },
                { key: 'accounts', label: t('admin.groups.columns.accounts') },
                { key: 'usage', label: t('admin.groups.columns.usage') },
                { key: 'status', label: t('admin.groups.columns.status') }
              ]}
              isVisible={columns.isVisible}
              onToggle={columns.toggle}
            />
            <Button onClick={() => setDlg({ kind: 'form', group: null })}>
              <Plus aria-hidden />
              {t('admin.groups.createGroup')}
            </Button>
          </>
        }
      />
      <FilterBar
        onReset={() => {
          setSearch('')
          setPlatform('')
          setStatus('')
          setExclusive('')
          table.setPage(1)
        }}
      >
        <SearchInput
          value={search}
          onValueChange={(v) => {
            setSearch(v)
            table.setPage(1)
          }}
          placeholder={t('admin.groups.searchGroups')}
          containerClassName="w-full sm:w-72"
        />
        <FilterSelect
          label={t('admin.groups.columns.platform')}
          value={platform}
          onChange={(v) => {
            setPlatform(v)
            table.setPage(1)
          }}
          options={[
            { value: '', label: t('admin.groups.allPlatforms') },
            ...GROUP_PLATFORM_OPTIONS.map((o) => ({ value: o.value, label: o.label }))
          ]}
        />
        <FilterSelect
          label={t('admin.groups.columns.status')}
          value={status}
          onChange={(v) => {
            setStatus(v)
            table.setPage(1)
          }}
          options={[
            { value: '', label: t('admin.groups.allStatus') },
            { value: 'active', label: t('common.active') },
            { value: 'inactive', label: t('common.inactive') }
          ]}
        />
        <FilterSelect
          label={t('admin.groups.columns.exclusive')}
          value={exclusive}
          onChange={(v) => {
            setExclusive(v)
            table.setPage(1)
          }}
          options={[
            { value: '', label: t('admin.groups.allGroups') },
            { value: 'true', label: t('admin.groups.exclusiveFilter') },
            { value: 'false', label: t('admin.groups.nonExclusive') }
          ]}
        />
      </FilterBar>
      <DataTable
        columns={cols}
        data={query.data?.items ?? []}
        loading={query.isLoading}
        getRowId={(g) => String(g.id)}
        columnVisibility={visibility}
        pagination={table.pagination(query.data?.total ?? 0)}
        emptyTitle={t('admin.groups.noGroupsYet')}
        emptyDescription={t('admin.groups.createFirstGroup')}
      />
      {dlg?.kind === 'form' ? (
        <GroupFormDialog
          group={dlg.group}
          allGroups={allGroups.data ?? []}
          onClose={() => setDlg(null)}
          onSaved={() => {
            setDlg(null)
            void refresh()
          }}
        />
      ) : null}
      {dlg?.kind === 'rates' ? (
        <GroupRatesDialog group={dlg.group} mode={dlg.mode} onClose={() => setDlg(null)} />
      ) : null}
      <ConfirmDialog
        open={dlg?.kind === 'delete'}
        onOpenChange={(o) => !o && setDlg(null)}
        title={t('admin.groups.deleteGroup')}
        description={
          dlg?.kind === 'delete'
            ? dlg.group.subscription_type === 'subscription'
              ? t('admin.groups.deleteConfirmSubscription', { name: dlg.group.name })
              : t('admin.groups.deleteConfirm', { name: dlg.group.name })
            : undefined
        }
        destructive
        confirmText={t('common.delete')}
        loading={busy}
        onConfirm={async () => {
          if (dlg?.kind !== 'delete') return
          const g = dlg.group
          const ok = await run(() => adminAPI.groups.delete(g.id), {
            success: t('admin.groups.groupDeletedSuccess'),
            fallback: t('admin.groups.failedToDelete')
          })
          if (ok) {
            setDlg(null)
            void refresh()
          }
        }}
      />
    </div>
  )
}
