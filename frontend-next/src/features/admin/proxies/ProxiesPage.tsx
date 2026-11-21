/** /admin/proxies：代理管理（列表 / 增改 / 批量导入 / 连通性与质量检测 / 到期提醒 / 导入导出）。 */
import * as React from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { Download, Plus, RefreshCw, Upload } from 'lucide-react'
import { saveAs } from 'file-saver'
import { adminAPI } from '@/api/admin'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { DataTable } from '@/components/DataTable'
import { FormField } from '@/components/FormField'
import { NativeSelect } from '@/components/NativeSelect'
import { PageHeader } from '@/components/PageHeader'
import { PasswordInput } from '@/components/PasswordInput'
import { SearchInput } from '@/components/SearchInput'
import { StatusBadge } from '@/components/StatusBadge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input, Textarea } from '@/components/ui/input'
import { AdminFormDialog } from '@/features/admin/common/AdminFormDialog'
import { FilterBar, FilterSelect } from '@/features/admin/common/FilterBar'
import { fromLocalInput, numOrNull, numOrUndef, str, toLocalInput } from '@/features/admin/common/fieldUtils'
import { notifyError, notifySuccess } from '@/features/admin/common/notify'
import { RowActions } from '@/features/admin/common/RowActions'
import { useAdminAction } from '@/features/admin/common/useAdminAction'
import { useTableState } from '@/features/admin/common/useTableState'
import { TotpStepUpDialog } from '@/features/auth/TotpStepUpDialog'
import { useStepUp } from '@/hooks/useStepUp'
import { t } from '@/i18n'
import { useLocale } from '@/i18n/react'
import type { AdminDataPayload, Proxy, ProxyProtocol } from '@/types'
import { formatDateTime } from '@/utils/format'
import { parseBatchInput } from './parseProxy'

const PROTOCOLS: ProxyProtocol[] = ['http', 'https', 'socks5', 'socks5h']

/** 到期状态文案：永不过期 / 已过期 / 剩余天数。 */
export function expiryLabel(
  expiresAt: string | null,
  now = Date.now()
): { text: string; tone: 'success' | 'warning' | 'error' | 'neutral' } {
  if (!expiresAt) return { text: t('admin.proxies.neverExpires'), tone: 'neutral' }
  const diff = new Date(expiresAt).getTime() - now
  const days = Math.ceil(diff / 86_400_000)
  if (diff <= 0)
    return {
      text: t('admin.proxies.overdueDays', { days: Math.max(1, -Math.floor(diff / 86_400_000)) }),
      tone: 'error'
    }
  return { text: t('admin.proxies.remainingDays', { days }), tone: days <= 7 ? 'warning' : 'success' }
}

type Dlg =
  | { kind: 'form'; proxy: Proxy | null }
  | { kind: 'batch' }
  | { kind: 'import' }
  | { kind: 'accounts'; proxy: Proxy }
  | { kind: 'delete'; proxy: Proxy }
  | { kind: 'bulkDelete'; ids: number[] }
  | null

function ProxyFormDialog({
  proxy,
  all,
  onClose,
  onSaved
}: {
  proxy: Proxy | null
  all: Proxy[]
  onClose: () => void
  onSaved: () => void
}) {
  const { busy, run } = useAdminAction()
  const [name, setName] = React.useState(proxy?.name ?? '')
  const [protocol, setProtocol] = React.useState<ProxyProtocol>(proxy?.protocol ?? 'http')
  const [host, setHost] = React.useState(proxy?.host ?? '')
  const [port, setPort] = React.useState(str(proxy?.port))
  const [username, setUsername] = React.useState(proxy?.username ?? '')
  const [password, setPassword] = React.useState('')
  const [expires, setExpires] = React.useState(toLocalInput(proxy?.expires_at))
  const [fallback, setFallback] = React.useState<'none' | 'proxy' | 'direct'>(proxy?.fallback_mode ?? 'none')
  const [backup, setBackup] = React.useState(str(proxy?.backup_proxy_id))
  const [warnDays, setWarnDays] = React.useState(
    str((proxy as { expiry_warn_days?: number } | null)?.expiry_warn_days)
  )
  const [status, setStatus] = React.useState<'active' | 'inactive'>(
    proxy?.status === 'inactive' ? 'inactive' : 'active'
  )
  const [error, setError] = React.useState('')

  const submit = async () => {
    const portNum = numOrUndef(port)
    if (!name.trim()) return setError(t('admin.proxies.nameRequired'))
    if (!host.trim()) return setError(t('admin.proxies.hostRequired'))
    if (!portNum || portNum < 1 || portNum > 65535) return setError(t('admin.proxies.portInvalid'))
    setError('')
    const expISO = fromLocalInput(expires)
    const common = {
      name: name.trim(),
      protocol,
      host: host.trim(),
      port: portNum,
      username: username.trim() || null,
      expires_at: expISO ? Math.floor(new Date(expISO).getTime() / 1000) : null,
      fallback_mode: fallback,
      backup_proxy_id: fallback === 'proxy' ? numOrNull(backup) : null,
      expiry_warn_days: numOrUndef(warnDays)
    }
    const ok = proxy
      ? await run(
          () => adminAPI.proxies.update(proxy.id, { ...common, status, ...(password ? { password } : {}) }),
          {
            success: t('admin.proxies.proxyUpdated'),
            fallback: t('admin.proxies.failedToUpdate')
          }
        )
      : await run(() => adminAPI.proxies.create({ ...common, password: password || null }), {
          success: t('admin.proxies.proxyCreated'),
          fallback: t('admin.proxies.failedToCreate')
        })
    if (ok) onSaved()
  }

  return (
    <AdminFormDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={proxy ? t('admin.proxies.editProxy') : t('admin.proxies.createProxy')}
      onSubmit={submit}
      submitting={busy}
      size="lg"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label={t('admin.proxies.name')} required error={error}>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('admin.proxies.enterProxyName')}
          />
        </FormField>
        <FormField label={t('admin.proxies.protocol')}>
          <NativeSelect value={protocol} onChange={(e) => setProtocol(e.target.value as ProxyProtocol)}>
            {PROTOCOLS.map((p) => (
              <option key={p} value={p}>
                {t(`admin.proxies.protocols.${p}`)}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField label={t('admin.proxies.host')} required>
          <Input
            value={host}
            onChange={(e) => setHost(e.target.value)}
            placeholder={t('admin.proxies.form.hostPlaceholder')}
          />
        </FormField>
        <FormField label={t('admin.proxies.port')} required>
          <Input
            type="number"
            min={1}
            max={65535}
            value={port}
            onChange={(e) => setPort(e.target.value)}
            placeholder={t('admin.proxies.form.portPlaceholder')}
          />
        </FormField>
        <FormField label={t('admin.proxies.username')}>
          <Input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="off" />
        </FormField>
        <FormField
          label={t('admin.proxies.password')}
          description={proxy ? t('admin.proxies.leaveEmptyToKeep') : undefined}
        >
          <PasswordInput
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
          />
        </FormField>
        <FormField label={t('admin.proxies.expiresAt')} description={t('admin.proxies.neverExpires')}>
          <Input type="datetime-local" value={expires} onChange={(e) => setExpires(e.target.value)} />
        </FormField>
        <FormField label={t('admin.proxies.expiryWarnDays')}>
          <Input type="number" min={0} value={warnDays} onChange={(e) => setWarnDays(e.target.value)} />
        </FormField>
        <FormField label={t('admin.proxies.fallbackMode')}>
          <NativeSelect value={fallback} onChange={(e) => setFallback(e.target.value as typeof fallback)}>
            <option value="none">{t('admin.proxies.fallbackNone')}</option>
            <option value="proxy">{t('admin.proxies.fallbackProxy')}</option>
            <option value="direct">{t('admin.proxies.fallbackDirect')}</option>
          </NativeSelect>
        </FormField>
        {fallback === 'proxy' ? (
          <FormField label={t('admin.proxies.backupProxy')}>
            <NativeSelect value={backup} onChange={(e) => setBackup(e.target.value)}>
              <option value="">{t('common.none')}</option>
              {all
                .filter((p) => p.id !== proxy?.id)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </NativeSelect>
          </FormField>
        ) : null}
        {proxy ? (
          <FormField label={t('admin.proxies.status')}>
            <NativeSelect value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
              <option value="active">{t('common.active')}</option>
              <option value="inactive">{t('common.inactive')}</option>
            </NativeSelect>
          </FormField>
        ) : null}
      </div>
    </AdminFormDialog>
  )
}

function BatchAddDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { busy, run } = useAdminAction()
  const [input, setInput] = React.useState('')
  const parsed = React.useMemo(() => parseBatchInput(input), [input])
  const submit = async () => {
    const res = await run(
      () =>
        adminAPI.proxies.batchCreate(
          parsed.proxies.map((p) => ({
            ...p,
            username: p.username || undefined,
            password: p.password || undefined
          }))
        ),
      { fallback: t('admin.proxies.failedToImport') }
    )
    if (!res) return
    if (res.created === 0)
      notifyError(new Error(t('admin.proxies.batchImportAllSkipped', { skipped: res.skipped })))
    else notifySuccess(t('admin.proxies.batchImportSuccess', { created: res.created, skipped: res.skipped }))
    onSaved()
  }
  return (
    <AdminFormDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={t('admin.proxies.batchAdd')}
      description={t('admin.proxies.batchInputHint')}
      onSubmit={submit}
      submitting={busy}
      submitDisabled={parsed.proxies.length === 0}
      submitText={t('admin.proxies.importProxies', { count: parsed.proxies.length })}
    >
      <FormField label={t('admin.proxies.batchInput')}>
        <Textarea
          rows={8}
          className="font-mono"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="socks5://user:pass@127.0.0.1:1080"
          spellCheck={false}
        />
      </FormField>
      <div className="flex flex-wrap gap-2 text-sm" aria-live="polite">
        <Badge variant="success">{t('admin.proxies.parsedCount', { count: parsed.proxies.length })}</Badge>
        {parsed.invalid > 0 ? (
          <Badge variant="destructive">{t('admin.proxies.invalidCount', { count: parsed.invalid })}</Badge>
        ) : null}
        {parsed.duplicate > 0 ? (
          <Badge variant="warning">{t('admin.proxies.duplicateCount', { count: parsed.duplicate })}</Badge>
        ) : null}
      </div>
    </AdminFormDialog>
  )
}

function ImportDataDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { busy, run } = useAdminAction()
  const [file, setFile] = React.useState<File | null>(null)
  const submit = async () => {
    if (!file) return notifyError(new Error(t('admin.proxies.dataImportSelectFile')))
    let data: AdminDataPayload
    try {
      data = JSON.parse(await file.text()) as AdminDataPayload
    } catch {
      return notifyError(new Error(t('admin.proxies.dataImportParseFailed')))
    }
    const res = await run(() => adminAPI.proxies.importData({ data }), {
      fallback: t('admin.proxies.dataImportFailed')
    })
    if (!res) return
    notifySuccess(t('admin.proxies.dataImportSuccess', { ...res }))
    onDone()
  }
  return (
    <AdminFormDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={t('admin.proxies.dataImportTitle')}
      description={t('admin.proxies.dataImportHint')}
      onSubmit={submit}
      submitting={busy}
      submitText={t('admin.proxies.dataImportButton')}
    >
      <FormField label={t('admin.proxies.dataImportFile')}>
        <input
          type="file"
          accept="application/json,.json"
          className="text-sm file:mr-3 file:rounded-md file:border file:bg-card file:px-3 file:py-1.5"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
      </FormField>
    </AdminFormDialog>
  )
}

function ProxyAccountsDialog({ proxy, onClose }: { proxy: Proxy; onClose: () => void }) {
  const q = useQuery({
    queryKey: ['admin', 'proxies', proxy.id, 'accounts'],
    queryFn: () => adminAPI.proxies.getProxyAccounts(proxy.id)
  })
  return (
    <AdminFormDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={t('admin.proxies.accountsTitle')}
      description={proxy.name}
    >
      {(q.data ?? []).length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          {q.isLoading ? t('common.loading') : t('admin.proxies.accountsEmpty')}
        </p>
      ) : (
        <ul className="divide-y rounded-md border text-sm">
          {(q.data ?? []).map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-3 px-3 py-2">
              <span className="truncate font-medium">{a.name}</span>
              <Badge variant="secondary">{a.platform}</Badge>
            </li>
          ))}
        </ul>
      )}
    </AdminFormDialog>
  )
}

export function ProxiesPage() {
  const locale = useLocale()
  const qc = useQueryClient()
  const stepUp = useStepUp()
  const { run, busy } = useAdminAction()
  const table = useTableState()
  const [search, setSearch] = React.useState('')
  const [protocol, setProtocol] = React.useState('')
  const [status, setStatus] = React.useState('')
  const [selection, setSelection] = React.useState<Record<string, boolean>>({})
  const [dlg, setDlg] = React.useState<Dlg>(null)
  const [testing, setTesting] = React.useState<Set<number>>(new Set())

  const filters = React.useMemo(
    () => ({
      protocol: protocol || undefined,
      status: (status || undefined) as 'active' | 'inactive' | 'expired' | undefined,
      search: search || undefined
    }),
    [protocol, status, search]
  )
  const query = useQuery({
    queryKey: ['admin', 'proxies', 'list', table.page, table.pageSize, filters],
    queryFn: ({ signal }) => adminAPI.proxies.list(table.page, table.pageSize, filters, { signal }),
    placeholderData: (p) => p
  })
  const all = useQuery({ queryKey: ['admin', 'proxies', 'all'], queryFn: () => adminAPI.proxies.getAll() })
  const refresh = () => qc.invalidateQueries({ queryKey: ['admin', 'proxies'] })

  const test = async (p: Proxy) => {
    setTesting((s) => new Set(s).add(p.id))
    const res = await run(() => adminAPI.proxies.testProxy(p.id), {
      fallback: t('admin.proxies.failedToTest')
    })
    setTesting((s) => {
      const n = new Set(s)
      n.delete(p.id)
      return n
    })
    if (!res) return
    if (res.success)
      notifySuccess(
        res.latency_ms
          ? t('admin.proxies.proxyWorkingWithLatency', { latency: res.latency_ms })
          : t('admin.proxies.proxyWorking')
      )
    else notifyError(new Error(res.message || t('admin.proxies.proxyTestFailed')))
    void refresh()
  }

  const quality = async (p: Proxy) => {
    const res = await run(() => adminAPI.proxies.checkProxyQuality(p.id), {
      fallback: t('admin.proxies.qualityCheckFailed')
    })
    if (res) {
      notifySuccess(
        t('admin.proxies.qualityCheckDone', {
          score: res.score,
          grade: res.grade,
          passed: res.passed_count ?? 0,
          warn: res.warn_count ?? 0,
          failed: res.failed_count ?? 0,
          challenge: res.challenge_count ?? 0
        })
      )
      void refresh()
    }
  }

  const exportData = async (ids: number[]) => {
    const data = await run(
      () =>
        adminAPI.proxies.exportData({
          ids: ids.length ? ids : undefined,
          filters: ids.length ? undefined : filters
        }),
      {
        fallback: t('admin.proxies.dataExportFailed'),
        stepUp
      }
    )
    if (!data) return
    saveAs(
      new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
      `sub2api-proxy-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
    )
    notifySuccess(t('admin.proxies.dataExported'))
  }

  const cols = React.useMemo<ColumnDef<Proxy, unknown>[]>(
    () => [
      {
        id: 'name',
        header: t('admin.proxies.columns.name'),
        enableSorting: false,
        cell: ({ row }) => <span className="font-medium">{row.original.name}</span>
      },
      {
        id: 'protocol',
        header: t('admin.proxies.columns.protocol'),
        enableSorting: false,
        cell: ({ row }) => <Badge variant="secondary">{row.original.protocol}</Badge>
      },
      {
        id: 'address',
        header: t('admin.proxies.columns.address'),
        enableSorting: false,
        cell: ({ row }) => (
          <code className="text-xs">
            {row.original.host}:{row.original.port}
          </code>
        )
      },
      {
        id: 'location',
        header: t('admin.proxies.columns.location'),
        enableSorting: false,
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {[row.original.country, row.original.city].filter(Boolean).join(' · ') || '—'}
          </span>
        )
      },
      {
        id: 'status',
        header: t('admin.proxies.columns.status'),
        enableSorting: false,
        cell: ({ row }) => (
          <StatusBadge
            status={
              row.original.status === 'active'
                ? 'success'
                : row.original.status === 'expired'
                  ? 'error'
                  : 'neutral'
            }
          >
            {row.original.status === 'expired'
              ? t('admin.proxies.expired')
              : row.original.status === 'active'
                ? t('common.active')
                : t('common.inactive')}
          </StatusBadge>
        )
      },
      {
        id: 'latency',
        header: t('admin.proxies.columns.latency'),
        enableSorting: false,
        cell: ({ row }) =>
          row.original.latency_status === 'failed' ? (
            <span className="text-destructive">{t('admin.proxies.latencyFailed')}</span>
          ) : row.original.latency_ms ? (
            <span className="tabular">{row.original.latency_ms} ms</span>
          ) : (
            '—'
          )
      },
      {
        id: 'accounts',
        header: t('admin.proxies.columns.accounts'),
        enableSorting: false,
        cell: ({ row }) => (
          <button
            type="button"
            className="tabular underline-offset-2 hover:underline"
            onClick={() => setDlg({ kind: 'accounts', proxy: row.original })}
          >
            {row.original.account_count ?? 0}
          </button>
        )
      },
      {
        id: 'expiry',
        header: t('admin.proxies.columns.expiry'),
        enableSorting: false,
        cell: ({ row }) => {
          const e = expiryLabel(row.original.expires_at)
          return (
            <StatusBadge
              status={e.tone}
              title={row.original.expires_at ? formatDateTime(row.original.expires_at) : undefined}
            >
              {e.text}
            </StatusBadge>
          )
        }
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">{t('admin.proxies.columns.actions')}</span>,
        enableSorting: false,
        cell: ({ row }) => {
          const p = row.original
          return (
            <RowActions
              actions={[
                {
                  key: 'test',
                  label: testing.has(p.id) ? t('admin.proxies.testing') : t('admin.proxies.testConnection'),
                  disabled: testing.has(p.id),
                  onSelect: () => void test(p)
                },
                { key: 'quality', label: t('admin.proxies.qualityCheck'), onSelect: () => void quality(p) },
                { key: 'edit', label: t('common.edit'), onSelect: () => setDlg({ kind: 'form', proxy: p }) },
                {
                  key: 'copy',
                  label: t('admin.proxies.copyProxyUrl'),
                  onSelect: async () => {
                    const auth = p.username
                      ? `${encodeURIComponent(p.username)}${p.password ? `:${encodeURIComponent(p.password)}` : ''}@`
                      : ''
                    await navigator.clipboard.writeText(`${p.protocol}://${auth}${p.host}:${p.port}`)
                    notifySuccess(t('admin.proxies.urlCopied'))
                  }
                },
                {
                  key: 'delete',
                  separator: true,
                  label: t('common.delete'),
                  destructive: true,
                  onSelect: () => setDlg({ kind: 'delete', proxy: p })
                }
              ]}
            />
          )
        }
      }
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 只依赖语言与测试中状态
    [locale, testing]
  )

  return (
    <div>
      <PageHeader
        title={t('admin.proxies.title')}
        description={t('admin.proxies.description')}
        actions={
          <>
            <Button variant="outline" aria-label={t('common.refresh')} onClick={() => void refresh()}>
              <RefreshCw className={query.isFetching ? 'animate-spin' : undefined} aria-hidden />
            </Button>
            <Button variant="outline" onClick={() => setDlg({ kind: 'import' })}>
              <Upload aria-hidden />
              <span className="hidden md:inline">{t('admin.proxies.dataImport')}</span>
            </Button>
            <Button variant="outline" onClick={() => void exportData([])}>
              <Download aria-hidden />
              <span className="hidden md:inline">{t('admin.proxies.dataExport')}</span>
            </Button>
            <Button variant="outline" onClick={() => setDlg({ kind: 'batch' })}>
              {t('admin.proxies.batchAdd')}
            </Button>
            <Button onClick={() => setDlg({ kind: 'form', proxy: null })}>
              <Plus aria-hidden />
              {t('admin.proxies.createProxy')}
            </Button>
          </>
        }
      />
      <FilterBar
        onReset={() => {
          setSearch('')
          setProtocol('')
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
          placeholder={t('admin.proxies.searchProxies')}
          containerClassName="w-full sm:w-72"
        />
        <FilterSelect
          label={t('admin.proxies.filters.protocol')}
          value={protocol}
          onChange={(v) => {
            setProtocol(v)
            table.setPage(1)
          }}
          options={[
            { value: '', label: t('admin.proxies.allProtocols') },
            ...PROTOCOLS.map((p) => ({ value: p, label: t(`admin.proxies.protocols.${p}`) }))
          ]}
        />
        <FilterSelect
          label={t('admin.proxies.filters.status')}
          value={status}
          onChange={(v) => {
            setStatus(v)
            table.setPage(1)
          }}
          options={[
            { value: '', label: t('admin.proxies.allStatus') },
            { value: 'active', label: t('common.active') },
            { value: 'inactive', label: t('common.inactive') },
            { value: 'expired', label: t('admin.proxies.expired') }
          ]}
        />
      </FilterBar>
      <DataTable
        columns={cols}
        data={query.data?.items ?? []}
        loading={query.isLoading}
        getRowId={(p) => String(p.id)}
        selectable
        rowSelection={selection}
        onRowSelectionChange={(u) => setSelection(typeof u === 'function' ? u(selection) : u)}
        pagination={table.pagination(query.data?.total ?? 0)}
        emptyTitle={t('admin.proxies.noProxiesYet')}
        emptyDescription={t('admin.proxies.createFirstProxy')}
        bulkActions={(selected) => (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => void exportData(selected.map((p) => p.id))}>
              {t('admin.proxies.dataExportSelected')}
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => setDlg({ kind: 'bulkDelete', ids: selected.map((p) => p.id) })}
            >
              {t('admin.proxies.batchDelete')}
            </Button>
          </div>
        )}
      />
      {dlg?.kind === 'form' ? (
        <ProxyFormDialog
          proxy={dlg.proxy}
          all={all.data ?? []}
          onClose={() => setDlg(null)}
          onSaved={() => {
            setDlg(null)
            void refresh()
          }}
        />
      ) : null}
      {dlg?.kind === 'batch' ? (
        <BatchAddDialog
          onClose={() => setDlg(null)}
          onSaved={() => {
            setDlg(null)
            void refresh()
          }}
        />
      ) : null}
      {dlg?.kind === 'import' ? (
        <ImportDataDialog
          onClose={() => setDlg(null)}
          onDone={() => {
            setDlg(null)
            void refresh()
          }}
        />
      ) : null}
      {dlg?.kind === 'accounts' ? (
        <ProxyAccountsDialog proxy={dlg.proxy} onClose={() => setDlg(null)} />
      ) : null}
      <ConfirmDialog
        open={dlg?.kind === 'delete'}
        onOpenChange={(o) => !o && setDlg(null)}
        title={t('admin.proxies.deleteProxy')}
        description={
          dlg?.kind === 'delete' ? t('admin.proxies.deleteConfirm', { name: dlg.proxy.name }) : undefined
        }
        destructive
        confirmText={t('common.delete')}
        loading={busy}
        onConfirm={async () => {
          if (dlg?.kind !== 'delete') return
          const p = dlg.proxy
          const ok = await run(() => adminAPI.proxies.delete(p.id), {
            success: t('admin.proxies.proxyDeleted'),
            fallback: t('admin.proxies.failedToDelete')
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
        title={t('admin.proxies.batchDelete')}
        description={
          dlg?.kind === 'bulkDelete'
            ? t('admin.proxies.batchDeleteConfirm', { count: dlg.ids.length })
            : undefined
        }
        destructive
        confirmText={t('common.delete')}
        loading={busy}
        onConfirm={async () => {
          if (dlg?.kind !== 'bulkDelete') return
          const res = await run(() => adminAPI.proxies.batchDelete(dlg.ids), {
            fallback: t('admin.proxies.batchDeleteFailed')
          })
          if (res) {
            notifySuccess(
              t('admin.proxies.batchDeleteDone', {
                deleted: res.deleted_ids.length,
                skipped: res.skipped.length
              })
            )
            setSelection({})
            setDlg(null)
            void refresh()
          }
        }}
      />
      <TotpStepUpDialog controller={stepUp} />
    </div>
  )
}
