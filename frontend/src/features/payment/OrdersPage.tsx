/** /orders：我的订单（筛选 / 取消待支付 / 申请退款）。 */
import * as React from 'react'
import Link from 'next/link'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Ban, RefreshCw, Undo2 } from 'lucide-react'
import { paymentAPI } from '@/api/payment'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { NativeSelect } from '@/components/NativeSelect'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/input'
import { getPersistedPageSize, setPersistedPageSize } from '@/hooks/usePersistedPageSize'
import { t } from '@/i18n'
import { useLocale } from '@/i18n/react'
import { useAppStore } from '@/stores/app'
import type { PaymentOrder } from '@/types/payment'
import { extractI18nErrorMessage } from '@/utils/apiError'
import { getConfiguredTablePageSizeOptions } from '@/utils/tablePreferences'
import { OrderTable } from './OrderTable'

const FILTERS = [
  ['', 'common.all'],
  ['PENDING', 'payment.status.pending'],
  ['COMPLETED', 'payment.status.completed'],
  ['FAILED', 'payment.status.failed'],
  ['REFUNDED', 'payment.status.refunded']
] as const

export function OrdersPage() {
  useLocale()
  const queryClient = useQueryClient()
  const [filter, setFilter] = React.useState('')
  const [page, setPage] = React.useState(1)
  const [pageSize, setPageSize] = React.useState(() => getPersistedPageSize())
  const [cancelId, setCancelId] = React.useState<number | null>(null)
  const [refundTarget, setRefundTarget] = React.useState<PaymentOrder | null>(null)
  const [refundReason, setRefundReason] = React.useState('')
  const [actionLoading, setActionLoading] = React.useState(false)

  const orders = useQuery({
    queryKey: ['user', 'orders', page, pageSize, filter],
    queryFn: async () => {
      try {
        return (await paymentAPI.getMyOrders({ page, page_size: pageSize, status: filter || undefined })).data
      } catch (err) {
        useAppStore.getState().showError(extractI18nErrorMessage(err, t, 'payment.errors', t('common.error')))
        throw err
      }
    },
    placeholderData: (p) => p
  })
  // 默认隐藏退款按钮：接口失败则忽略
  const eligible = useQuery({
    queryKey: ['user', 'orders', 'refund-eligible'],
    queryFn: async () =>
      new Set((await paymentAPI.getRefundEligibleProviders()).data.provider_instance_ids || []),
    retry: false
  })
  const canRefund = React.useCallback(
    (o: PaymentOrder) =>
      o.status === 'COMPLETED' &&
      !!o.provider_instance_id &&
      (eligible.data?.has(o.provider_instance_id) ?? false),
    [eligible.data]
  )

  const refetch = () => queryClient.invalidateQueries({ queryKey: ['user', 'orders'] })
  const run = async (fn: () => Promise<unknown>, after: () => void) => {
    setActionLoading(true)
    try {
      await fn()
      useAppStore.getState().showSuccess(t('common.success'))
      after()
      await refetch()
    } catch (err) {
      useAppStore.getState().showError(extractI18nErrorMessage(err, t, 'payment.errors', t('common.error')))
    } finally {
      setActionLoading(false)
    }
  }

  const renderActions = React.useCallback(
    (row: PaymentOrder) => (
      <div className="flex items-center gap-1">
        {row.status === 'PENDING' ? (
          <Button
            size="sm"
            variant="ghost"
            className="text-warning hover:text-warning"
            onClick={() => setCancelId(row.id)}
          >
            <Ban aria-hidden /> {t('payment.orders.cancel')}
          </Button>
        ) : null}
        {canRefund(row) ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setRefundTarget(row)
              setRefundReason('')
            }}
          >
            <Undo2 aria-hidden /> {t('payment.orders.requestRefund')}
          </Button>
        ) : null}
      </div>
    ),
    [canRefund]
  )

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('payment.orders.title')}
        actions={
          <>
            <NativeSelect
              className="w-40"
              aria-label={t('payment.orders.status')}
              value={filter}
              onChange={(e) => {
                setFilter(e.target.value)
                setPage(1)
              }}
            >
              {FILTERS.map(([v, k]) => (
                <option key={v} value={v}>
                  {t(k)}
                </option>
              ))}
            </NativeSelect>
            <Button
              variant="outline"
              size="icon"
              aria-label={t('common.refresh')}
              onClick={() => void orders.refetch()}
              disabled={orders.isFetching}
            >
              <RefreshCw className={orders.isFetching ? 'animate-spin' : ''} aria-hidden />
            </Button>
            <Button asChild>
              <Link href="/purchase">{t('payment.result.backToRecharge')}</Link>
            </Button>
          </>
        }
      />
      <OrderTable
        orders={orders.data?.items ?? []}
        loading={orders.isLoading}
        renderActions={renderActions}
        pagination={{
          page,
          pageSize,
          total: orders.data?.total ?? 0,
          pageSizeOptions: getConfiguredTablePageSizeOptions(),
          onPageChange: setPage,
          onPageSizeChange: (n) => {
            setPersistedPageSize(n)
            setPageSize(n)
            setPage(1)
          }
        }}
      />
      <ConfirmDialog
        open={cancelId != null}
        onOpenChange={(o) => !o && setCancelId(null)}
        title={t('payment.orders.cancel')}
        description={t('payment.confirmCancel')}
        confirmText={t('payment.orders.cancel')}
        destructive
        loading={actionLoading}
        onConfirm={() =>
          cancelId != null
            ? run(
                () => paymentAPI.cancelOrder(cancelId),
                () => setCancelId(null)
              )
            : undefined
        }
      />
      <Dialog open={!!refundTarget} onOpenChange={(o) => !o && setRefundTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('payment.orders.requestRefund')}</DialogTitle>
            <DialogDescription className="sr-only">{t('payment.refundReason')}</DialogDescription>
          </DialogHeader>
          {refundTarget ? (
            <div className="space-y-4">
              <dl className="space-y-2 rounded-lg bg-muted p-4 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">{t('payment.orders.orderId')}</dt>
                  <dd className="font-mono">#{refundTarget.id}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">{t('payment.orders.amount')}</dt>
                  <dd className="tabular">${refundTarget.amount.toFixed(2)}</dd>
                </div>
              </dl>
              <div className="space-y-1.5">
                <label htmlFor="refund-reason" className="text-sm font-medium">
                  {t('payment.refundReason')}
                </label>
                <Textarea
                  id="refund-reason"
                  rows={3}
                  value={refundReason}
                  placeholder={t('payment.refundReasonPlaceholder')}
                  onChange={(e) => setRefundReason(e.target.value)}
                />
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRefundTarget(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              loading={actionLoading}
              disabled={!refundReason.trim()}
              onClick={() =>
                refundTarget &&
                void run(
                  () => paymentAPI.requestRefund(refundTarget.id, { reason: refundReason.trim() }),
                  () => {
                    setRefundTarget(null)
                    setRefundReason('')
                  }
                )
              }
            >
              {t('payment.orders.requestRefund')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
