import type { MonitorMatrixRow } from '@/api/channelMonitorV2'
import { PlatformIcon } from '@/components/PlatformIcon'
import { t } from '@/i18n'
import { cn } from '@/lib/utils'
import { formatMonitorPercent, healthScoreClass, type HealthDisplayMode } from './monitorFormat'

function rowLabel(row: MonitorMatrixRow): string {
  return [
    row.platform,
    row.group_name,
    row.model && row.model !== '__other__' ? row.model : row.model ? t('channelMonitorV2.otherModels') : ''
  ]
    .filter(Boolean)
    .join(' / ')
}

/** 健康度脉冲矩阵：每行一个渠道维度，每格是一个聚合时间桶，颜色即健康分。 */
export function HealthMatrix({
  rows,
  mode,
  locale
}: {
  rows: MonitorMatrixRow[]
  mode: HealthDisplayMode
  locale?: string
}) {
  if (rows.length === 0)
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        {t('channelMonitorV2.matrix.emptyTitle')}
      </p>
    )
  const time = (iso: string) =>
    new Intl.DateTimeFormat(locale || undefined, {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(iso))
  return (
    <div className="space-y-3">
      <div className="space-y-1.5 overflow-x-auto">
        {rows.map((row, i) => (
          <div
            key={`${rowLabel(row)}:${i}`}
            className="grid min-w-[36rem] grid-cols-[12rem_1fr_4rem] items-center gap-3"
          >
            <div className="flex min-w-0 items-center gap-1.5 text-xs">
              <PlatformIcon platform={row.platform} size="sm" />
              <span className="truncate font-medium" title={rowLabel(row)}>
                {rowLabel(row)}
              </span>
            </div>
            <div className="flex h-5 gap-px" role="img" aria-label={rowLabel(row)}>
              {row.buckets.map((b) => {
                const count = b.metrics.request_count
                const cls = healthScoreClass(b.health, mode, count)
                return (
                  <span
                    key={b.bucket_start}
                    className={cn('min-w-px flex-1 rounded-[2px]', cls)}
                    title={
                      count > 0
                        ? `${time(b.bucket_start)} · ${t('channelMonitorV2.matrix.scoreLine', { score: b.health.score ?? '-' })}`
                        : t('channelMonitorV2.matrix.noTrafficAt', { time: time(b.bucket_start) })
                    }
                  />
                )
              })}
            </div>
            <span className="tabular text-right text-xs text-muted-foreground">
              {row.metrics.request_count > 0 ? formatMonitorPercent(1 - row.metrics.error_rate) : '-'}
            </span>
          </div>
        ))}
      </div>
      <div
        className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground"
        role="group"
        aria-label={t('channelMonitorV2.matrix.legendAria')}
      >
        <span>{t('channelMonitorV2.matrix.bad')}</span>
        <span className="flex gap-px">
          {Array.from({ length: 11 }).map((_, i) => (
            <span key={i} className={cn('h-2.5 w-4 first:rounded-l last:rounded-r', `health-score${i}`)} />
          ))}
        </span>
        <span>{t('channelMonitorV2.matrix.good')}</span>
        <span className="ml-3 flex items-center gap-1">
          <span className="health-unknown size-2.5 rounded-sm" />
          {t('channelMonitorV2.matrix.unknownLegend')}
        </span>
      </div>
    </div>
  )
}
