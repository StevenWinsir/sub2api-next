import * as React from 'react'
import { PlatformIcon } from '@/components/PlatformIcon'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/stores/app'
import { formatPeakRateWindow, serverTimezoneLabel } from '@/utils/peak-rate'
import { platformBadgeLightClass } from '@/utils/platformColors'
import { t } from '@/i18n'

export interface GroupBadgeProps {
  name: string
  platform?: string
  subscriptionType?: 'standard' | 'subscription' | string
  rateMultiplier?: number
  /** 用户专属倍率：与默认倍率不同时划线展示原倍率。 */
  userRateMultiplier?: number | null
  peakRateEnabled?: boolean
  peakStart?: string
  peakEnd?: string
  peakRateMultiplier?: number
  showRate?: boolean
  truncate?: boolean
  /** 订阅分组剩余天数。 */
  daysRemaining?: number | null
  /** 订阅分组也显示倍率（可用渠道等只关心费率的场景）。 */
  alwaysShowRate?: boolean
  className?: string
}

/** 分组徽章：平台图标 + 名称 + 倍率 / 订阅 / 剩余天数 + 高峰倍率。 */
export function GroupBadge({
  name,
  platform,
  subscriptionType = 'standard',
  rateMultiplier,
  userRateMultiplier = null,
  peakRateEnabled = false,
  peakStart,
  peakEnd,
  peakRateMultiplier,
  showRate = true,
  truncate = true,
  daysRemaining = null,
  alwaysShowRate = false,
  className
}: GroupBadgeProps) {
  const utcOffset = useAppStore((s) => s.cachedPublicSettings?.server_utc_offset)
  const isSubscription = subscriptionType === 'subscription'
  const hasCustomRate =
    userRateMultiplier != null && rateMultiplier !== undefined && userRateMultiplier !== rateMultiplier
  const hasPeak = Boolean(showRate && peakRateEnabled && peakStart && peakEnd)
  const peakText = hasPeak
    ? formatPeakRateWindow(
        {
          peak_rate_enabled: peakRateEnabled,
          peak_start: peakStart,
          peak_end: peakEnd,
          peak_rate_multiplier: peakRateMultiplier
        },
        serverTimezoneLabel(utcOffset)
      )
    : ''

  const showLabel = showRate && (isSubscription || rateMultiplier !== undefined || hasCustomRate)

  let labelText = rateMultiplier !== undefined ? `${rateMultiplier}x` : ''
  if (isSubscription && !alwaysShowRate) {
    labelText =
      daysRemaining != null
        ? daysRemaining <= 0
          ? t('admin.users.expired')
          : t('admin.users.daysRemaining', { days: daysRemaining })
        : t('groups.subscription')
  }
  const urgency =
    isSubscription && daysRemaining != null
      ? daysRemaining <= 3
        ? 'bg-destructive/15 text-destructive'
        : daysRemaining <= 7
          ? 'bg-warning/20 text-warning'
          : ''
      : ''

  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium',
        platformBadgeLightClass(platform ?? ''),
        className
      )}
    >
      {platform ? <PlatformIcon platform={platform} size="sm" /> : null}
      <span className={truncate ? 'truncate' : 'whitespace-normal break-words'}>{name}</span>
      {showLabel ? (
        <span className={cn('rounded px-1.5 py-px text-[10px] font-semibold', urgency || 'bg-foreground/10')}>
          {hasCustomRate ? (
            <>
              <span className="mr-1 line-through opacity-60">{rateMultiplier}x</span>
              <span>{userRateMultiplier}x</span>
            </>
          ) : (
            labelText
          )}
        </span>
      ) : null}
      {hasPeak ? (
        <span
          title={t('common.peakRateTooltip', { window: peakText })}
          className="rounded bg-warning/20 px-1.5 py-px text-[10px] font-semibold text-warning"
        >
          {peakText}
        </span>
      ) : null}
    </span>
  )
}
