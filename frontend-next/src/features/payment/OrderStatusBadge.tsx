import { Badge, type BadgeProps } from '@/components/ui/badge'
import { t } from '@/i18n'
import type { OrderStatus } from '@/types/payment'

type Variant = NonNullable<BadgeProps['variant']>

const STATUS: Record<OrderStatus, { key: string; variant: Variant }> = {
  PENDING: { key: 'payment.status.pending', variant: 'warning' },
  PAID: { key: 'payment.status.paid', variant: 'info' },
  RECHARGING: { key: 'payment.status.recharging', variant: 'info' },
  COMPLETED: { key: 'payment.status.completed', variant: 'success' },
  EXPIRED: { key: 'payment.status.expired', variant: 'secondary' },
  CANCELLED: { key: 'payment.status.cancelled', variant: 'secondary' },
  FAILED: { key: 'payment.status.failed', variant: 'destructive' },
  REFUND_REQUESTED: { key: 'payment.status.refund_requested', variant: 'warning' },
  REFUNDING: { key: 'payment.status.refunding', variant: 'warning' },
  REFUND_PENDING: { key: 'payment.status.refund_pending', variant: 'warning' },
  REFUNDED: { key: 'payment.status.refunded', variant: 'default' },
  PARTIALLY_REFUNDED: { key: 'payment.status.partially_refunded', variant: 'default' },
  REFUND_FAILED: { key: 'payment.status.refund_failed', variant: 'destructive' }
}

export function orderStatusLabel(status: OrderStatus | string): string {
  const entry = STATUS[status as OrderStatus]
  return entry ? t(entry.key) : String(status)
}

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return <Badge variant={STATUS[status]?.variant ?? 'secondary'}>{orderStatusLabel(status)}</Badge>
}
