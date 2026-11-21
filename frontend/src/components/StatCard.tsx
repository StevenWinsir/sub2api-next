import * as React from 'react'
import { ArrowDownRight, ArrowUpRight } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

export interface StatCardProps {
  label: React.ReactNode
  value: React.ReactNode
  /** 环比变化百分比；正数上升、负数下降。 */
  delta?: number | null
  hint?: React.ReactNode
  icon?: React.ReactNode
  /** 迷你趋势（由调用方传入，例如 Recharts Sparkline）。 */
  trend?: React.ReactNode
  loading?: boolean
  className?: string
}

export function StatCard({ label, value, delta, hint, icon, trend, loading, className }: StatCardProps) {
  return (
    <Card className={cn('p-5', className)}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-muted-foreground">{label}</p>
        {icon ? <div className="text-muted-foreground [&_svg]:size-4">{icon}</div> : null}
      </div>
      <div className="mt-2 flex items-end justify-between gap-3">
        <div className="min-w-0">
          {loading ? (
            <Skeleton className="h-8 w-24" />
          ) : (
            <p className="tabular truncate text-2xl font-semibold tracking-tight">{value}</p>
          )}
          <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
            {typeof delta === 'number' ? (
              <span
                className={cn(
                  'inline-flex items-center gap-0.5 font-medium',
                  delta >= 0 ? 'text-success' : 'text-destructive'
                )}
              >
                {delta >= 0 ? (
                  <ArrowUpRight className="size-3" aria-hidden />
                ) : (
                  <ArrowDownRight className="size-3" aria-hidden />
                )}
                {Math.abs(delta).toFixed(1)}%
              </span>
            ) : null}
            {hint}
          </div>
        </div>
        {trend ? <div className="h-10 w-24 shrink-0">{trend}</div> : null}
      </div>
    </Card>
  )
}
