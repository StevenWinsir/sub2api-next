/** /admin/channels/monitor：渠道监控管理（列表 / 启停 / 立即检测 / 历史趋势 / 复制 / 请求模板）。页面不可见时暂停轮询。 */
import * as React from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { LayoutTemplate, Plus, RefreshCw } from 'lucide-react'
import { adminAPI } from '@/api/admin'
import type { ChannelMonitor, Provider, RunNowResponse } from '@/api/admin/channelMonitor'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { DataTable } from '@/components/DataTable'
import { PageHeader } from '@/components/PageHeader'
import { SearchInput } from '@/components/SearchInput'
import { StatusBadge } from '@/components/StatusBadge'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { FilterBar, FilterSelect } from '@/features/admin/common/FilterBar'
import { notifySuccess } from '@/features/admin/common/notify'
import { RowActions } from '@/features/admin/common/RowActions'
import { useAdminAction } from '@/features/admin/common/useAdminAction'
import { useTableState } from '@/features/admin/common/useTableState'
import { usePageVisible } from '@/hooks/usePageVisibility'
import { t } from '@/i18n'
import { useLocale } from '@/i18n/react'
import { formatRelativeTime } from '@/utils/format'
import {
  HistoryDialog,
  MonitorFormDialog,
  PROVIDERS,
  RunResultDialog,
  STATUS_TONE,
  TemplateManagerDialog
} from './MonitorDialogs'

type Dlg =
  | { kind: 'form'; monitor: ChannelMonitor | null }
  | { kind: 'result'; monitor: ChannelMonitor; result: RunNowResponse }
  | { kind: 'history'; monitor: ChannelMonitor }
  | { kind: 'delete'; monitor: ChannelMonitor }
  | { kind: 'templates' }
  | null

export function ChannelMonitorAdminPage() {
  const locale = useLocale()
  const qc = useQueryClient()
  const visible = usePageVisible()
  const { busy, run } = useAdminAction()
  const table = useTableState()
  const [search, setSearch] = React.useState('')
  const [provider, setProvider] = React.useState('')
  const [enabled, setEnabled] = React.useState('')
  const [running, setRunning] = React.useState<Set<number>>(new Set())
  const [dlg, setDlg] = React.useState<Dlg>(null)

  const params = React.useMemo(
    () => ({
      page: table.page,
      page_size: table.pageSize,
      provider: (provider || undefined) as Provider | undefined,
      enabled: enabled === '' ? undefined : enabled === 'true',
      search: search || undefined
    }),
    [table.page, table.pageSize, provider, enabled, search]
  )
  const query = useQuery({
    queryKey: ['admin', 'channel-monitor', 'list', params],
    queryFn: ({ signal }) => adminAPI.channelMonitor.list(params, { signal }),
    placeholderData: (p) => p,
    refetchInterval: visible ? 30_000 : false
  })
  const refresh = () => qc.invalidateQueries({ queryKey: ['admin', 'channel-monitor'] })

  const runNow = async (m: ChannelMonitor) => {
    setRunning((s) => new Set(s).add(m.id))
    const res = await run(() => adminAPI.channelMonitor.runNow(m.id), {
      fallback: t('admin.channelMonitor.runFailed')
    })
    setRunning((s) => {
      const n = new Set(s)
      n.delete(m.id)
      return n
    })
    if (res) {
      setDlg({ kind: 'result', monitor: m, result: res })
      void refresh()
    }
  }

  const cols = React.useMemo<ColumnDef<ChannelMonitor, unknown>[]>(
    () => [
      {
        id: 'name',
        header: t('admin.channelMonitor.columns.name'),
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="max-w-56 truncate font-medium">{row.original.name}</p>
            <p className="max-w-56 truncate text-xs text-muted-foreground">
              {row.original.group_name || row.original.endpoint}
            </p>
          </div>
        )
      },
      {
        id: 'provider',
        header: t('admin.channelMonitor.columns.provider'),
        cell: ({ row }) => row.original.provider
      },
      {
        id: 'model',
        header: t('admin.channelMonitor.columns.primaryModel'),
        cell: ({ row }) => <code className="text-xs">{row.original.primary_model || '—'}</code>
      },
      {
        id: 'status',
        header: t('common.status'),
        cell: ({ row }) =>
          row.original.primary_status ? (
            <div className="flex items-center gap-2">
              <StatusBadge status={STATUS_TONE[row.original.primary_status]}>
                {row.original.primary_status}
              </StatusBadge>
              <span className="text-xs text-muted-foreground">
                {row.original.last_checked_at ? formatRelativeTime(row.original.last_checked_at) : ''}
              </span>
            </div>
          ) : (
            <span className="text-muted-foreground">—</span>
          )
      },
      {
        id: 'latency',
        header: t('admin.channelMonitor.columns.latency'),
        cell: ({ row }) => <span className="tabular">{row.original.primary_latency_ms ?? '—'}</span>
      },
      {
        id: 'avail',
        header: '7d',
        cell: ({ row }) => (
          <span className="tabular">
            {row.original.availability_7d != null ? `${row.original.availability_7d.toFixed(2)}%` : '—'}
          </span>
        )
      },
      {
        id: 'enabled',
        header: t('admin.channelMonitor.columns.enabled'),
        cell: ({ row }) => (
          <Switch
            checked={row.original.enabled}
            aria-label={`${t('admin.channelMonitor.columns.enabled')} ${row.original.name}`}
            onCheckedChange={async (v) => {
              const ok = await run(() => adminAPI.channelMonitor.update(row.original.id, { enabled: v }), {})
              if (ok) void refresh()
            }}
          />
        )
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">{t('admin.channelMonitor.columns.actions')}</span>,
        cell: ({ row }) => {
          const m = row.original
          return (
            <RowActions
              actions={[
                {
                  key: 'run',
                  label: running.has(m.id) ? t('admin.accounts.testing') : t('admin.channelMonitor.runNow'),
                  disabled: running.has(m.id),
                  onSelect: () => void runNow(m)
                },
                {
                  key: 'history',
                  label: t('adminUi.monitor.history'),
                  onSelect: () => setDlg({ kind: 'history', monitor: m })
                },
                {
                  key: 'edit',
                  label: t('common.edit'),
                  onSelect: () => setDlg({ kind: 'form', monitor: m })
                },
                {
                  key: 'dup',
                  label: t('admin.channelMonitor.duplicate'),
                  onSelect: async () => {
                    const copy = await run(() => adminAPI.channelMonitor.duplicate(m.id), {
                      fallback: t('admin.channelMonitor.duplicateFailed')
                    })
                    if (copy) {
                      notifySuccess(t('admin.channelMonitor.duplicateSuccess', { name: copy.name }))
                      void refresh()
                    }
                  }
                },
                {
                  key: 'delete',
                  separator: true,
                  label: t('common.delete'),
                  destructive: true,
                  onSelect: () => setDlg({ kind: 'delete', monitor: m })
                }
              ]}
            />
          )
        }
      }
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 只依赖语言与检测中状态
    [locale, running]
  )

  return (
    <div>
      <PageHeader
        title={t('admin.channelMonitor.title')}
        description={t('admin.channelMonitor.description')}
        actions={
          <>
            <Button variant="outline" aria-label={t('common.refresh')} onClick={() => void refresh()}>
              <RefreshCw className={query.isFetching ? 'animate-spin' : undefined} aria-hidden />
            </Button>
            <Button variant="outline" onClick={() => setDlg({ kind: 'templates' })}>
              <LayoutTemplate aria-hidden />
              <span className="hidden md:inline">{t('admin.channelMonitor.template.manageButton')}</span>
            </Button>
            <Button onClick={() => setDlg({ kind: 'form', monitor: null })}>
              <Plus aria-hidden />
              {t('admin.channelMonitor.createButton')}
            </Button>
          </>
        }
      />
      <FilterBar
        onReset={() => {
          setSearch('')
          setProvider('')
          setEnabled('')
          table.setPage(1)
        }}
      >
        <SearchInput
          value={search}
          onValueChange={(v) => {
            setSearch(v)
            table.setPage(1)
          }}
          placeholder={t('admin.channelMonitor.searchPlaceholder')}
          containerClassName="w-full sm:w-72"
        />
        <FilterSelect
          label={t('admin.channelMonitor.columns.provider')}
          value={provider}
          onChange={(v) => {
            setProvider(v)
            table.setPage(1)
          }}
          options={[
            { value: '', label: t('admin.channelMonitor.allProviders') },
            ...PROVIDERS.map((p) => ({ value: p, label: p }))
          ]}
        />
        <FilterSelect
          label={t('admin.channelMonitor.enabledFilter')}
          value={enabled}
          onChange={(v) => {
            setEnabled(v)
            table.setPage(1)
          }}
          options={[
            { value: '', label: t('admin.channelMonitor.allStatus') },
            { value: 'true', label: t('admin.channelMonitor.onlyEnabled') },
            { value: 'false', label: t('admin.channelMonitor.onlyDisabled') }
          ]}
        />
      </FilterBar>
      <DataTable
        columns={cols}
        data={query.data?.items ?? []}
        loading={query.isLoading}
        getRowId={(m) => String(m.id)}
        pagination={table.pagination(query.data?.total ?? 0)}
        emptyTitle={t('admin.channelMonitor.noMonitorsYet')}
        emptyDescription={t('admin.channelMonitor.createFirstMonitor')}
      />
      {dlg?.kind === 'form' ? (
        <MonitorFormDialog
          monitor={dlg.monitor}
          onClose={() => setDlg(null)}
          onSaved={() => {
            setDlg(null)
            void refresh()
          }}
        />
      ) : null}
      {dlg?.kind === 'result' ? (
        <RunResultDialog monitor={dlg.monitor} result={dlg.result} onClose={() => setDlg(null)} />
      ) : null}
      {dlg?.kind === 'history' ? <HistoryDialog monitor={dlg.monitor} onClose={() => setDlg(null)} /> : null}
      {dlg?.kind === 'templates' ? (
        <TemplateManagerDialog onClose={() => setDlg(null)} onApplied={() => void refresh()} />
      ) : null}
      <ConfirmDialog
        open={dlg?.kind === 'delete'}
        onOpenChange={(o) => !o && setDlg(null)}
        title={t('common.delete')}
        description={t('admin.channelMonitor.deleteConfirm')}
        destructive
        confirmText={t('common.delete')}
        loading={busy}
        onConfirm={async () => {
          if (dlg?.kind !== 'delete') return
          const m = dlg.monitor
          const ok = await run(() => adminAPI.channelMonitor.del(m.id).then(() => true), {
            success: t('admin.channelMonitor.deleteSuccess')
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
