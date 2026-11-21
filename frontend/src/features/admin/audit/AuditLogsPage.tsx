/** /admin/audit-logs：管理面操作审计（筛选 / 时间范围 / 详情 / 二次确认 + TOTP 清空）。 */
import * as React from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { Eye, RefreshCw, Search, Trash2 } from 'lucide-react'
import { adminAPI, totpAPI } from '@/api'
import type { AuditLog } from '@/api/admin/audit'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { DataTable } from '@/components/DataTable'
import { FormField } from '@/components/FormField'
import { PageHeader } from '@/components/PageHeader'
import { StatusBadge } from '@/components/StatusBadge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { AdminFormDialog } from '@/features/admin/common/AdminFormDialog'
import { FilterBar, FilterSelect } from '@/features/admin/common/FilterBar'
import { toLocalInput } from '@/features/admin/common/fieldUtils'
import { notifyError, notifySuccess } from '@/features/admin/common/notify'
import { useTableState } from '@/features/admin/common/useTableState'
import { t } from '@/i18n'
import { useLocale } from '@/i18n/react'
import { useAppStore } from '@/stores/app'
import { formatDateTime } from '@/utils/format'
import { buildAuditQuery, emptyAuditFilters, prettyBody, statusTone, type AuditFilters } from './auditModel'

const TIME_RANGES = ['', '30m', '1h', '6h', '24h', '7d', '30d'] as const

function DetailDialog({ id, onClose }: { id: number; onClose: () => void }) {
  const q = useQuery({ queryKey: ['admin', 'audit', 'detail', id], queryFn: () => adminAPI.audit.get(id) })
  React.useEffect(() => {
    if (q.error) {
      notifyError(q.error, t('admin.audit.loadFailed'))
      onClose()
    }
  }, [q.error, onClose])
  const d = q.data
  return (
    <AdminFormDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={t('admin.audit.detail.title')}
      size="xl"
    >
      {q.isLoading || !d ? (
        <div className="grid gap-3">
          <Skeleton className="h-16" />
          <Skeleton className="h-24" />
        </div>
      ) : (
        <div className="grid gap-4 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={statusTone(d.status_code)}>{d.status_code}</StatusBadge>
            <span className="break-all font-mono font-semibold">{d.action}</span>
          </div>
          <div className="rounded-md border bg-muted/40 px-3 py-2 font-mono text-xs break-all">
            <b>{d.method}</b> {d.path}
          </div>
          <dl className="grid gap-3 sm:grid-cols-3">
            <div>
              <dt className="text-xs text-muted-foreground">{t('admin.audit.columns.actor')}</dt>
              <dd className="break-all">{d.actor_email || '—'}</dd>
              <dd className="text-xs text-muted-foreground">{d.actor_role}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{t('admin.audit.filters.authMethod')}</dt>
              <dd>{d.auth_method || '—'}</dd>
              {d.credential_masked ? (
                <dd className="font-mono text-xs break-all text-muted-foreground">{d.credential_masked}</dd>
              ) : null}
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{t('admin.audit.columns.clientIp')}</dt>
              <dd className="font-mono break-all">{d.client_ip || '—'}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{t('admin.audit.columns.time')}</dt>
              <dd>{formatDateTime(d.created_at)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{t('admin.audit.detail.latency')}</dt>
              <dd>{d.latency_ms} ms</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{t('admin.audit.detail.requestId')}</dt>
              <dd className="font-mono text-xs break-all">{d.request_id || '—'}</dd>
            </div>
          </dl>
          <section>
            <h4 className="mb-1 text-xs font-semibold text-muted-foreground uppercase">
              {t('admin.audit.detail.userAgent')}
            </h4>
            <p className="rounded-md bg-muted/40 p-2 font-mono text-xs break-all">{d.user_agent || '—'}</p>
          </section>
          {d.request_body ? (
            <section>
              <h4 className="mb-1 text-xs font-semibold text-muted-foreground uppercase">
                {t('admin.audit.detail.requestBody')}
              </h4>
              <pre className="max-h-72 overflow-auto rounded-md bg-muted/40 p-3 font-mono text-xs">
                {prettyBody(d.request_body)}
              </pre>
            </section>
          ) : null}
          {d.extra && Object.keys(d.extra).length > 0 ? (
            <section>
              <h4 className="mb-1 text-xs font-semibold text-muted-foreground uppercase">
                {t('admin.audit.detail.extra')}
              </h4>
              <pre className="max-h-48 overflow-auto rounded-md bg-muted/40 p-3 font-mono text-xs">
                {JSON.stringify(d.extra, null, 2)}
              </pre>
            </section>
          ) : null}
        </div>
      )}
    </AdminFormDialog>
  )
}

export function AuditLogsPage() {
  const locale = useLocale()
  const qc = useQueryClient()
  const table = useTableState()
  const [filters, setFilters] = React.useState<AuditFilters>(emptyAuditFilters())
  const [applied, setApplied] = React.useState<AuditFilters>(emptyAuditFilters())
  const [timeRange, setTimeRange] = React.useState('')
  const [custom, setCustom] = React.useState({ start: '', end: '' })
  const [customDlg, setCustomDlg] = React.useState<{ start: string; end: string } | null>(null)
  const [detailId, setDetailId] = React.useState<number | null>(null)
  const [clearStep, setClearStep] = React.useState<'' | 'confirm' | 'totp'>('')
  const [checking, setChecking] = React.useState(false)
  const [totp, setTotp] = React.useState('')
  const [clearing, setClearing] = React.useState(false)

  // 时间范围的绝对时刻只在“查询”时确定，避免每次渲染变化导致无限刷新
  const [anchor, setAnchor] = React.useState(() => Date.now())
  const params = React.useMemo(
    () => buildAuditQuery(table.page, table.pageSize, applied, timeRange, custom, anchor),
    [table.page, table.pageSize, applied, timeRange, custom, anchor]
  )
  const query = useQuery({
    queryKey: ['admin', 'audit', 'list', params],
    queryFn: () => adminAPI.audit.list(params),
    placeholderData: (prev) => prev
  })
  React.useEffect(() => {
    if (query.error) notifyError(query.error, t('admin.audit.loadFailed'))
  }, [query.error])

  const search = () => {
    table.setPage(1)
    setApplied(filters)
    setAnchor(Date.now())
  }
  const reset = () => {
    setFilters(emptyAuditFilters())
    setApplied(emptyAuditFilters())
    setTimeRange('')
    setCustom({ start: '', end: '' })
    table.setPage(1)
    setAnchor(Date.now())
  }

  const onTimeRange = (v: string) => {
    if (v === 'custom') {
      const now = new Date()
      setCustomDlg({
        start: custom.start || toLocalInput(new Date(now.getTime() - 3_600_000).toISOString()),
        end: custom.end || toLocalInput(now.toISOString())
      })
      return
    }
    setTimeRange(v)
    table.setPage(1)
    setAnchor(Date.now())
  }

  const openClear = async () => {
    if (checking) return
    setChecking(true)
    try {
      const status = await totpAPI.getStatus()
      if (!status.enabled) {
        useAppStore.getState().showError(t('stepUp.notEnabled'))
        return
      }
      setClearStep('confirm')
    } catch (e) {
      notifyError(e, t('admin.audit.loadFailed'))
    } finally {
      setChecking(false)
    }
  }

  const submitClear = async () => {
    if (totp.length !== 6 || clearing) return
    setClearing(true)
    try {
      const res = await adminAPI.audit.clear(totp)
      notifySuccess(t('admin.audit.clearConfirm.success', { count: res.deleted }))
      setClearStep('')
      setTotp('')
      table.setPage(1)
      void qc.invalidateQueries({ queryKey: ['admin', 'audit', 'list'] })
    } catch (e) {
      notifyError(e, t('admin.audit.clearConfirm.failed'))
    } finally {
      setClearing(false)
    }
  }

  const methodLabel = (m: string) =>
    m === 'jwt' ? 'JWT' : m === 'admin_api_key' ? 'Admin API Key' : m === 'mcp_oauth' ? 'MCP OAuth' : m
  const all = { value: '', label: t('admin.audit.filters.all') }

  const columns = React.useMemo<ColumnDef<AuditLog, unknown>[]>(
    () => [
      {
        id: 'created_at',
        header: t('admin.audit.columns.time'),
        cell: ({ row }) => (
          <span className="whitespace-nowrap">{formatDateTime(row.original.created_at)}</span>
        )
      },
      {
        id: 'actor',
        header: t('admin.audit.columns.actor'),
        cell: ({ row }) => (
          <div className="max-w-[220px] min-w-0">
            <div className="truncate font-medium" title={row.original.actor_email}>
              {row.original.actor_email || '—'}
            </div>
            <div className="truncate text-xs text-muted-foreground">
              {row.original.actor_role}
              {row.original.auth_method ? ` · ${methodLabel(row.original.auth_method)}` : ''}
            </div>
          </div>
        )
      },
      {
        id: 'action',
        header: t('admin.audit.columns.action'),
        cell: ({ row }) => (
          <div className="max-w-xs min-w-0">
            <div className="truncate font-mono text-sm" title={row.original.action}>
              {row.original.action}
            </div>
            <div className="truncate font-mono text-xs text-muted-foreground">
              {row.original.method} {row.original.path}
            </div>
          </div>
        )
      },
      {
        id: 'status_code',
        header: t('admin.audit.columns.result'),
        cell: ({ row }) => (
          <StatusBadge status={statusTone(row.original.status_code)}>{row.original.status_code}</StatusBadge>
        )
      },
      {
        id: 'latency_ms',
        header: t('admin.audit.detail.latency'),
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-muted-foreground">{row.original.latency_ms} ms</span>
        )
      },
      {
        id: 'client_ip',
        header: t('admin.audit.columns.clientIp'),
        cell: ({ row }) => <span className="font-mono">{row.original.client_ip || '—'}</span>
      },
      {
        id: 'actions',
        header: t('common.actions'),
        cell: ({ row }) => (
          <Button variant="ghost" size="sm" onClick={() => setDetailId(row.original.id)}>
            <Eye aria-hidden />
            {t('admin.audit.columns.detail')}
          </Button>
        )
      }
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [locale]
  )

  const set = (k: keyof AuditFilters) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setFilters((f) => ({ ...f, [k]: e.target.value.trim() }))
  const enter = (e: React.KeyboardEvent) => e.key === 'Enter' && search()

  return (
    <div>
      <PageHeader
        title={t('admin.audit.title')}
        description={t('admin.audit.description')}
        actions={
          <>
            <Button variant="outline" aria-label={t('common.refresh')} onClick={() => void query.refetch()}>
              <RefreshCw className={query.isFetching ? 'animate-spin' : undefined} aria-hidden />
            </Button>
            <Button variant="destructive" loading={checking} onClick={() => void openClear()}>
              <Trash2 aria-hidden />
              {t('admin.audit.clearAll')}
            </Button>
          </>
        }
      />
      <FilterBar
        onReset={reset}
        actions={
          <Button onClick={search}>
            <Search aria-hidden />
            {t('common.search')}
          </Button>
        }
      >
        <Input
          className="w-56"
          aria-label={t('admin.audit.filters.q')}
          placeholder={t('admin.audit.filters.qPlaceholder')}
          value={filters.q}
          onChange={set('q')}
          onKeyDown={enter}
        />
        <Input
          className="w-48"
          aria-label={t('admin.audit.filters.actorEmail')}
          placeholder={t('admin.audit.filters.actorEmail')}
          value={filters.actor_email}
          onChange={set('actor_email')}
          onKeyDown={enter}
        />
        <Input
          className="w-40"
          aria-label={t('admin.audit.filters.action')}
          placeholder={t('admin.audit.filters.action')}
          value={filters.action}
          onChange={set('action')}
          onKeyDown={enter}
        />
        <Input
          className="w-36"
          aria-label={t('admin.audit.filters.clientIp')}
          placeholder={t('admin.audit.filters.clientIp')}
          value={filters.client_ip}
          onChange={set('client_ip')}
          onKeyDown={enter}
        />
        <FilterSelect
          label={t('admin.audit.filters.method')}
          value={filters.method}
          onChange={(v) => setFilters((f) => ({ ...f, method: v }))}
          options={[all, ...['POST', 'PUT', 'PATCH', 'DELETE', 'GET'].map((m) => ({ value: m, label: m }))]}
        />
        <FilterSelect
          label={t('admin.audit.filters.authMethod')}
          value={filters.auth_method}
          onChange={(v) => setFilters((f) => ({ ...f, auth_method: v }))}
          options={[
            all,
            { value: 'jwt', label: 'JWT' },
            { value: 'admin_api_key', label: 'Admin API Key' },
            { value: 'mcp_oauth', label: 'MCP OAuth' }
          ]}
        />
        <FilterSelect
          label={t('admin.audit.filters.result')}
          value={filters.success}
          onChange={(v) => setFilters((f) => ({ ...f, success: v }))}
          options={[
            all,
            { value: 'true', label: t('admin.audit.filters.resultSuccess') },
            { value: 'false', label: t('admin.audit.filters.resultFailure') }
          ]}
        />
        <FilterSelect
          label={t('admin.dashboard.timeRange')}
          value={timeRange}
          onChange={onTimeRange}
          options={[
            ...TIME_RANGES.map((r) => ({
              value: r,
              label: r ? t(`admin.ops.timeRange.${r}`) : t('admin.audit.filters.all')
            })),
            { value: 'custom', label: t('admin.ops.timeRange.custom') }
          ]}
        />
      </FilterBar>

      <DataTable
        columns={columns}
        data={query.data?.items ?? []}
        loading={query.isLoading}
        getRowId={(r) => String(r.id)}
        pagination={table.pagination(query.data?.total ?? 0)}
        emptyTitle={t('admin.audit.empty')}
      />

      {detailId !== null ? <DetailDialog id={detailId} onClose={() => setDetailId(null)} /> : null}

      <AdminFormDialog
        open={customDlg !== null}
        onOpenChange={(o) => !o && setCustomDlg(null)}
        title={t('admin.ops.timeRange.custom')}
        size="sm"
        submitText={t('common.confirm')}
        submitDisabled={!customDlg?.start || !customDlg?.end}
        onSubmit={() => {
          if (!customDlg) return
          setCustom(customDlg)
          setTimeRange('custom')
          setCustomDlg(null)
          table.setPage(1)
          setAnchor(Date.now())
        }}
      >
        <FormField label={t('admin.audit.filters.startTime')}>
          <Input
            type="datetime-local"
            value={customDlg?.start ?? ''}
            onChange={(e) => setCustomDlg((c) => (c ? { ...c, start: e.target.value } : c))}
          />
        </FormField>
        <FormField label={t('admin.audit.filters.endTime')}>
          <Input
            type="datetime-local"
            value={customDlg?.end ?? ''}
            onChange={(e) => setCustomDlg((c) => (c ? { ...c, end: e.target.value } : c))}
          />
        </FormField>
      </AdminFormDialog>

      <ConfirmDialog
        open={clearStep === 'confirm'}
        onOpenChange={(o) => !o && setClearStep('')}
        title={t('admin.audit.clearConfirm.title')}
        description={t('admin.audit.clearConfirm.message')}
        confirmText={t('admin.audit.clearAll')}
        destructive
        onConfirm={() => setClearStep('totp')}
      />

      <AdminFormDialog
        open={clearStep === 'totp'}
        onOpenChange={(o) => {
          if (!o) {
            setClearStep('')
            setTotp('')
          }
        }}
        title={t('admin.audit.clearConfirm.totpTitle')}
        description={t('admin.audit.clearConfirm.totpHint')}
        size="sm"
        destructive
        submitText={t('admin.audit.clearAll')}
        submitting={clearing}
        submitDisabled={totp.length !== 6}
        onSubmit={submitClear}
      >
        <Input
          value={totp}
          inputMode="numeric"
          maxLength={6}
          autoComplete="one-time-code"
          autoFocus
          aria-label={t('admin.audit.clearConfirm.totpTitle')}
          className="text-center text-lg tracking-[0.5em]"
          placeholder="••••••"
          onChange={(e) => setTotp(e.target.value.trim())}
        />
      </AdminFormDialog>
    </div>
  )
}
