import * as React from 'react'
import { Badge, type BadgeProps } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

export type Status = 'success' | 'warning' | 'error' | 'info' | 'neutral'

const VARIANT: Record<Status, NonNullable<BadgeProps['variant']>> = {
  success: 'success',
  warning: 'warning',
  error: 'destructive',
  info: 'info',
  neutral: 'secondary'
}

const DOT: Record<Status, string> = {
  success: 'bg-success',
  warning: 'bg-warning',
  error: 'bg-destructive',
  info: 'bg-info',
  neutral: 'bg-muted-foreground'
}

export interface StatusBadgeProps extends Omit<BadgeProps, 'variant'> {
  status: Status
  /** 显示状态圆点（色盲友好：状态同时有文字）。 */
  dot?: boolean
}

export function StatusBadge({ status, dot = true, className, children, ...props }: StatusBadgeProps) {
  return (
    <Badge variant={VARIANT[status]} className={cn(className)} {...props}>
      {dot ? <span aria-hidden className={cn('size-1.5 rounded-full', DOT[status])} /> : null}
      {children}
    </Badge>
  )
}
