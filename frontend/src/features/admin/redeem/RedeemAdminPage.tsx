/** /admin/redeem：兑换码管理（统计 / 列表 / 生成 / 批量更新与删除 / 禁用启用 / 导出 CSV）。 */
import * as React from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { saveAs } from 'file-saver'
import { Download, Plus, RefreshCw } from 'lucide-react'
import { adminAPI } from '@/api/admin'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { CopyButton } from '@/components/CopyButton'
import { DataTable } from '@/components/DataTable'
import { FormField } from '@/components/FormField'
import { NativeSelect } from '@/components/NativeSelect'
import { PageHeader } from '@/components/PageHeader'
import { SearchInput } from '@/components/SearchInput'
import { StatCard } from '@/components/StatCard'
import { StatusBadge } from '@/components/StatusBadge'
import { Button } from '@/components/ui/button'
import { Input, Textarea } from '@/components/ui/input'
import { AdminFormDialog } from '@/features/admin/common/AdminFormDialog'
import { FilterBar, FilterSelect } from '@/features/admin/common/FilterBar'
import { fromLocalInput, numOrUndef } from '@/features/admin/common/fieldUtils'
import { notifySuccess } from '@/features/admin/common/notify'
import { RowActions } from '@/features/admin/common/RowActions'
import { useAdminAction } from '@/features/admin/common/useAdminAction'
import { useTableState } from '@/features/admin/common/useTableState'
import { t } from '@/i18n'
import { useLocale } from '@/i18n/react'
import type { RedeemCode, RedeemCodeType } from '@/types'
import { formatDateTime } from '@/utils/format'

const TYPES: RedeemCodeType[] = ['balance', 'concurrency', 'subscription', 'invitation']
const STATUSES = ['unused', 'used', 'expired', 'disabled'] as const
type RedeemStatus = (typeof STATUSES)[number]

const TONE: Record<string, 'success' | 'neutral' | 'warning' | 'error'> = {
  unused: 'success',
  active: 'success',
  used: 'neutral',
  expired: 'warning',
  disabled: 'error'
}

function GenerateDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { busy, run } = useAdminAction()
  const groups = useQuery({
    queryKey: ['admin', 'groups', 'all-including-inactive'],
    queryFn: () => adminAPI.groups.getAllIncludingInactive()
  })
  const [type, setType] = React.useState<RedeemCodeType>('balance')
  const [value, setValue] = React.useState('10')
  const [count, setCount] = React.useState('1')
  const [groupId, setGroupId] = React.useState('')
  const [validity, setValidity] = React.useState('30')
  const [expiresDays, setExpiresDays] = React.useState('')
  const [error, setError] = React.useState('')
  const [result, setResult] = React.useState<RedeemCode[] | null>(null)

  const subGroups = (groups.data ?? []).filter((g) => g.subscription_type === 'subscription')
  const submit = async () => {
    const countNum = numOrUndef(count)
    const valueNum = type === 'invitation' ? 0 : numOrUndef(value)
    if (!countNum || countNum < 1 || countNum > 1000) return setError(t('admin.redeem.form.countHint'))
    if (type !== 'invitation' && (valueNum === undefined || valueNum <= 0))
      return setError(t('admin.redeem.form.valuePlaceholder'))
    if (type === 'subscription' && !groupId) return setError(t('admin.redeem.groupRequired'))
    setError('')
    const codes = await run(
      () =>
        adminAPI.redeem.generate(
          countNum,
          type,
          valueNum ?? 0,
          type === 'subscription' ? Number(groupId) : null,
          type === 'subscription' ? numOrUndef(validity) : undefined,
          numOrUndef(expiresDays) ?? null
        ),
      { fallback: t('admin.redeem.failedToGenerate') }
    )
    if (codes) {
      setResult(codes)
      onDone()
    }
  }

  const text = (result ?? []).map((c) => c.code).join('\n')
  return (
    <AdminFormDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={result ? t('admin.redeem.generatedSuccessfully') : t('admin.redeem.generateCodesTitle')}
      onSubmit={result ? undefined : submit}
      submitting={busy}
      submitText={t('admin.redeem.generate')}
      footerExtra={
        result ? (
          <div className="flex gap-2">
            <CopyButton value={text} size="default" variant="outline">
              {t('admin.redeem.copyAll')}
            </CopyButton>
            <Button
              type="button"
              variant="outline"
              onClick={() => saveAs(new Blob([text], { type: 'text/plain' }), 'redeem-codes.txt')}
            >
              {t('admin.redeem.download')}
            </Button>
          </div>
        ) : null
      }
    >
      {result ? (
        <>
          <p className="text-sm text-muted-foreground">
            {t('admin.redeem.codesCreated', { count: result.length })}
          </p>
          <Textarea
            readOnly
            rows={8}
            className="font-mono"
            value={text}
            onFocus={(e) => e.currentTarget.select()}
          />
        </>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label={t('admin.redeem.form.typeLabel')} error={error}>
            <NativeSelect value={type} onChange={(e) => setType(e.target.value as RedeemCodeType)}>
              {TYPES.map((x) => (
                <option key={x} value={x}>
                  {t(`admin.redeem.types.${x}`)}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <FormField label={t('admin.redeem.form.countLabel')} description={t('admin.redeem.form.countHint')}>
            <Input
              type="number"
              min={1}
              max={1000}
              value={count}
              onChange={(e) => setCount(e.target.value)}
            />
          </FormField>
          {type !== 'invitation' ? (
            <FormField
              label={type === 'balance' ? t('admin.redeem.amount') : t('admin.redeem.value')}
              description={
                type === 'balance'
                  ? t('admin.redeem.form.balanceHint')
                  : type === 'concurrency'
                    ? t('admin.redeem.form.concurrencyHint')
                    : undefined
              }
            >
              <Input
                type="number"
                min={0}
                step="0.01"
                value={value}
                onChange={(e) => setValue(e.target.value)}
              />
            </FormField>
          ) : (
            <p className="self-end text-sm text-muted-foreground">{t('admin.redeem.invitationHint')}</p>
          )}
          {type === 'subscription' ? (
            <>
              <FormField label={t('admin.redeem.selectGroup')}>
                <NativeSelect value={groupId} onChange={(e) => setGroupId(e.target.value)}>
                  <option value="">{t('admin.redeem.selectGroupPlaceholder')}</option>
                  {subGroups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </NativeSelect>
              </FormField>
              <FormField label={t('admin.redeem.validityDays')}>
                <Input type="number" min={1} value={validity} onChange={(e) => setValidity(e.target.value)} />
              </FormField>
            </>
          ) : null}
          <FormField label={t('admin.redeem.codeExpiry')} description={t('admin.redeem.neverExpires')}>
            <Input
              type="number"
              min={1}
              value={expiresDays}
              onChange={(e) => setExpiresDays(e.target.value)}
              placeholder={t('admin.redeem.customExpiryDays')}
            />
          </FormField>
        </div>
      )}
    </AdminFormDialog>
  )
}

function BatchUpdateDialog({
  ids,
  onClose,
  onDone
}: {
  ids: number[]
  onClose: () => void
  onDone: () => void
}) {
  const { busy, run } = useAdminAction()
  const [status, setStatus] = React.useState('')
  const [expires, setExpires] = React.useState('')
  const [notes, setNotes] = React.useState('')
  const submit = async () => {
    const fields: Record<string, unknown> = {}
    if (status) fields.status = status
    if (expires) fields.expires_at = fromLocalInput(expires)
    if (notes.trim()) fields.notes = notes.trim()
    if (Object.keys(fields).length === 0) {
      notifySuccess(t('admin.redeem.noBatchFieldsSelected'))
      return
    }
    const res = await run(() => adminAPI.redeem.batchUpdate(ids, fields), {
      fallback: t('admin.redeem.failedToBatchUpdate')
    })
    if (res) {
      notifySuccess(t('admin.redeem.batchUpdateSuccess', { count: res.updated }))
      onDone()
    }
  }
  return (
    <AdminFormDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={t('admin.redeem.batchUpdateTitle')}
      description={t('admin.redeem.selectedCount', { count: ids.length })}
      onSubmit={submit}
      submitting={busy}
    >
      <FormField label={t('admin.redeem.batchFields.status')}>
        <NativeSelect value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">—</option>
          <option value="unused">{t('admin.redeem.status.unused')}</option>
          <option value="disabled">{t('admin.redeem.status.disabled')}</option>
        </NativeSelect>
      </FormField>
      <FormField
        label={t('admin.redeem.batchFields.expiresAt')}
        description={t('admin.redeem.localTimeZoneHint')}
      >
        <Input type="datetime-local" value={expires} onChange={(e) => setExpires(e.target.value)} />
      </FormField>
      <FormField label={t('admin.redeem.batchFields.notes')}>
        <Input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder={t('admin.redeem.batchNotesPlaceholder')}
        />
      </FormField>
    </AdminFormDialog>
  )
}

type Dlg =
  | { kind: 'generate' }
  | { kind: 'batch'; ids: number[] }
  | { kind: 'delete'; code: RedeemCode }
  | { kind: 'bulkDelete'; ids: number[] }
  | null

export function RedeemAdminPage() {
  const locale = useLocale()
  const qc = useQueryClient()
  const { busy, run } = useAdminAction()
  const table = useTableState()
  const [search, setSearch] = React.useState('')
  const [type, setType] = React.useState('')
  const [status, setStatus] = React.useState('')
  const [selection, setSelection] = React.useState<Record<string, boolean>>({})
  const [dlg, setDlg] = React.useState<Dlg>(null)

  const filters = React.useMemo(
    () => ({
      type: (type || undefined) as RedeemCodeType | undefined,
      status: (status || undefined) as RedeemStatus | undefined,
      search: search || undefined
    }),
    [type, status, search]
  )
  const query = useQuery({
    queryKey: ['admin', 'redeem', 'list', table.page, table.pageSize, filters],
    queryFn: ({ signal }) => adminAPI.redeem.list(table.page, table.pageSize, filters, { signal }),
    placeholderData: (p) => p
  })
  const stats = useQuery({
    queryKey: ['admin', 'redeem', 'stats'],
    queryFn: () => adminAPI.redeem.getStats()
  })
  const refresh = () => qc.invalidateQueries({ queryKey: ['admin', 'redeem'] })

  const cols = React.useMemo<ColumnDef<RedeemCode, unknown>[]>(
    () => [
      {
        id: 'code',
        header: t('admin.redeem.columns.code'),
        cell: ({ row }) => (
          <span className="inline-flex items-center gap-1.5">
            <code className="text-xs">{row.original.code}</code>
            <CopyButton value={row.original.code} className="size-7" />
          </span>
        )
      },
      {
        id: 'type',
        header: t('admin.redeem.columns.type'),
        cell: ({ row }) => t(`admin.redeem.types.${row.original.type}`)
      },
      {
        id: 'value',
        header: t('admin.redeem.columns.value'),
        cell: ({ row }) => (
          <span className="tabular">
            {row.original.type === 'balance'
              ? `$${row.original.value.toFixed(2)}`
              : row.original.type === 'subscription'
                ? `${row.original.validity_days ?? 0}${t('admin.redeem.days')} · ${row.original.group?.name ?? `#${row.original.group_id}`}`
                : row.original.type === 'invitation'
                  ? '—'
                  : row.original.value}
          </span>
        )
      },
      {
        id: 'status',
        header: t('admin.redeem.columns.status'),
        cell: ({ row }) => (
          <StatusBadge status={TONE[row.original.status] ?? 'neutral'}>
            {t(`admin.redeem.status.${row.original.status === 'active' ? 'unused' : row.original.status}`)}
          </StatusBadge>
        )
      },
      {
        id: 'usedBy',
        header: t('admin.redeem.columns.usedBy'),
        cell: ({ row }) =>
          row.original.user?.email ??
          (row.original.used_by ? t('admin.redeem.userPrefix', { id: row.original.used_by }) : '—')
      },
      {
        id: 'expiresAt',
        header: t('admin.redeem.columns.expiresAt'),
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {row.original.expires_at
              ? formatDateTime(row.original.expires_at)
              : t('admin.redeem.neverExpires')}
          </span>
        )
      },
      {
        id: 'createdAt',
        header: t('admin.redeem.columns.createdAt'),
        cell: ({ row }) => (
          <span className="text-muted-foreground">{formatDateTime(row.original.created_at)}</span>
        )
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">{t('admin.redeem.columns.actions')}</span>,
        cell: ({ row }) => {
          const c = row.original
          const used = c.status === 'used'
          return (
            <RowActions
              actions={[
                {
                  key: 'toggle',
                  label:
                    c.status === 'disabled' ? t('admin.redeem.enableCode') : t('admin.redeem.disableCode'),
                  hidden: used || c.status === 'expired',
                  onSelect: async () => {
                    const ok = await run(
                      () =>
                        adminAPI.redeem.batchUpdate([c.id], {
                          status: c.status === 'disabled' ? 'unused' : 'disabled'
                        }),
                      {
                        success:
                          c.status === 'disabled'
                            ? t('admin.redeem.codeEnabledSuccess')
                            : t('admin.redeem.codeDisabledSuccess'),
                        fallback: t('admin.redeem.failedToUpdate')
                      }
                    )
                    if (ok) void refresh()
                  }
                },
                {
                  key: 'delete',
                  label: t('admin.redeem.deleteCode'),
                  destructive: true,
                  onSelect: () => setDlg({ kind: 'delete', code: c })
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

  const exportCsv = async () => {
    const blob = await run(
      () => adminAPI.redeem.exportCodes(filters as Parameters<typeof adminAPI.redeem.exportCodes>[0]),
      { fallback: t('admin.redeem.failedToExport') }
    )
    if (blob) {
      saveAs(blob, `redeem-codes-${new Date().toISOString().slice(0, 10)}.csv`)
      notifySuccess(t('admin.redeem.codesExported'))
    }
  }

  const s = stats.data
  return (
    <div>
      <PageHeader
        title={t('admin.redeem.title')}
        description={t('admin.redeem.description')}
        actions={
          <>
            <Button variant="outline" aria-label={t('common.refresh')} onClick={() => void refresh()}>
              <RefreshCw className={query.isFetching ? 'animate-spin' : undefined} aria-hidden />
            </Button>
            <Button variant="outline" onClick={() => void exportCsv()}>
              <Download aria-hidden />
              <span className="hidden md:inline">{t('admin.redeem.exportCsv')}</span>
            </Button>
            <Button onClick={() => setDlg({ kind: 'generate' })}>
              <Plus aria-hidden />
              {t('admin.redeem.generateCodes')}
            </Button>
          </>
        }
      />
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label={t('admin.redeem.status.unused')}
          value={s?.active_codes ?? 0}
          loading={stats.isLoading}
        />
        <StatCard
          label={t('admin.redeem.status.used')}
          value={s?.used_codes ?? 0}
          loading={stats.isLoading}
        />
        <StatCard
          label={t('admin.redeem.status.expired')}
          value={s?.expired_codes ?? 0}
          loading={stats.isLoading}
        />
        <StatCard
          label={t('admin.redeem.columns.value')}
          value={`$${(s?.total_value_distributed ?? 0).toFixed(2)}`}
          loading={stats.isLoading}
        />
      </div>
      <FilterBar
        onReset={() => {
          setSearch('')
          setType('')
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
          placeholder={t('admin.redeem.searchCodes')}
          containerClassName="w-full sm:w-72"
        />
        <FilterSelect
          label={t('admin.redeem.filters.type')}
          value={type}
          onChange={(v) => {
            setType(v)
            table.setPage(1)
          }}
          options={[
            { value: '', label: t('admin.redeem.allTypes') },
            ...TYPES.map((x) => ({ value: x, label: t(`admin.redeem.types.${x}`) }))
          ]}
        />
        <FilterSelect
          label={t('admin.redeem.filters.status')}
          value={status}
          onChange={(v) => {
            setStatus(v)
            table.setPage(1)
          }}
          options={[
            { value: '', label: t('admin.redeem.allStatus') },
            ...STATUSES.map((x) => ({ value: x, label: t(`admin.redeem.status.${x}`) }))
          ]}
        />
      </FilterBar>
      <DataTable
        columns={cols}
        data={query.data?.items ?? []}
        loading={query.isLoading}
        getRowId={(c) => String(c.id)}
        selectable
        rowSelection={selection}
        onRowSelectionChange={(u) => setSelection(typeof u === 'function' ? u(selection) : u)}
        pagination={table.pagination(query.data?.total ?? 0)}
        emptyTitle={t('admin.redeem.noCodes')}
        emptyDescription={t('admin.redeem.noCodesDescription')}
        bulkActions={(selected) => (
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setDlg({ kind: 'batch', ids: selected.map((c) => c.id) })}
            >
              {t('admin.redeem.batchUpdate')}
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => setDlg({ kind: 'bulkDelete', ids: selected.map((c) => c.id) })}
            >
              {t('admin.redeem.deleteCode')}
            </Button>
          </div>
        )}
      />
      {dlg?.kind === 'generate' ? (
        <GenerateDialog onClose={() => setDlg(null)} onDone={() => void refresh()} />
      ) : null}
      {dlg?.kind === 'batch' ? (
        <BatchUpdateDialog
          ids={dlg.ids}
          onClose={() => setDlg(null)}
          onDone={() => {
            setDlg(null)
            setSelection({})
            void refresh()
          }}
        />
      ) : null}
      <ConfirmDialog
        open={dlg?.kind === 'delete'}
        onOpenChange={(o) => !o && setDlg(null)}
        title={t('admin.redeem.deleteCode')}
        description={t('admin.redeem.deleteCodeConfirm')}
        destructive
        confirmText={t('common.delete')}
        loading={busy}
        onConfirm={async () => {
          if (dlg?.kind !== 'delete') return
          const c = dlg.code
          const ok = await run(() => adminAPI.redeem.delete(c.id), {
            success: t('admin.redeem.codeDeleted'),
            fallback: t('admin.redeem.failedToDelete')
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
        title={t('admin.redeem.deleteCode')}
        description={
          dlg?.kind === 'bulkDelete' ? t('admin.redeem.selectedCount', { count: dlg.ids.length }) : undefined
        }
        destructive
        confirmText={t('common.delete')}
        loading={busy}
        onConfirm={async () => {
          if (dlg?.kind !== 'bulkDelete') return
          const res = await run(() => adminAPI.redeem.batchDelete(dlg.ids), {
            fallback: t('admin.redeem.failedToDelete')
          })
          if (res) {
            notifySuccess(t('admin.redeem.codesDeleted', { count: res.deleted }))
            setSelection({})
            setDlg(null)
            void refresh()
          }
        }}
      />
    </div>
  )
}
