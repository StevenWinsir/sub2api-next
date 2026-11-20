/** 渠道监控（用户侧 V1）共用的展示辅助：状态 / 厂商标签、延迟与可用率格式化（i18n 键位于 monitorCommon.*）。 */
import type { MonitorStatus, Provider } from '@/api/admin/channelMonitor'
import { PROVIDERS, STATUS_DEGRADED, STATUS_FAILED, STATUS_OPERATIONAL } from '@/constants/channelMonitor'
import { t } from '@/i18n'
import type { BadgeProps } from '@/components/ui/badge'

export function statusLabel(s: MonitorStatus | ''): string {
  return s ? t(`monitorCommon.status.${s}`) : t('monitorCommon.status.unknown')
}

export function statusVariant(s: MonitorStatus | ''): NonNullable<BadgeProps['variant']> {
  switch (s) {
    case STATUS_OPERATIONAL:
      return 'success'
    case STATUS_DEGRADED:
      return 'warning'
    case STATUS_FAILED:
      return 'destructive'
    default:
      return 'secondary'
  }
}

export function providerLabel(p: Provider | string): string {
  return PROVIDERS.includes(p as Provider) ? t(`monitorCommon.providers.${p}`) : p || '-'
}

/** 纯配额监控的主模型是占位符 "quota"，展示本地化的模式名称而非伪模型名。 */
export function formatMonitorModel(model: string): string {
  return model === 'quota' ? t('monitorCommon.checkMode.quota') : model
}

export function formatLatency(ms: number | null | undefined): string {
  return ms == null ? t('monitorCommon.latencyEmpty') : String(Math.round(ms))
}

export function formatPercent(v: number | null | undefined): string {
  return v == null || Number.isNaN(v) ? '-' : `${v.toFixed(2)}%`
}

export function formatRelativeTime(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return t('monitorCommon.latencyEmpty')
  const ts = Date.parse(iso)
  if (Number.isNaN(ts)) return t('monitorCommon.latencyEmpty')
  const diffSec = Math.max(0, Math.floor((now - ts) / 1000))
  if (diffSec < 60) return t('monitorCommon.relativeSecondsAgo', { n: diffSec })
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return t('monitorCommon.relativeMinutesAgo', { n: diffMin })
  const diffHour = Math.floor(diffMin / 60)
  if (diffHour < 24) return t('monitorCommon.relativeHoursAgo', { n: diffHour })
  return t('monitorCommon.relativeDaysAgo', { n: Math.floor(diffHour / 24) })
}

/** 可用率 → HSL（0% 红 / 50% 黄 / 100% 绿）。 */
export function hslForPct(pct: number | null | undefined): string | undefined {
  if (pct == null || Number.isNaN(pct)) return undefined
  return `hsl(${Math.max(0, Math.min(100, pct)) * 1.2} 72% 42%)`
}

export const TIMELINE_STATUS: Record<string, { height: number; color: string }> = {
  operational: { height: 100, color: 'bg-success' },
  degraded: { height: 65, color: 'bg-warning' },
  failed: { height: 35, color: 'bg-destructive' },
  error: { height: 35, color: 'bg-destructive' },
  empty: { height: 15, color: 'bg-muted-foreground/30' }
}
