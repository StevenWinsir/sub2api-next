import type { HealthState } from '@/api/channelMonitorV2'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'

const TONE: Record<string, string> = {
  healthy: 'text-success',
  warning: 'text-warning',
  critical: 'text-destructive'
}
const DOT: Record<string, string> = {
  healthy: 'bg-success',
  warning: 'bg-warning',
  critical: 'bg-destructive'
}

/** KPI 卡：数值 + 健康状态点 + 次级信息（按 “ · ” 拆成不省略的小块）。 */
export function MetricCell({
  label,
  value,
  detail,
  state,
  title
}: {
  label: string
  value: string
  detail?: string
  state?: HealthState
  title?: string
}) {
  const missing = ['', '-', '—'].includes((value || '').trim())
  const resolved = missing ? undefined : state
  const parts = (detail || '')
    .split(/\s*[·|]\s*/)
    .map((p) => p.trim())
    .filter(Boolean)
  return (
    <Card className="flex gap-2.5 p-4" title={title}>
      {resolved ? (
        <span
          className={cn('mt-1.5 size-2 shrink-0 rounded-full', DOT[resolved] ?? 'bg-muted-foreground/40')}
          aria-hidden
        />
      ) : null}
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
        <p
          className={cn(
            'tabular mt-1 text-xl font-semibold leading-tight',
            resolved ? TONE[resolved] : missing ? 'text-muted-foreground' : ''
          )}
        >
          {value}
        </p>
        {parts.length > 1 ? (
          <div className="tabular mt-1.5 flex flex-wrap gap-x-2 text-[11px] text-muted-foreground">
            {parts.map((p, i) => (
              <span key={`${i}:${p}`} className="whitespace-nowrap">
                {p}
              </span>
            ))}
          </div>
        ) : detail && detail !== '-' ? (
          <p className="mt-1.5 text-[11px] text-muted-foreground">{detail}</p>
        ) : null}
      </div>
    </Card>
  )
}
