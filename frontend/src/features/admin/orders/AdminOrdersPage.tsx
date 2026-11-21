/** /admin/orders：订单管理（筛选 / 详情 / 取消 / 重试充值 / 退款含强制与扣余额 / 退款状态查询）。 */
import * as React from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { RefreshCw } from 'lucide-react'
import { adminAPI } from '@/api/admin'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { DataTable } from '@/components/DataTable'
import { FormField } from '@/components/FormField'
import { PageHeader } from '@/components/PageHeader'
import { SearchInput } from '@/components/SearchInput'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input, Textarea } from '@/components/ui/input'
import { AdminFormDialog } from '@/features/admin/common/AdminFormDialog'
import { FilterBar, FilterSelect } from '@/features/admin/common/FilterBar'
import { numOrUndef } from '@/features/admin/common/fieldUtils'
import { notifySuccess } from '@/features/admin/common/notify'
import { RowActions } from '@/features/admin/common/RowActions'
import { useAdminAction } from '@/features/admin/common/useAdminAction'
import { useTableState } from '@/features/admin/common/useTableState'
import { formatPaymentAmount } from '@/features/payment/currency'
import { OrderStatusBadge } from '@/features/payment/OrderStatusBadge'
import { canRefund } from '@/features/payment/orderUtils'
import { t } from '@/i18n'
import { useLocale } from '@/i18n/react'
import type { PaymentOrder } from '@/types/payment'
import { formatDateTime } from '@/utils/format'

const STATUSES = [
  'PENDING',
  'PAID',
  'RECHARGING',
  'COMPLETED',
  'EXPIRED',
  'CANCELLED',
  'FAILED',
  'REFUND_REQUESTED',
  'REFUNDING',
  'REFUNDED',
  'PARTIALLY_REFUNDED',
  'REFUND_FAILED'
]
const CANCELLABLE = ['PENDING']
const RETRYABLE = ['FAILED', 'PAID']

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-right">{children}</dd>
    </div>
  )
}

function OrderDetailDialog({ order, onClose }: { order: PaymentOrder; onClose: () => void }) {
  const locale = useLocale()
  const fmt = (n: number) => formatPaymentAmount(n, order.currency, locale)
  return (
    <AdminFormDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={t('payment.admin.orderDetail')}
      description={order.out_trade_no}
    >
      <dl className="divide-y">
        <Row label={t('payment.admin.orderType')}>
          {order.order_type === 'subscription'
            ? t('payment.admin.subscriptionOrder')
            : t('payment.admin.balanceOrder')}
        </Row>
        <Row label={t('common.status')}>
          <OrderStatusBadge status={order.status} />
        </Row>
        <Row label={t('payment.admin.orderAmount')}>
          <span className="tabular">{fmt(order.amount)}</span>
        </Row>
        <Row label={t('payment.admin.feeRate')}>
          <span className="tabular">{order.fee_rate}%</span>
        </Row>
        <Row label={t('payment.orders.payAmount')}>
          <span className="tabular">{fmt(order.pay_amount)}</span>
        </Row>
        <Row label="User">#{order.user_id}</Row>
        <Row label={t('adminUi.orders.paymentType')}>{order.payment_type}</Row>
        <Row label={t('payment.admin.paidAt')}>{order.paid_at ? formatDateTime(order.paid_at) : '—'}</Row>
        <Row label={t('payment.admin.completedAt')}>
          {order.completed_at ? formatDateTime(order.completed_at) : '—'}
        </Row>
        <Row label={t('payment.admin.expiresAt')}>{formatDateTime(order.expires_at)}</Row>
        {order.refund_amount > 0 ? (
          <Row label={t('payment.admin.alreadyRefunded')}>{fmt(order.refund_amount)}</Row>
        ) : null}
        {order.refund_reason ? (
          <Row label={t('payment.admin.refundReason')}>{order.refund_reason}</Row>
        ) : null}
        {order.refund_request_reason ? (
          <Row label={t('payment.admin.refundRequestReason')}>{order.refund_request_reason}</Row>
        ) : null}
      </dl>
    </AdminFormDialog>
  )
}

function RefundDialog({
  order,
  onClose,
  onDone
}: {
  order: PaymentOrder
  onClose: () => void
  onDone: () => void
}) {
  const locale = useLocale()
  const { busy, run } = useAdminAction()
  const maxRefundable = Math.max(0, order.pay_amount - order.refund_amount)
  const [amount, setAmount] = React.useState(String(maxRefundable))
  const [reason, setReason] = React.useState(order.refund_request_reason ?? '')
  const [deduct, setDeduct] = React.useState(order.order_type !== 'subscription')
  const [force, setForce] = React.useState(false)
  const [needForce, setNeedForce] = React.useState(false)
  const value = numOrUndef(amount)
  const invalid = value === undefined || value <= 0 || value > maxRefundable || !reason.trim()

  const submit = async () => {
    if (value === undefined) return
    const res = await run(
      () =>
        adminAPI.payment
          .refundOrder(order.id, { amount: value, reason: reason.trim(), deduct_balance: deduct, force })
          .then((r) => r.data),
      { fallback: t('common.unknownError') }
    )
    if (!res) return
    if (res.require_force) {
      setNeedForce(true)
      return
    }
    notifySuccess(res.warning || t('payment.admin.refundSuccess'))
    onDone()
  }

  return (
    <AdminFormDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={t('payment.admin.refundOrder')}
      description={order.out_trade_no}
      onSubmit={submit}
      submitting={busy}
      submitDisabled={invalid}
      submitText={t('payment.admin.confirmRefund')}
      destructive
    >
      <FormField
        label={t('payment.admin.refundAmount')}
        description={`${t('payment.admin.maxRefundable')}: ${formatPaymentAmount(maxRefundable, order.currency, locale)}`}
        error={value !== undefined && value > maxRefundable ? t('payment.admin.maxRefundable') : undefined}
      >
        <Input type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </FormField>
      <FormField label={t('payment.admin.refundReason')} required>
        <Textarea
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={t('payment.admin.refundReasonPlaceholder')}
        />
      </FormField>
      <label className="flex items-start gap-2 text-sm">
        <Checkbox checked={deduct} onCheckedChange={(v) => setDeduct(v === true)} className="mt-0.5" />
        <span>
          <span className="block font-medium">{t('payment.admin.deductBalance')}</span>
          <span className="block text-xs text-muted-foreground">
            {deduct ? t('payment.admin.deductBalanceHint') : t('payment.admin.noDeduction')}
          </span>
        </span>
      </label>
      {needForce ? (
        <label className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning/10 p-3 text-sm">
          <Checkbox checked={force} onCheckedChange={(v) => setForce(v === true)} className="mt-0.5" />
          <span>{t('payment.admin.forceRefund')}</span>
        </label>
      ) : null}
    </AdminFormDialog>
  )
}

type Dlg =
  | { kind: 'detail'; order: PaymentOrder }
  | { kind: 'refund'; order: PaymentOrder }
  | { kind: 'cancel'; order: PaymentOrder }
  | null

export function AdminOrdersPage() {
  const locale = useLocale()
  const qc = useQueryClient()
  const { busy, run } = useAdminAction()
  const table = useTableState()
  const [keyword, setKeyword] = React.useState('')
  const [status, setStatus] = React.useState('')
  const [orderType, setOrderType] = React.useState('')
  const [paymentType, setPaymentType] = React.useState('')
  const [dlg, setDlg] = React.useState<Dlg>(null)

  const params = React.useMemo(
    () => ({
      page: table.page,
      page_size: table.pageSize,
      keyword: keyword || undefined,
      status: status || undefined,
      order_type: orderType || undefined,
      payment_type: paymentType || undefined
    }),
    [table.page, table.pageSize, keyword, status, orderType, paymentType]
  )
  const query = useQuery({
    queryKey: ['admin', 'orders', params],
    queryFn: async () => (await adminAPI.payment.getOrders(params)).data,
    placeholderData: (p) => p
  })
  const refresh = () => qc.invalidateQueries({ queryKey: ['admin', 'orders'] })

  const cols = React.useMemo<ColumnDef<PaymentOrder, unknown>[]>(
    () => [
      {
        id: 'out_trade_no',
        header: t('payment.orders.orderNo'),
        cell: ({ row }) => <code className="text-xs">{row.original.out_trade_no}</code>
      },
      {
        id: 'user',
        header: 'User',
        cell: ({ row }) => <span className="tabular">#{row.original.user_id}</span>
      },
      {
        id: 'type',
        header: t('payment.admin.orderType'),
        cell: ({ row }) =>
          row.original.order_type === 'subscription'
            ? t('payment.admin.subscriptionOrder')
            : t('payment.admin.balanceOrder')
      },
      {
        id: 'amount',
        header: t('payment.admin.orderAmount'),
        cell: ({ row }) => (
          <span className="tabular">
            {formatPaymentAmount(row.original.pay_amount, row.original.currency, locale)}
          </span>
        )
      },
      {
        id: 'payment_type',
        header: t('adminUi.orders.paymentType'),
        cell: ({ row }) => row.original.payment_type
      },
      {
        id: 'status',
        header: t('common.status'),
        cell: ({ row }) => <OrderStatusBadge status={row.original.status} />
      },
      {
        id: 'created_at',
        header: t('payment.orders.createdAt'),
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">{formatDateTime(row.original.created_at)}</span>
        )
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">{t('common.actions')}</span>,
        cell: ({ row }) => {
          const o = row.original
          return (
            <RowActions
              actions={[
                {
                  key: 'detail',
                  label: t('common.view'),
                  onSelect: () => setDlg({ kind: 'detail', order: o })
                },
                {
                  key: 'retry',
                  label: t('payment.admin.retry'),
                  hidden: !RETRYABLE.includes(o.status),
                  onSelect: async () => {
                    const ok = await run(() => adminAPI.payment.retryRecharge(o.id), {
                      success: t('payment.admin.retrySuccess')
                    })
                    if (ok) void refresh()
                  }
                },
                {
                  key: 'cancel',
                  label: t('common.cancel'),
                  hidden: !CANCELLABLE.includes(o.status),
                  onSelect: () => setDlg({ kind: 'cancel', order: o })
                },
                {
                  key: 'refund',
                  label:
                    o.status === 'REFUND_REQUESTED'
                      ? t('payment.admin.approveRefund')
                      : o.status === 'REFUND_FAILED'
                        ? t('payment.admin.retryRefund')
                        : t('payment.admin.refund'),
                  hidden: !canRefund(o.status),
                  separator: true,
                  onSelect: () => setDlg({ kind: 'refund', order: o })
                },
                {
                  key: 'queryRefund',
                  label: t('payment.admin.queryRefundStatus'),
                  hidden: o.status !== 'REFUNDING' && o.status !== 'REFUND_PENDING',
                  onSelect: async () => {
                    const ok = await run(() => adminAPI.payment.queryRefund(o.id), {
                      success: t('payment.admin.refundSuccess')
                    })
                    if (ok) void refresh()
                  }
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
        title={t('payment.admin.tabs.orders')}
        actions={
          <Button variant="outline" aria-label={t('common.refresh')} onClick={() => void refresh()}>
            <RefreshCw className={query.isFetching ? 'animate-spin' : undefined} aria-hidden />
          </Button>
        }
      />
      <FilterBar
        onReset={() => {
          setKeyword('')
          setStatus('')
          setOrderType('')
          setPaymentType('')
          table.setPage(1)
        }}
      >
        <SearchInput
          value={keyword}
          onValueChange={(v) => {
            setKeyword(v)
            table.setPage(1)
          }}
          placeholder={t('payment.admin.searchOrders')}
          containerClassName="w-full sm:w-72"
        />
        <FilterSelect
          label={t('common.status')}
          value={status}
          onChange={(v) => {
            setStatus(v)
            table.setPage(1)
          }}
          options={[
            { value: '', label: t('payment.admin.allStatuses') },
            ...STATUSES.map((s) => ({ value: s, label: t(`payment.status.${s.toLowerCase()}`) }))
          ]}
        />
        <FilterSelect
          label={t('payment.admin.orderType')}
          value={orderType}
          onChange={(v) => {
            setOrderType(v)
            table.setPage(1)
          }}
          options={[
            { value: '', label: t('payment.admin.allOrderTypes') },
            { value: 'balance', label: t('payment.admin.balanceOrder') },
            { value: 'subscription', label: t('payment.admin.subscriptionOrder') }
          ]}
        />
        <FilterSelect
          label={t('adminUi.orders.paymentType')}
          value={paymentType}
          onChange={(v) => {
            setPaymentType(v)
            table.setPage(1)
          }}
          options={[
            { value: '', label: t('payment.admin.allPaymentTypes') },
            ...['alipay', 'wxpay', 'stripe', 'airwallex'].map((p) => ({ value: p, label: p }))
          ]}
        />
      </FilterBar>
      <DataTable
        columns={cols}
        data={query.data?.items ?? []}
        loading={query.isLoading}
        getRowId={(o) => String(o.id)}
        pagination={table.pagination(query.data?.total ?? 0)}
      />
      {dlg?.kind === 'detail' ? <OrderDetailDialog order={dlg.order} onClose={() => setDlg(null)} /> : null}
      {dlg?.kind === 'refund' ? (
        <RefundDialog
          order={dlg.order}
          onClose={() => setDlg(null)}
          onDone={() => {
            setDlg(null)
            void refresh()
          }}
        />
      ) : null}
      <ConfirmDialog
        open={dlg?.kind === 'cancel'}
        onOpenChange={(o) => !o && setDlg(null)}
        title={t('common.cancel')}
        description={dlg?.kind === 'cancel' ? dlg.order.out_trade_no : undefined}
        destructive
        loading={busy}
        onConfirm={async () => {
          if (dlg?.kind !== 'cancel') return
          const o = dlg.order
          const ok = await run(() => adminAPI.payment.cancelOrder(o.id), {
            success: t('payment.admin.orderCancelled')
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
