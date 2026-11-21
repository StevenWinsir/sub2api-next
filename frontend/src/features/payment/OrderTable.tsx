import * as React from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { DataTable, type DataTableProps } from '@/components/DataTable'
import { t } from '@/i18n'
import type { PaymentOrder } from '@/types/payment'
import { currencySymbol } from './currency'
import { OrderStatusBadge } from './OrderStatusBadge'

export function paymentMethodLabel(type: string): string {
  const key = `payment.methods.${type}`
  const v = t(key)
  return v === key ? type : v
}

/** 订单表（用户侧；管理侧 R4 复用 showUser）。 */
export function OrderTable({
  orders,
  loading,
  showUser,
  renderActions,
  pagination
}: {
  orders: (PaymentOrder & { user_email?: string; user_name?: string; user_notes?: string })[]
  loading: boolean
  showUser?: boolean
  renderActions?: (order: PaymentOrder) => React.ReactNode
  pagination?: DataTableProps<PaymentOrder>['pagination']
}) {
  const columns = React.useMemo<ColumnDef<PaymentOrder, unknown>[]>(() => {
    const credited = currencySymbol('USD')
    const cols: ColumnDef<PaymentOrder, unknown>[] = [
      {
        id: 'id',
        header: t('payment.orders.orderId'),
        cell: ({ row }) => <span className="font-mono text-sm">#{row.original.id}</span>
      },
      {
        id: 'out_trade_no',
        header: t('payment.orders.orderNo'),
        cell: ({ row }) => <span className="break-all text-sm">{row.original.out_trade_no}</span>
      }
    ]
    if (showUser) {
      cols.push({
        id: 'user_email',
        header: t('payment.admin.colUser'),
        cell: ({ row }) => {
          const o = row.original as PaymentOrder & {
            user_email?: string
            user_name?: string
            user_notes?: string
          }
          return (
            <span className="text-sm">
              {o.user_email || o.user_name || `#${o.user_id}`}
              {o.user_notes ? (
                <span className="ml-1 text-xs text-muted-foreground">({o.user_notes})</span>
              ) : null}
            </span>
          )
        }
      })
    }
    cols.push(
      {
        id: 'pay_amount',
        header: t('payment.orders.payAmount'),
        cell: ({ row }) => {
          const o = row.original
          return (
            <div className="text-sm">
              <span className="tabular font-medium">
                {currencySymbol(o.currency)}
                {o.pay_amount.toFixed(2)}
              </span>
              {o.fee_rate > 0 ? (
                <span
                  className="ml-1 text-xs text-muted-foreground"
                  title={`${t('payment.orders.fee')}: ${o.fee_rate}%`}
                >
                  ({t('payment.orders.fee')} {o.fee_rate}%)
                </span>
              ) : null}
              {o.amount !== o.pay_amount || (o.bonus_amount ?? 0) > 0 ? (
                <div className="tabular text-xs text-muted-foreground">
                  {t('payment.orders.creditedAmount')}: {credited}
                  {o.amount.toFixed(2)}
                  {(o.bonus_amount ?? 0) > 0 ? (
                    <span className="ml-1 text-warning">
                      (
                      {t('payment.orders.bonusIncluded', {
                        amount: credited + (o.bonus_amount ?? 0).toFixed(2)
                      })}
                      )
                    </span>
                  ) : null}
                </div>
              ) : null}
            </div>
          )
        }
      },
      {
        id: 'payment_type',
        header: t('payment.orders.paymentMethod'),
        cell: ({ row }) => <span className="text-sm">{paymentMethodLabel(row.original.payment_type)}</span>
      },
      {
        id: 'status',
        header: t('payment.orders.status'),
        cell: ({ row }) => <OrderStatusBadge status={row.original.status} />
      },
      {
        id: 'created_at',
        header: t('payment.orders.createdAt'),
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-xs text-muted-foreground">
            {new Date(row.original.created_at).toLocaleString()}
          </span>
        )
      },
      ...(renderActions
        ? [
            {
              id: 'actions',
              header: t('common.actions'),
              cell: ({ row }: { row: { original: PaymentOrder } }) => renderActions(row.original)
            } as ColumnDef<PaymentOrder, unknown>
          ]
        : [])
    )
    return cols
  }, [showUser, renderActions])

  return (
    <DataTable
      columns={columns}
      data={orders}
      loading={loading}
      getRowId={(o) => String(o.id)}
      pagination={pagination}
    />
  )
}
