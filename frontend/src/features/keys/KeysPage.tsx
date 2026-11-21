/** /keys：API 密钥管理（列表 / 筛选 / 排序 / 批量编辑 / 创建编辑 / 使用说明 / CC Switch 导入）。 */
import * as React from 'react'
import type { ColumnDef, RowSelectionState, SortingState, Updater } from '@tanstack/react-table'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Eye, KeyRound, Plus, RefreshCw, Shield, SquarePen, Terminal, Trash2, Upload } from 'lucide-react'
import { authAPI } from '@/api/auth'
import { keysAPI } from '@/api/keys'
import { userGroupsAPI } from '@/api/groups'
import { usageAPI } from '@/api/usage'
import { ColumnSettings } from '@/components/ColumnSettings'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { CopyButton } from '@/components/CopyButton'
import { DataTable } from '@/components/DataTable'
import { GroupBadge } from '@/components/GroupBadge'
import { NativeSelect } from '@/components/NativeSelect'
import { PageHeader } from '@/components/PageHeader'
import { SearchInput } from '@/components/SearchInput'
import { StatusBadge } from '@/components/StatusBadge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Progress } from '@/components/ui/progress'
import { useHiddenColumns } from '@/hooks/useHiddenColumns'
import { getPersistedPageSize, setPersistedPageSize } from '@/hooks/usePersistedPageSize'
import { t } from '@/i18n'
import { useLocale } from '@/i18n/react'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/stores/app'
import type { ApiKey } from '@/types'
import {
  CC_SWITCH_USAGE_SCRIPT,
  buildCcSwitchImportDeeplink,
  type CcSwitchClientType
} from '@/utils/ccswitchImport'
import { extractApiErrorMessage } from '@/utils/apiError'
import { formatDateTime } from '@/utils/format'
import { maskApiKey } from '@/utils/maskApiKey'
import { getConfiguredTablePageSizeOptions } from '@/utils/tablePreferences'
import { BulkEditKeysDialog } from './BulkEditKeysDialog'
import { EndpointPopover } from './EndpointPopover'
import { formatResetCountdown } from './keyForm'
import { GroupPicker } from './GroupPicker'
import { KeyFormDialog } from './KeyFormDialog'
import { UseKeyDialog } from './UseKeyDialog'

const ALL_COLUMNS = [
  'name',
  'id',
  'key',
  'group',
  'current_concurrency',
  'usage',
  'rate_limit',
  'expires_at',
  'status',
  'last_used_at',
  'last_used_ip',
  'created_at',
  'actions'
] as const
const ALWAYS_VISIBLE = ['name', 'actions']
const SORTABLE = new Set([
  'name',
  'id',
  'group',
  'current_concurrency',
  'expires_at',
  'status',
  'last_used_at',
  'created_at'
])

const STATUS_TONE = {
  active: 'success',
  quota_exhausted: 'warning',
  expired: 'error',
  inactive: 'neutral'
} as const

function UsageBar({ used, limit, className }: { used: number; limit: number; className?: string }) {
  const pct = Math.min((used / limit) * 100, 100)
  const tone =
    used >= limit
      ? '[&>div]:bg-destructive'
      : used >= limit * 0.8
        ? '[&>div]:bg-warning'
        : '[&>div]:bg-success'
  return <Progress value={pct} className={cn('h-1.5', tone, className)} />
}

export function KeysPage() {
  useLocale()
  const queryClient = useQueryClient()
  const showError = useAppStore((s) => s.showError)
  const showSuccess = useAppStore((s) => s.showSuccess)

  const [page, setPage] = React.useState(1)
  const [pageSize, setPageSize] = React.useState(() => getPersistedPageSize())
  const [sorting, setSorting] = React.useState<SortingState>([{ id: 'created_at', desc: true }])
  const [search, setSearch] = React.useState('')
  const [status, setStatus] = React.useState('')
  const [groupId, setGroupId] = React.useState<string>('')
  const [selection, setSelection] = React.useState<RowSelectionState>({})
  const [now, setNow] = React.useState(() => Date.now())

  const [formOpen, setFormOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<ApiKey | null>(null)
  const [bulkOpen, setBulkOpen] = React.useState(false)
  const [useKey, setUseKey] = React.useState<ApiKey | null>(null)
  const [deleting, setDeleting] = React.useState<ApiKey | null>(null)
  const [resetRate, setResetRate] = React.useState<ApiKey | null>(null)
  const [ccsRow, setCcsRow] = React.useState<ApiKey | null>(null)

  const columnsState = useHiddenColumns({
    storageKey: 'api-key-hidden-columns',
    allKeys: [...ALL_COLUMNS],
    alwaysVisible: ALWAYS_VISIBLE,
    defaultHidden: ['id', 'rate_limit', 'last_used_at', 'last_used_ip'],
    versionKey: 'api-key-column-settings-version',
    version: 3,
    versionNewHidden: { 2: ['last_used_ip'], 3: ['id'] }
  })

  React.useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60000)
    return () => clearInterval(id)
  }, [])

  const sort = sorting[0]
  const list = useQuery({
    queryKey: ['user', 'keys', page, pageSize, sort?.id, sort?.desc, search, status, groupId],
    queryFn: ({ signal }) =>
      keysAPI.list(
        page,
        pageSize,
        {
          ...(search ? { search } : {}),
          ...(status ? { status } : {}),
          ...(groupId !== '' ? { group_id: groupId } : {}),
          sort_by: sort?.id ?? 'created_at',
          sort_order: sort?.desc === false ? 'asc' : 'desc'
        },
        { signal }
      ),
    placeholderData: (prev) => prev
  })
  const items = React.useMemo(() => list.data?.items ?? [], [list.data])
  const ids = React.useMemo(() => items.map((k) => k.id), [items])

  // 用量统计要聚合 30 天的 usage_logs，可能比列表慢很多：不阻塞表格渲染，单独加载
  const usage = useQuery({
    queryKey: ['user', 'keys', 'usage', ids],
    enabled: ids.length > 0,
    queryFn: ({ signal }) => usageAPI.getDashboardApiKeysUsage(ids, { signal }).then((r) => r.stats)
  })
  const groups = useQuery({
    queryKey: ['user', 'groups', 'available'],
    queryFn: () => userGroupsAPI.getAvailable()
  })
  const rates = useQuery({
    queryKey: ['user', 'groups', 'rates'],
    queryFn: () => userGroupsAPI.getUserGroupRates()
  })
  const settings = useQuery({
    queryKey: ['public-settings'],
    queryFn: () => authAPI.getPublicSettings(),
    staleTime: 300_000
  })

  const groupList = React.useMemo(() => groups.data ?? [], [groups.data])
  const userRates = React.useMemo(() => rates.data ?? {}, [rates.data])
  const reload = React.useCallback(
    () => queryClient.invalidateQueries({ queryKey: ['user', 'keys'] }),
    [queryClient]
  )

  const resetPaging = () => {
    setSelection({})
    setPage(1)
  }

  const toggleStatus = async (key: ApiKey) => {
    const next = key.status === 'active' ? 'inactive' : 'active'
    try {
      await keysAPI.toggleStatus(key.id, next)
      showSuccess(next === 'active' ? t('keys.keyEnabledSuccess') : t('keys.keyDisabledSuccess'))
      void reload()
    } catch {
      showError(t('keys.failedToUpdateStatus'))
    }
  }

  const changeGroup = async (key: ApiKey, newGroupId: number | null) => {
    if (key.group_id === newGroupId) return
    try {
      await keysAPI.update(key.id, { group_id: newGroupId })
      showSuccess(t('keys.groupChangedSuccess'))
      void reload()
    } catch {
      showError(t('keys.failedToChangeGroup'))
    }
  }

  const doDelete = async () => {
    if (!deleting) return
    try {
      await keysAPI.delete(deleting.id)
      showSuccess(t('keys.keyDeletedSuccess'))
      setDeleting(null)
      void reload()
    } catch (error) {
      showError(extractApiErrorMessage(error, t('keys.failedToDelete')))
    }
  }

  const doResetRate = async () => {
    if (!resetRate) return
    const key = resetRate
    setResetRate(null)
    try {
      await keysAPI.update(key.id, { reset_rate_limit_usage: true })
      showSuccess(t('keys.rateLimitResetSuccess'))
      void reload()
    } catch (error) {
      showError(extractApiErrorMessage(error, t('keys.failedToResetRateLimit')))
    }
  }

  const executeCcsImport = (row: ApiKey, clientType: CcSwitchClientType) => {
    const baseUrl = settings.data?.api_base_url || window.location.origin
    const deeplink = buildCcSwitchImportDeeplink({
      baseUrl,
      platform: row.group?.platform || 'anthropic',
      clientType,
      providerName: (settings.data?.site_name || 'sub2api').trim() || 'sub2api',
      apiKey: row.key,
      usageScript: CC_SWITCH_USAGE_SCRIPT
    })
    try {
      window.open(deeplink, '_self')
      // 协议处理器生效时页面会失焦；仍有焦点说明 CC Switch 未安装
      setTimeout(() => {
        if (document.hasFocus()) showError(t('keys.ccSwitchNotInstalled'))
      }, 100)
    } catch {
      showError(t('keys.ccSwitchNotInstalled'))
    }
  }

  const importToCcswitch = (row: ApiKey) => {
    const platform = row.group?.platform || 'anthropic'
    if (platform === 'antigravity') return setCcsRow(row)
    executeCcsImport(row, platform === 'gemini' ? 'gemini' : 'claude')
  }

  const label = (key: string) =>
    ({
      name: t('common.name'),
      id: t('keys.id'),
      key: t('keys.apiKey'),
      group: t('keys.group'),
      current_concurrency: t('keys.currentConcurrency'),
      usage: t('keys.usage'),
      rate_limit: t('keys.rateLimitColumn'),
      expires_at: t('keys.expiresAt'),
      status: t('common.status'),
      last_used_at: t('keys.lastUsedAt'),
      last_used_ip: t('keys.lastUsedIP'),
      created_at: t('keys.created'),
      actions: t('common.actions')
    })[key] ?? key

  const columns = React.useMemo<ColumnDef<ApiKey, unknown>[]>(() => {
    const stats = usage.data
    const usageLoading = usage.isLoading
    const rateWindows = [
      ['5h', 'rate_limit_5h', 'usage_5h', 'reset_5h_at'],
      ['1d', 'rate_limit_1d', 'usage_1d', 'reset_1d_at'],
      ['7d', 'rate_limit_7d', 'usage_7d', 'reset_7d_at']
    ] as const
    const defs: Record<string, ColumnDef<ApiKey, unknown>> = {
      name: {
        id: 'name',
        header: label('name'),
        cell: ({ row }) => (
          <div className="flex items-center gap-1.5">
            <span className="font-medium">{row.original.name}</span>
            {(row.original.ip_whitelist?.length ?? 0) > 0 || (row.original.ip_blacklist?.length ?? 0) > 0 ? (
              <span title={t('keys.ipRestrictionEnabled')}>
                <Shield className="size-3.5 text-info" aria-label={t('keys.ipRestrictionEnabled')} />
              </span>
            ) : null}
          </div>
        )
      },
      id: {
        id: 'id',
        header: label('id'),
        cell: ({ row }) => <span className="font-mono text-xs text-muted-foreground">#{row.original.id}</span>
      },
      key: {
        id: 'key',
        header: label('key'),
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex items-center gap-1">
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
              {maskApiKey(row.original.key)}
            </code>
            <CopyButton
              value={row.original.key}
              size="icon"
              className="size-7"
              aria-label={t('keys.copyToClipboard')}
            />
          </div>
        )
      },
      group: {
        id: 'group',
        header: label('group'),
        cell: ({ row }) => {
          const k = row.original
          return (
            <GroupPicker
              groups={groupList}
              value={k.group_id}
              onChange={(id) => void changeGroup(k, id)}
              userRates={userRates}
              allowNone
              trigger={
                <button
                  type="button"
                  title={t('keys.clickToChangeGroup')}
                  className="-mx-2 flex items-center gap-2 rounded-md px-2 py-1 text-left transition-colors hover:bg-muted"
                >
                  {k.group ? (
                    <GroupBadge
                      name={k.group.name}
                      platform={k.group.platform}
                      subscriptionType={k.group.subscription_type}
                      rateMultiplier={k.group.rate_multiplier}
                      userRateMultiplier={userRates[k.group.id]}
                      peakRateEnabled={k.group.peak_rate_enabled}
                      peakStart={k.group.peak_start}
                      peakEnd={k.group.peak_end}
                      peakRateMultiplier={k.group.peak_rate_multiplier}
                    />
                  ) : (
                    <span className="text-sm text-muted-foreground">{t('keys.noGroup')}</span>
                  )}
                </button>
              }
            />
          )
        }
      },
      current_concurrency: {
        id: 'current_concurrency',
        header: label('current_concurrency'),
        cell: ({ row }) => {
          const v = row.original.current_concurrency ?? 0
          return (
            <span
              className={cn(
                'tabular inline-flex min-w-8 justify-center rounded px-2 py-0.5 text-sm font-semibold',
                v > 0 ? 'bg-success/15 text-success' : 'bg-muted text-muted-foreground'
              )}
            >
              {v}
            </span>
          )
        }
      },
      usage: {
        id: 'usage',
        header: label('usage'),
        enableSorting: false,
        cell: ({ row }) => {
          const k = row.original
          const s = stats?.[k.id]
          const pending = usageLoading && !s
          const cost = (v?: number) =>
            pending ? (
              <span
                className="inline-block h-3 w-14 animate-pulse rounded bg-muted"
                data-test="usage-pending"
              />
            ) : (
              <b className="tabular font-medium">${(v ?? 0).toFixed(4)}</b>
            )
          return (
            <div className="space-y-0.5 text-sm">
              <div className="flex gap-1.5">
                <span className="text-muted-foreground">{t('keys.today')}:</span>
                {cost(s?.today_actual_cost)}
              </div>
              <div className="flex gap-1.5">
                <span className="text-muted-foreground">{t('keys.total')}:</span>
                {cost(s?.total_actual_cost)}
              </div>
              {k.quota > 0 ? (
                <div className="pt-1">
                  <div className="flex gap-1.5">
                    <span className="text-muted-foreground">{t('keys.quota')}:</span>
                    <span
                      className={cn(
                        'tabular font-medium',
                        k.quota_used >= k.quota
                          ? 'text-destructive'
                          : k.quota_used >= k.quota * 0.8
                            ? 'text-warning'
                            : ''
                      )}
                    >
                      ${k.quota_used?.toFixed(2) || '0.00'} / ${k.quota.toFixed(2)}
                    </span>
                  </div>
                  <UsageBar used={k.quota_used} limit={k.quota} className="mt-1" />
                </div>
              ) : null}
            </div>
          )
        }
      },
      rate_limit: {
        id: 'rate_limit',
        header: label('rate_limit'),
        enableSorting: false,
        cell: ({ row }) => {
          const k = row.original
          if (!(k.rate_limit_5h > 0 || k.rate_limit_1d > 0 || k.rate_limit_7d > 0))
            return <span className="text-muted-foreground">-</span>
          return (
            <div className="min-w-36 space-y-1.5">
              {rateWindows.map(([name, limitKey, usageKey, resetKey]) => {
                const limit = k[limitKey]
                if (!(limit > 0)) return null
                const used = k[usageKey]
                const reset = formatResetCountdown(k[resetKey], now, t('keys.resetNow'))
                return (
                  <div key={name}>
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">{name}</span>
                      <span
                        className={cn(
                          'tabular font-medium',
                          used >= limit ? 'text-destructive' : used >= limit * 0.8 ? 'text-warning' : ''
                        )}
                      >
                        ${used?.toFixed(2) || '0.00'}/${limit.toFixed(2)}
                      </span>
                    </div>
                    <UsageBar used={used} limit={limit} className="h-1" />
                    {reset ? (
                      <div className="tabular text-[10px] text-muted-foreground">⟳ {reset}</div>
                    ) : null}
                  </div>
                )
              })}
              {k.usage_5h > 0 || k.usage_1d > 0 || k.usage_7d > 0 ? (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-1.5 text-xs"
                  title={t('keys.resetRateLimitUsage')}
                  onClick={() => setResetRate(k)}
                >
                  <RefreshCw aria-hidden /> {t('keys.resetUsage')}
                </Button>
              ) : null}
            </div>
          )
        }
      },
      expires_at: {
        id: 'expires_at',
        header: label('expires_at'),
        cell: ({ row }) =>
          row.original.expires_at ? (
            <span
              className={cn(
                'text-sm',
                new Date(row.original.expires_at) < new Date() ? 'text-destructive' : 'text-muted-foreground'
              )}
            >
              {formatDateTime(row.original.expires_at)}
            </span>
          ) : (
            <span className="text-sm text-muted-foreground">{t('keys.noExpiration')}</span>
          )
      },
      status: {
        id: 'status',
        header: label('status'),
        cell: ({ row }) => (
          <StatusBadge status={STATUS_TONE[row.original.status] ?? 'neutral'}>
            {t(`keys.status.${row.original.status}`)}
          </StatusBadge>
        )
      },
      last_used_at: {
        id: 'last_used_at',
        header: label('last_used_at'),
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {row.original.last_used_at ? formatDateTime(row.original.last_used_at) : '-'}
          </span>
        )
      },
      last_used_ip: {
        id: 'last_used_ip',
        header: label('last_used_ip'),
        enableSorting: false,
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">{row.original.last_used_ip || '-'}</span>
        )
      },
      created_at: {
        id: 'created_at',
        header: label('created_at'),
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">{formatDateTime(row.original.created_at)}</span>
        )
      },
      actions: {
        id: 'actions',
        header: label('actions'),
        enableSorting: false,
        cell: ({ row }) => {
          const k = row.original
          return (
            <div className="flex items-center gap-0.5">
              <Button size="sm" variant="ghost" onClick={() => setUseKey(k)} title={t('keys.useKey')}>
                <Terminal aria-hidden /> <span className="hidden xl:inline">{t('keys.useKey')}</span>
              </Button>
              {!settings.data?.hide_ccs_import_button ? (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => importToCcswitch(k)}
                  title={t('keys.importToCcSwitch')}
                >
                  <Upload aria-hidden /> <span className="hidden xl:inline">CCS</span>
                </Button>
              ) : null}
              <Button
                size="sm"
                variant="ghost"
                onClick={() => void toggleStatus(k)}
                disabled={k.status === 'quota_exhausted' || k.status === 'expired'}
              >
                <Eye aria-hidden /> {k.status === 'active' ? t('keys.disable') : t('keys.enable')}
              </Button>
              <Button
                size="icon"
                variant="ghost"
                aria-label={t('common.edit')}
                onClick={() => {
                  setEditing(k)
                  setFormOpen(true)
                }}
              >
                <SquarePen aria-hidden />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                aria-label={t('common.delete')}
                className="text-destructive hover:text-destructive"
                onClick={() => setDeleting(k)}
              >
                <Trash2 aria-hidden />
              </Button>
            </div>
          )
        }
      }
    }
    return ALL_COLUMNS.map((k) => ({ ...defs[k], enableSorting: SORTABLE.has(k) }))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- label/importToCcswitch 读取最新 state，列定义仅随数据变化重建
  }, [usage.data, usage.isLoading, groupList, userRates, now, settings.data, items])

  const visibility = Object.fromEntries(columnsState.hidden.map((k) => [k, false]))
  const toggleable = ALL_COLUMNS.filter((c) => !ALWAYS_VISIBLE.includes(c)).map((key) => ({
    key,
    label: label(key)
  }))
  const selectedKeys = items.filter((k) => selection[String(k.id)])

  const onSorting = (u: Updater<SortingState>) => {
    setSorting((prev) => (typeof u === 'function' ? u(prev) : u).slice(-1))
    resetPaging()
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('keys.title')}
        description={t('keys.description')}
        actions={
          <>
            <Button
              variant="outline"
              size="icon"
              aria-label={t('common.refresh')}
              title={t('common.refresh')}
              onClick={() => void reload()}
              disabled={list.isFetching}
            >
              <RefreshCw className={list.isFetching ? 'animate-spin' : ''} aria-hidden />
            </Button>
            <ColumnSettings
              columns={toggleable}
              isVisible={columnsState.isVisible}
              onToggle={columnsState.toggle}
            />
            <Button
              data-tour="keys-create-btn"
              onClick={() => {
                setEditing(null)
                setFormOpen(true)
              }}
            >
              <Plus aria-hidden />
              {t('keys.createKey')}
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <SearchInput
          value={search}
          onValueChange={(v) => {
            setSearch(v)
            resetPaging()
          }}
          placeholder={t('keys.searchPlaceholder')}
          containerClassName="w-full sm:w-64"
        />
        <NativeSelect
          className="w-44"
          aria-label={t('keys.group')}
          value={groupId}
          onChange={(e) => {
            setGroupId(e.target.value)
            resetPaging()
          }}
        >
          <option value="">{t('keys.allGroups')}</option>
          <option value="0">{t('keys.noGroup')}</option>
          {groupList.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect
          className="w-40"
          aria-label={t('common.status')}
          value={status}
          onChange={(e) => {
            setStatus(e.target.value)
            resetPaging()
          }}
        >
          <option value="">{t('keys.allStatus')}</option>
          {(['active', 'inactive', 'quota_exhausted', 'expired'] as const).map((s) => (
            <option key={s} value={s}>
              {t(`keys.status.${s}`)}
            </option>
          ))}
        </NativeSelect>
        <EndpointPopover
          apiBaseUrl={settings.data?.api_base_url || ''}
          customEndpoints={settings.data?.custom_endpoints || []}
        />
      </div>

      <DataTable
        columns={columns}
        data={items}
        loading={list.isLoading}
        selectable
        getRowId={(k) => String(k.id)}
        rowSelection={selection}
        onRowSelectionChange={(u) => setSelection((p) => (typeof u === 'function' ? u(p) : u))}
        columnVisibility={visibility}
        sorting={sorting}
        onSortingChange={onSorting}
        emptyTitle={t('keys.noKeysYet')}
        emptyDescription={t('keys.createFirstKey')}
        bulkActions={(rows) => (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              data-test="bulk-edit-keys"
              disabled={list.isFetching}
              onClick={() => setBulkOpen(true)}
            >
              {t('keys.bulkEdit.title')} ({rows.length})
            </Button>
            <Button size="sm" variant="outline" onClick={() => setSelection({})}>
              {t('keys.bulkEdit.clearSelection')}
            </Button>
          </div>
        )}
        pagination={{
          page,
          pageSize,
          total: list.data?.total ?? 0,
          pageSizeOptions: getConfiguredTablePageSizeOptions(),
          onPageChange: (p) => {
            setSelection({})
            setPage(p)
          },
          onPageSizeChange: (s) => {
            setPersistedPageSize(s)
            setPageSize(s)
            resetPaging()
          }
        }}
      />

      <KeyFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        editing={editing}
        groups={groupList}
        userRates={userRates}
        onSaved={() => void reload()}
      />
      <BulkEditKeysDialog
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        selectedKeys={selectedKeys}
        groups={groupList}
        onUpdated={(done) => {
          setSelection((s) =>
            Object.fromEntries(Object.entries(s).filter(([id]) => !done.includes(Number(id))))
          )
          void reload()
        }}
      />
      <UseKeyDialog
        open={!!useKey}
        onOpenChange={(o) => !o && setUseKey(null)}
        apiKey={useKey?.key || ''}
        baseUrl={settings.data?.api_base_url || ''}
        platform={useKey?.group?.platform || null}
        claudeCodeOnly={useKey?.group?.claude_code_only || false}
        allowMessagesDispatch={useKey?.group?.allow_messages_dispatch || false}
      />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        destructive
        title={t('keys.deleteKey')}
        description={t('keys.deleteConfirmMessage', { name: deleting?.name ?? '' })}
        confirmText={t('common.delete')}
        onConfirm={doDelete}
      />
      <ConfirmDialog
        open={!!resetRate}
        onOpenChange={(o) => !o && setResetRate(null)}
        title={t('keys.resetRateLimitTitle')}
        description={t('keys.resetRateLimitConfirmMessage', { name: resetRate?.name ?? '' })}
        confirmText={t('keys.resetRateLimitUsage')}
        onConfirm={doResetRate}
      />
      <Dialog open={!!ccsRow} onOpenChange={(o) => !o && setCcsRow(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('keys.ccsClientSelect.title')}</DialogTitle>
            <DialogDescription>{t('keys.ccsClientSelect.description')}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            {(['claude', 'gemini'] as const).map((c) => (
              <button
                key={c}
                type="button"
                className="flex items-center gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-muted"
                onClick={() => {
                  if (ccsRow) executeCcsImport(ccsRow, c)
                  setCcsRow(null)
                }}
              >
                <KeyRound className="size-5 text-primary" aria-hidden />
                <span>
                  <span className="block text-sm font-medium">
                    {c === 'claude'
                      ? t('keys.ccsClientSelect.claudeCode')
                      : t('keys.ccsClientSelect.geminiCli')}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {c === 'claude'
                      ? t('keys.ccsClientSelect.claudeCodeDesc')
                      : t('keys.ccsClientSelect.geminiCliDesc')}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
