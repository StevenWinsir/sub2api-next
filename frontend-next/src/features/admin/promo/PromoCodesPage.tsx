/** /admin/promo-codes：优惠码管理（列表 / 创建编辑 / 使用记录 / 注册链接复制）。 */
import * as React from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { Plus, RefreshCw } from 'lucide-react'
import { adminAPI } from '@/api/admin'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { CopyButton } from '@/components/CopyButton'
import { DataTable } from '@/components/DataTable'
import { FormField } from '@/components/FormField'
import { NativeSelect } from '@/components/NativeSelect'
import { PageHeader } from '@/components/PageHeader'
import { SearchInput } from '@/components/SearchInput'
import { StatusBadge } from '@/components/StatusBadge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Pagination } from '@/components/ui/pagination'
import { AdminFormDialog } from '@/features/admin/common/AdminFormDialog'
import { FilterBar, FilterSelect } from '@/features/admin/common/FilterBar'
import { fromLocalInput, numOrUndef, str, toLocalInput } from '@/features/admin/common/fieldUtils'
import { notifySuccess } from '@/features/admin/common/notify'
import { RowActions } from '@/features/admin/common/RowActions'
import { useAdminAction } from '@/features/admin/common/useAdminAction'
import { useTableState } from '@/features/admin/common/useTableState'
import { t } from '@/i18n'
import { useLocale } from '@/i18n/react'
import type { PromoCode } from '@/types'
import { formatDateTime } from '@/utils/format'

/** 展示状态：已过期 / 已用尽优先于启用 / 禁用。 */
export function promoDisplayStatus(
  c: Pick<PromoCode, 'status' | 'expires_at' | 'max_uses' | 'used_count'>,
  now = Date.now()
): 'active' | 'disabled' | 'expired' | 'maxUsed' {
  if (c.expires_at && new Date(c.expires_at).getTime() <= now) return 'expired'
  if (c.max_uses > 0 && c.used_count >= c.max_uses) return 'maxUsed'
  return c.status
}

const TONE = { active: 'success', disabled: 'neutral', expired: 'warning', maxUsed: 'warning' } as const
const LABEL = {
  active: 'statusActive',
  disabled: 'statusDisabled',
  expired: 'statusExpired',
  maxUsed: 'statusMaxUsed'
} as const

function PromoFormDialog({
  code,
  onClose,
  onSaved
}: {
  code: PromoCode | null
  onClose: () => void
  onSaved: () => void
}) {
  const { busy, run } = useAdminAction()
  const [value, setValue] = React.useState(code?.code ?? '')
  const [bonus, setBonus] = React.useState(str(code?.bonus_amount ?? 5))
  const [maxUses, setMaxUses] = React.useState(str(code?.max_uses ?? 0))
  const [expires, setExpires] = React.useState(toLocalInput(code?.expires_at))
  const [notes, setNotes] = React.useState(code?.notes ?? '')
  const [status, setStatus] = React.useState<'active' | 'disabled'>(code?.status ?? 'active')
  const [error, setError] = React.useState('')

  const submit = async () => {
    const bonusNum = numOrUndef(bonus)
    if (bonusNum === undefined || bonusNum <= 0) return setError(t('admin.promo.bonusAmount'))
    setError('')
    const iso = fromLocalInput(expires)
    const expSec = iso ? Math.floor(new Date(iso).getTime() / 1000) : null
    const common = {
      bonus_amount: bonusNum,
      max_uses: numOrUndef(maxUses) ?? 0,
      expires_at: expSec,
      notes: notes.trim()
    }
    const ok = code
      ? await run(
          () => adminAPI.promo.update(code.id, { ...common, code: value.trim() || undefined, status }),
          {
            success: t('admin.promo.codeUpdated'),
            fallback: t('admin.promo.failedToUpdate')
          }
        )
      : await run(() => adminAPI.promo.create({ ...common, code: value.trim() || undefined }), {
          success: t('admin.promo.codeCreated'),
          fallback: t('admin.promo.failedToCreate')
        })
    if (ok) onSaved()
  }

  return (
    <AdminFormDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={code ? t('admin.promo.editCode') : t('admin.promo.createCode')}
      onSubmit={submit}
      submitting={busy}
    >
      <FormField label={t('admin.promo.code')} description={code ? undefined : t('admin.promo.autoGenerate')}>
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={t('admin.promo.codePlaceholder')}
          autoComplete="off"
        />
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label={t('admin.promo.bonusAmount')} error={error} required>
          <Input type="number" min={0} step="0.01" value={bonus} onChange={(e) => setBonus(e.target.value)} />
        </FormField>
        <FormField label={t('admin.promo.maxUses')} description={t('admin.promo.zeroUnlimited')}>
          <Input type="number" min={0} value={maxUses} onChange={(e) => setMaxUses(e.target.value)} />
        </FormField>
        <FormField label={t('admin.promo.expiresAt')} description={t('admin.promo.neverExpires')}>
          <Input type="datetime-local" value={expires} onChange={(e) => setExpires(e.target.value)} />
        </FormField>
        {code ? (
          <FormField label={t('admin.promo.status')}>
            <NativeSelect value={status} onChange={(e) => setStatus(e.target.value as 'active' | 'disabled')}>
              <option value="active">{t('admin.promo.statusActive')}</option>
              <option value="disabled">{t('admin.promo.statusDisabled')}</option>
            </NativeSelect>
          </FormField>
        ) : null}
      </div>
      <FormField label={t('admin.promo.notes')}>
        <Input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder={t('admin.promo.notesPlaceholder')}
        />
      </FormField>
    </AdminFormDialog>
  )
}

function UsagesDialog({ code, onClose }: { code: PromoCode; onClose: () => void }) {
  const [page, setPage] = React.useState(1)
  const q = useQuery({
    queryKey: ['admin', 'promo', code.id, 'usages', page],
    queryFn: () => adminAPI.promo.getUsages(code.id, page, 10),
    placeholderData: (p) => p
  })
  const items = q.data?.items ?? []
  return (
    <AdminFormDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={t('admin.promo.usageRecords')}
      description={code.code}
    >
      {items.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          {q.isLoading ? t('common.loading') : t('admin.promo.noUsages')}
        </p>
      ) : (
        <ul className="divide-y rounded-md border text-sm">
          {items.map((u) => (
            <li key={u.id} className="flex items-center justify-between gap-3 px-3 py-2">
              <span className="truncate">
                {u.user?.email ?? t('admin.promo.userPrefix', { id: u.user_id })}
              </span>
              <span className="tabular text-muted-foreground">
                +${u.bonus_amount.toFixed(2)} · {formatDateTime(u.used_at)}
              </span>
            </li>
          ))}
        </ul>
      )}
      <Pagination
        page={page}
        pageCount={Math.max(1, Math.ceil((q.data?.total ?? 0) / 10))}
        onPageChange={setPage}
      />
    </AdminFormDialog>
  )
}

type Dlg =
  | { kind: 'form'; code: PromoCode | null }
  | { kind: 'usages'; code: PromoCode }
  | { kind: 'delete'; code: PromoCode }
  | null

export function PromoCodesPage() {
  const locale = useLocale()
  const qc = useQueryClient()
  const { busy, run } = useAdminAction()
  const table = useTableState()
  const [search, setSearch] = React.useState('')
  const [status, setStatus] = React.useState('')
  const [dlg, setDlg] = React.useState<Dlg>(null)

  const filters = React.useMemo(
    () => ({ status: status || undefined, search: search || undefined }),
    [status, search]
  )
  const query = useQuery({
    queryKey: ['admin', 'promo', 'list', table.page, table.pageSize, filters],
    queryFn: ({ signal }) => adminAPI.promo.list(table.page, table.pageSize, filters, { signal }),
    placeholderData: (p) => p
  })
  const refresh = () => qc.invalidateQueries({ queryKey: ['admin', 'promo'] })

  const cols = React.useMemo<ColumnDef<PromoCode, unknown>[]>(
    () => [
      {
        id: 'code',
        header: t('admin.promo.columns.code'),
        cell: ({ row }) => (
          <span className="inline-flex items-center gap-1.5">
            <code className="text-xs">{row.original.code}</code>
            <CopyButton value={row.original.code} className="size-7" />
          </span>
        )
      },
      {
        id: 'bonus',
        header: t('admin.promo.columns.bonusAmount'),
        cell: ({ row }) => <span className="tabular">${row.original.bonus_amount.toFixed(2)}</span>
      },
      {
        id: 'usage',
        header: t('admin.promo.columns.usage'),
        cell: ({ row }) => (
          <span className="tabular">
            {row.original.used_count} / {row.original.max_uses > 0 ? row.original.max_uses : '∞'}
          </span>
        )
      },
      {
        id: 'status',
        header: t('admin.promo.columns.status'),
        cell: ({ row }) => {
          const s = promoDisplayStatus(row.original)
          return <StatusBadge status={TONE[s]}>{t(`admin.promo.${LABEL[s]}`)}</StatusBadge>
        }
      },
      {
        id: 'expires',
        header: t('admin.promo.columns.expiresAt'),
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {row.original.expires_at
              ? formatDateTime(row.original.expires_at)
              : t('admin.promo.neverExpires')}
          </span>
        )
      },
      {
        id: 'created',
        header: t('admin.promo.columns.createdAt'),
        cell: ({ row }) => (
          <span className="text-muted-foreground">{formatDateTime(row.original.created_at)}</span>
        )
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">{t('admin.promo.columns.actions')}</span>,
        cell: ({ row }) => {
          const c = row.original
          return (
            <RowActions
              actions={[
                { key: 'edit', label: t('common.edit'), onSelect: () => setDlg({ kind: 'form', code: c }) },
                {
                  key: 'usages',
                  label: t('admin.promo.viewUsages'),
                  onSelect: () => setDlg({ kind: 'usages', code: c })
                },
                {
                  key: 'link',
                  label: t('admin.promo.copyRegisterLink'),
                  onSelect: async () => {
                    await navigator.clipboard.writeText(
                      `${window.location.origin}/register?promo=${encodeURIComponent(c.code)}`
                    )
                    notifySuccess(t('admin.promo.registerLinkCopied'))
                  }
                },
                {
                  key: 'delete',
                  separator: true,
                  label: t('common.delete'),
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

  return (
    <div>
      <PageHeader
        title={t('admin.promo.title')}
        description={t('admin.promo.description')}
        actions={
          <>
            <Button variant="outline" aria-label={t('common.refresh')} onClick={() => void refresh()}>
              <RefreshCw className={query.isFetching ? 'animate-spin' : undefined} aria-hidden />
            </Button>
            <Button onClick={() => setDlg({ kind: 'form', code: null })}>
              <Plus aria-hidden />
              {t('admin.promo.createCode')}
            </Button>
          </>
        }
      />
      <FilterBar
        onReset={() => {
          setSearch('')
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
          placeholder={t('admin.promo.searchCodes')}
          containerClassName="w-full sm:w-72"
        />
        <FilterSelect
          label={t('admin.promo.status')}
          value={status}
          onChange={(v) => {
            setStatus(v)
            table.setPage(1)
          }}
          options={[
            { value: '', label: t('admin.promo.allStatus') },
            { value: 'active', label: t('admin.promo.statusActive') },
            { value: 'disabled', label: t('admin.promo.statusDisabled') }
          ]}
        />
      </FilterBar>
      <DataTable
        columns={cols}
        data={query.data?.items ?? []}
        loading={query.isLoading}
        getRowId={(c) => String(c.id)}
        pagination={table.pagination(query.data?.total ?? 0)}
        emptyTitle={t('admin.promo.noCodesYet')}
        emptyDescription={t('admin.promo.createFirstCode')}
      />
      {dlg?.kind === 'form' ? (
        <PromoFormDialog
          code={dlg.code}
          onClose={() => setDlg(null)}
          onSaved={() => {
            setDlg(null)
            void refresh()
          }}
        />
      ) : null}
      {dlg?.kind === 'usages' ? <UsagesDialog code={dlg.code} onClose={() => setDlg(null)} /> : null}
      <ConfirmDialog
        open={dlg?.kind === 'delete'}
        onOpenChange={(o) => !o && setDlg(null)}
        title={t('admin.promo.deleteCode')}
        description={t('admin.promo.deleteCodeConfirm')}
        destructive
        confirmText={t('common.delete')}
        loading={busy}
        onConfirm={async () => {
          if (dlg?.kind !== 'delete') return
          const c = dlg.code
          const ok = await run(() => adminAPI.promo.delete(c.id), {
            success: t('admin.promo.codeDeleted'),
            fallback: t('admin.promo.failedToDelete')
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
