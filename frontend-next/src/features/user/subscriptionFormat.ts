/** 订阅页的纯逻辑：进度、到期与窗口重置文案（与 Vue 版 SubscriptionsView 一致）。 */
import { t } from '@/i18n'
import type { UserSubscription } from '@/types'
import { formatDateTimeToMinute } from '@/utils/format'
import {
  getExpirationDateRelation,
  getRemainingDurationParts,
  isOneTimeDailyQuota,
  type RemainingDurationParts
} from '@/utils/subscriptionQuota'

export function progressPercent(used: number | undefined, limit: number | null | undefined): number {
  if (!limit || limit === 0) return 0
  return Math.min(((used || 0) / limit) * 100, 100)
}

export type ProgressTone = 'muted' | 'destructive' | 'warning' | 'success'
export function progressTone(used: number | undefined, limit: number | null | undefined): ProgressTone {
  if (!limit || limit === 0) return 'muted'
  const pct = ((used || 0) / limit) * 100
  if (pct >= 90) return 'destructive'
  if (pct >= 70) return 'warning'
  return 'success'
}

export function formatDurationParts(parts: RemainingDurationParts): string {
  if (parts.days > 0) return `${parts.days}d ${parts.hours}h`
  if (parts.hours > 0) return `${parts.hours}h ${parts.minutes}m`
  return `${parts.minutes}m`
}

export function formatResetTime(windowStart: string | null, windowHours: number, now = new Date()): string {
  if (!windowStart) return t('userSubscriptions.windowNotActive')
  const end = new Date(new Date(windowStart).getTime() + windowHours * 3600_000)
  const parts = getRemainingDurationParts(end, now)
  return parts ? formatDurationParts(parts) : t('userSubscriptions.windowNotActive')
}

export function formatDailyUsageWindow(sub: UserSubscription, now = new Date()): string {
  if (isOneTimeDailyQuota(sub) && sub.expires_at) {
    const parts = getRemainingDurationParts(sub.expires_at, now)
    if (!parts) return t('userSubscriptions.windowNotActive')
    return t('userSubscriptions.quotaEndsIn', { time: formatDurationParts(parts) })
  }
  return t('userSubscriptions.resetIn', { time: formatResetTime(sub.daily_window_start, 24, now) })
}

export function formatExpirationDate(expiresAt: string, now = new Date()): string {
  const expires = new Date(expiresAt)
  const days = Math.ceil((expires.getTime() - now.getTime()) / 86400000)
  const relation = getExpirationDateRelation(expires, now)
  if (relation === null) return ''
  if (relation === 'expired') return t('userSubscriptions.status.expired')
  const dateStr = formatDateTimeToMinute(expires)
  if (relation === 'today') return `${dateStr} (${t('common.today')})`
  if (relation === 'tomorrow') return `${dateStr} (${t('common.tomorrow')})`
  return `${t('userSubscriptions.daysRemaining', { days })} (${dateStr})`
}

export function expirationTone(expiresAt: string, now = new Date()): 'destructive' | 'warning' | 'normal' {
  const diff = new Date(expiresAt).getTime() - now.getTime()
  const days = Math.ceil(diff / 86400000)
  if (diff <= 0 || days <= 3) return 'destructive'
  if (days <= 7) return 'warning'
  return 'normal'
}
