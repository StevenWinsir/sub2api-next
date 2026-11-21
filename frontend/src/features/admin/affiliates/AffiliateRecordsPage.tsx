/** /admin/affiliates/{invites,rebates,transfers}：邀请 / 返利 / 提取流水（同一张记录表，按 kind 切换列）与线下提现登记。 */
import * as React from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { ColumnDef, SortingState } from '@tanstack/react-table'
import { HandCoins, RefreshCw } from 'lucide-react'
import { adminAPI } from '@/api/admin'
import type {
  AffiliateInviteRecord,
  AffiliateRebateRecord,
  AffiliateTransferRecord
} from '@/api/admin/affiliates'
import { DataTable } from '@/components/DataTable'
import { DateRangeBar, type DateStrRange } from '@/components/DateRangeBar'
import { FormField } from '@/components/FormField'
import { PageHeader } from '@/components/PageHeader'
import { SearchInput } from '@/components/SearchInput'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AdminFormDialog } from '@/features/admin/common/AdminFormDialog'
import { FilterBar } from '@/features/admin/common/FilterBar'
import { money, numOrUndef } from '@/features/admin/common/fieldUtils'
import { notifySuccess } from '@/features/admin/common/notify'
import { useTableState } from '@/features/admin/common/useTableState'
import { useAppStore } from '@/stores/app'
import type { PaginatedResponse } from '@/types'
import { extractApiErrorCode, extractApiErrorMessage } from '@/utils/apiError'
import { t } from '@/i18n'
import { useLocale } from '@/i18n/react'
import { formatDateTime, getBrowserTimeZone } from '@/utils/format'

export type AffiliateKind = 'invites' | 'rebates' | 'transfers'

const IDEMPOTENCY_PREFIX = 'sub2api:admin:affiliate-withdraw:'

/** 同一用户 + 金额复用同一幂等键：上次提交结果未知（网络中断）时重试不会重复扣减。 */
export function withdrawIdempotencyKey(userId: number, amount: number): string {
  const slot = `${IDEMPOTENCY_PREFIX}${userId}:${amount}`
  try {
    const existing = window.sessionStorage.getItem(slot)
    if (existing) return existing
    const key = `affiliate-withdraw-${userId}-${crypto.randomUUID()}`
    window.sessionStorage.setItem(slot, key)
    return key
  } catch {
    return `affiliate-withdraw-${userId}-${crypto.randomUUID()}`
  }
}

export function clearWithdrawIdempotencyKey(userId: number, amount: number): void {
  try {
    window.sessionStorage.removeItem(`${IDEMPOTENCY_PREFIX}${userId}:${amount}`)
  } catch {
    /* 忽略 */
  }
}

function WithdrawDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [busy, setBusy] = React.useState(false)
  const [query, setQuery] = React.useState('')
  const [user, setUser] = React.useState<{ id: number; email: string } | null>(null)
  const [amount, setAmount] = React.useState('')
  const [uncertain, setUncertain] = React.useState(false)
  const hits = useQuery({
    queryKey: ['admin', 'affiliates', 'lookup', query],
    queryFn: () => adminAPI.affiliates.lookupUsers(query),
    enabled: !user && query.trim().length >= 2
  })
  const overview = useQuery({
    queryKey: ['admin', 'affiliates', 'overview', user?.id],
    queryFn: () => adminAPI.affiliates.getUserOverview(user!.id),
    enabled: !!user
  })
  const available = overview.data?.available_quota ?? 0
  const value = numOrUndef(amount)
  const invalid = !user || value === undefined || value <= 0 || value > available

  const submit = async () => {
    if (!user || value === undefined) return
    setUncertain(false)
    setBusy(true)
    const key = withdrawIdempotencyKey(user.id, value)
    try {
      const res = await adminAPI.affiliates.withdrawUserQuota(user.id, { amount: value }, key)
      clearWithdrawIdempotencyKey(user.id, value)
      notifySuccess(
        res.replayed
          ? t('admin.affiliates.withdraw.replayed', { amount: money(res.result.amount) })
          : t('admin.affiliates.withdraw.success', {
              amount: money(res.result.amount),
              remaining: money(res.result.available_quota_after)
            })
      )
      onDone()
    } catch (e) {
      const status = (e as { status?: number })?.status
      const code = extractApiErrorCode(e)
      if (status === undefined || status >= 500) setUncertain(true)
      else clearWithdrawIdempotencyKey(user.id, value)
      useAppStore
        .getState()
        .showError(
          code && code.startsWith('AFFILIATE_')
            ? t(`admin.affiliates.errors.${code}`)
            : extractApiErrorMessage(e, t('common.unknownError'))
        )
    } finally {
      setBusy(false)
    }
  }

  return (
    <AdminFormDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={t('admin.affiliates.withdraw.title')}
      onSubmit={submit}
      submitting={busy}
      submitDisabled={invalid}
      submitText={t('admin.affiliates.withdraw.submit')}
      destructive
    >
      {user ? (
        <div className="flex items-center justify-between rounded-md border bg-muted/40 px-3 py-2 text-sm">
          <span>
            {t('admin.affiliates.withdraw.user')}: <strong>{user.email}</strong>
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setUser(null)
              setAmount('')
            }}
          >
            {t('admin.affiliates.withdraw.changeUser')}
          </Button>
        </div>
      ) : (
        <FormField label={t('admin.affiliates.withdraw.user')}>
          <SearchInput
            value={query}
            onValueChange={setQuery}
            placeholder={t('admin.affiliates.withdraw.userPlaceholder')}
          />
          {query.trim().length >= 2 ? (
            <ul className="mt-1 max-h-40 divide-y overflow-y-auto rounded-md border text-sm">
              {(hits.data ?? []).length === 0 && !hits.isLoading ? (
                <li className="px-3 py-2 text-muted-foreground">
                  {t('admin.affiliates.withdraw.noUserFound')}
                </li>
              ) : null}
              {(hits.data ?? []).map((u) => (
                <li key={u.id}>
                  <button
                    type="button"
                    className="flex w-full justify-between px-3 py-1.5 text-left hover:bg-muted"
                    onClick={() => setUser({ id: u.id, email: u.email })}
                  >
                    <span className="truncate">{u.email}</span>
                    <span className="text-xs text-muted-foreground">#{u.id}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </FormField>
      )}
      {user ? (
        <>
          <p className="text-sm text-muted-foreground">
            {t('admin.affiliates.withdraw.availableQuota')}:{' '}
            <span className="tabular font-medium text-foreground">{money(available)}</span> ·{' '}
            {t('admin.affiliates.withdraw.frozenHint')}
          </p>
          <FormField
            label={t('admin.affiliates.withdraw.amount')}
            description={t('admin.affiliates.withdraw.amountHint')}
            error={
              value !== undefined && value > available
                ? t('admin.affiliates.withdraw.amountExceeds')
                : undefined
            }
          >
            <Input
              type="number"
              step="0.01"
              min={0}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </FormField>
          <div>
            <Button type="button" variant="outline" onClick={() => setAmount(String(available))}>
              {t('admin.affiliates.withdraw.fillAll')}
            </Button>
          </div>
        </>
      ) : null}
      <p className="rounded-md border border-warning/30 bg-warning/10 p-3 text-sm">
        {t('admin.affiliates.withdraw.warning')}
      </p>
      {uncertain ? (
        <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm">
          {t('admin.affiliates.withdraw.uncertainHint')}
        </p>
      ) : null}
    </AdminFormDialog>
  )
}

export function AffiliateRecordsPage({ kind }: { kind: AffiliateKind }) {
  const locale = useLocale()
  const qc = useQueryClient()
  const table = useTableState()
  const [search, setSearch] = React.useState('')
  const [range, setRange] = React.useState<DateStrRange | null>(null)
  const [sorting, setSorting] = React.useState<SortingState>([])
  const [withdraw, setWithdraw] = React.useState(false)

  const sort = sorting[0]
  const params = React.useMemo(
    () => ({
      page: table.page,
      page_size: table.pageSize,
      search,
      start_at: range?.start,
      end_at: range?.end,
      sort_by: sort?.id,
      sort_order: sort ? (sort.desc ? ('desc' as const) : ('asc' as const)) : undefined,
      timezone: getBrowserTimeZone()
    }),
    [table.page, table.pageSize, search, range, sort]
  )
  const query = useQuery<PaginatedResponse<unknown>>({
    queryKey: ['admin', 'affiliates', kind, params],
    queryFn: () =>
      kind === 'invites'
        ? adminAPI.affiliates.listInviteRecords(params)
        : kind === 'rebates'
          ? adminAPI.affiliates.listRebateRecords(params)
          : adminAPI.affiliates.listTransferRecords(params),
    placeholderData: (p) => p
  })
  const refresh = () => qc.invalidateQueries({ queryKey: ['admin', 'affiliates'] })

  const who = (email: string, name: string) => (
    <div className="min-w-0">
      <p className="max-w-48 truncate">{email}</p>
      {name ? <p className="text-xs text-muted-foreground">{name}</p> : null}
    </div>
  )
  const time = (key: string, label: string): ColumnDef<never, unknown> => ({
    id: 'created_at',
    header: label,
    cell: ({ row }) => (
      <span className="text-xs text-muted-foreground">
        {formatDateTime((row.original as { created_at: string })[key as 'created_at'])}
      </span>
    )
  })

  const cols = React.useMemo<ColumnDef<never, unknown>[]>(() => {
    if (kind === 'invites') {
      return [
        {
          id: 'inviter',
          enableSorting: false,
          header: t('admin.affiliates.records.inviter'),
          cell: ({ row }) => {
            const r = row.original as AffiliateInviteRecord
            return who(r.inviter_email, r.inviter_username)
          }
        },
        {
          id: 'invitee',
          enableSorting: false,
          header: t('admin.affiliates.records.invitee'),
          cell: ({ row }) => {
            const r = row.original as AffiliateInviteRecord
            return who(r.invitee_email, r.invitee_username)
          }
        },
        {
          id: 'aff_code',
          enableSorting: false,
          header: t('admin.affiliates.records.affCode'),
          cell: ({ row }) => (
            <code className="text-xs">{(row.original as AffiliateInviteRecord).aff_code}</code>
          )
        },
        {
          id: 'total_rebate',
          header: t('admin.affiliates.records.totalRebate'),
          cell: ({ row }) => (
            <span className="tabular">{money((row.original as AffiliateInviteRecord).total_rebate, 4)}</span>
          )
        },
        time('created_at', t('admin.affiliates.records.invitedAt'))
      ]
    }
    if (kind === 'rebates') {
      return [
        {
          id: 'order',
          enableSorting: false,
          header: t('admin.affiliates.records.order'),
          cell: ({ row }) => (
            <code className="text-xs">{(row.original as AffiliateRebateRecord).out_trade_no || '—'}</code>
          )
        },
        {
          id: 'inviter',
          enableSorting: false,
          header: t('admin.affiliates.records.inviter'),
          cell: ({ row }) => {
            const r = row.original as AffiliateRebateRecord
            return who(r.inviter_email, r.inviter_username)
          }
        },
        {
          id: 'invitee',
          enableSorting: false,
          header: t('admin.affiliates.records.invitee'),
          cell: ({ row }) => {
            const r = row.original as AffiliateRebateRecord
            return who(r.invitee_email, r.invitee_username)
          }
        },
        {
          id: 'pay_amount',
          enableSorting: false,
          header: t('admin.affiliates.records.payAmount'),
          cell: ({ row }) => (
            <span className="tabular">
              {(row.original as AffiliateRebateRecord).pay_amount != null
                ? money((row.original as AffiliateRebateRecord).pay_amount)
                : '—'}
            </span>
          )
        },
        {
          id: 'rebate_amount',
          header: t('admin.affiliates.records.rebateAmount'),
          cell: ({ row }) => (
            <span className="tabular font-medium">
              {money((row.original as AffiliateRebateRecord).rebate_amount, 4)}
            </span>
          )
        },
        {
          id: 'payment_type',
          enableSorting: false,
          header: t('admin.affiliates.records.paymentType'),
          cell: ({ row }) => (
            <Badge variant="secondary">{(row.original as AffiliateRebateRecord).payment_type || '—'}</Badge>
          )
        },
        time('created_at', t('admin.affiliates.records.rebatedAt'))
      ]
    }
    return [
      {
        id: 'user',
        enableSorting: false,
        header: t('admin.affiliates.records.user'),
        cell: ({ row }) => {
          const r = row.original as AffiliateTransferRecord
          return who(r.user_email, r.username)
        }
      },
      {
        id: 'action',
        enableSorting: false,
        header: t('admin.affiliates.records.outflowType'),
        cell: ({ row }) => (
          <Badge
            variant={(row.original as AffiliateTransferRecord).action === 'withdraw' ? 'warning' : 'info'}
          >
            {t(`admin.affiliates.outflowTypes.${(row.original as AffiliateTransferRecord).action}`)}
          </Badge>
        )
      },
      {
        id: 'amount',
        header: t('admin.affiliates.records.transferAmount'),
        cell: ({ row }) => (
          <span className="tabular font-medium">
            {money((row.original as AffiliateTransferRecord).amount, 4)}
          </span>
        )
      },
      {
        id: 'balance_after',
        enableSorting: false,
        header: t('admin.affiliates.records.balanceAfter'),
        cell: ({ row }) => (
          <span className="tabular">
            {(row.original as AffiliateTransferRecord).snapshot_available &&
            (row.original as AffiliateTransferRecord).balance_after != null
              ? money((row.original as AffiliateTransferRecord).balance_after)
              : '—'}
          </span>
        )
      },
      {
        id: 'available_quota_after',
        enableSorting: false,
        header: t('admin.affiliates.records.availableQuotaAfter'),
        cell: ({ row }) => (
          <span className="tabular">
            {(row.original as AffiliateTransferRecord).snapshot_available &&
            (row.original as AffiliateTransferRecord).available_quota_after != null
              ? money((row.original as AffiliateTransferRecord).available_quota_after)
              : '—'}
          </span>
        )
      },
      time('created_at', t('admin.affiliates.records.transferredAt'))
    ]
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 只依赖类型与语言
  }, [kind, locale])

  return (
    <div>
      <PageHeader
        title={t(
          `nav.${kind === 'invites' ? 'affiliateInviteRecords' : kind === 'rebates' ? 'affiliateRebateRecords' : 'affiliateTransferRecords'}`
        )}
        description={t(`admin.affiliates.${kind}Description`)}
        actions={
          <>
            <Button variant="outline" aria-label={t('common.refresh')} onClick={() => void refresh()}>
              <RefreshCw className={query.isFetching ? 'animate-spin' : undefined} aria-hidden />
            </Button>
            {kind === 'transfers' ? (
              <Button onClick={() => setWithdraw(true)}>
                <HandCoins aria-hidden />
                {t('admin.affiliates.withdraw.button')}
              </Button>
            ) : null}
          </>
        }
      />
      <FilterBar
        onReset={() => {
          setSearch('')
          setRange(null)
          table.setPage(1)
        }}
      >
        <SearchInput
          value={search}
          onValueChange={(v) => {
            setSearch(v)
            table.setPage(1)
          }}
          placeholder={t('admin.affiliates.records.searchPlaceholder')}
          containerClassName="w-full sm:w-80"
        />
        <DateRangeBar
          value={
            range ?? {
              start: new Date().toISOString().slice(0, 10),
              end: new Date().toISOString().slice(0, 10)
            }
          }
          onChange={(r) => {
            setRange(r)
            table.setPage(1)
          }}
          presets={['today', '7days', '30days', 'thisMonth']}
        />
      </FilterBar>
      <DataTable
        columns={cols as ColumnDef<unknown, unknown>[]}
        data={(query.data?.items ?? []) as unknown[]}
        loading={query.isLoading}
        sorting={sorting}
        onSortingChange={(u) => {
          setSorting(typeof u === 'function' ? u(sorting) : u)
          table.setPage(1)
        }}
        pagination={table.pagination(query.data?.total ?? 0)}
      />
      {withdraw ? (
        <WithdrawDialog
          onClose={() => setWithdraw(false)}
          onDone={() => {
            setWithdraw(false)
            void refresh()
          }}
        />
      ) : null}
    </div>
  )
}
