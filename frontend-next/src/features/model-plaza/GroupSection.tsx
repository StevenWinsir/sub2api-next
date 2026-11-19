import * as React from 'react'
import { Clock, Info, ShieldCheck } from 'lucide-react'
import type { ModelPlazaGroup } from '@/api/modelPlaza'
import { GroupBadge } from '@/components/GroupBadge'
import { useAppStore } from '@/stores/app'
import { formatPeakRateWindow, hasPeakRate, serverTimezoneLabel } from '@/utils/peak-rate'
import { t } from '@/i18n'
import { PricingTable } from './PricingTable'

export function GroupSection({ group }: { group: ModelPlazaGroup }) {
  const utcOffset = useAppStore((s) => s.cachedPublicSettings?.server_utc_offset)
  // 高峰窗口描述（含倍率与服务器时区标注）；分组未启用高峰为空串
  const peakWindow = hasPeakRate(group) ? formatPeakRateWindow(group, serverTimezoneLabel(utcOffset)) : ''
  // 分组关闭长上下文阶梯、但组内有模型官方带阶梯时提示：实付列只展示基础档
  const longContextNote =
    group.long_context_pricing_enabled !== false
      ? ''
      : group.models.some((m) => (m.official_pricing?.intervals?.length ?? 0) > 1)
        ? t('modelPlaza.detail.longContextDisabledNote')
        : ''

  return (
    <section className="overflow-hidden rounded-lg border bg-card" aria-label={group.name}>
      <header className="space-y-2 border-b px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <GroupBadge
            name={group.name}
            platform={group.platform}
            subscriptionType={group.subscription_type || 'standard'}
            rateMultiplier={group.rate_multiplier}
            userRateMultiplier={group.user_rate_multiplier ?? null}
            peakRateEnabled={group.peak_rate_enabled}
            peakStart={group.peak_start}
            peakEnd={group.peak_end}
            peakRateMultiplier={group.peak_rate_multiplier}
            alwaysShowRate
          />
          {group.is_exclusive ? (
            <span className="inline-flex items-center gap-1 rounded-md bg-accent px-1.5 py-0.5 text-[10px] font-medium text-accent-foreground">
              <ShieldCheck className="size-3" aria-hidden /> {t('modelPlaza.badges.exclusive')}
            </span>
          ) : null}
          {group.subscription_type === 'subscription' ? (
            <span className="rounded-md bg-info/15 px-1.5 py-0.5 text-[10px] font-medium text-info">
              {t('modelPlaza.badges.subscription')}
            </span>
          ) : null}
        </div>
        {group.description ? <p className="text-sm text-muted-foreground">{group.description}</p> : null}
        {peakWindow ? (
          <p className="flex items-start gap-1.5 text-xs text-warning">
            <Clock className="mt-px size-3.5 shrink-0" aria-hidden />
            {t('modelPlaza.detail.peakNote', { window: peakWindow, multiplier: group.peak_rate_multiplier })}
          </p>
        ) : null}
        {longContextNote ? (
          <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <Info className="mt-px size-3.5 shrink-0" aria-hidden />
            {longContextNote}
          </p>
        ) : null}
      </header>
      {group.models.length > 0 ? (
        <PricingTable
          models={group.models}
          platform={group.platform}
          rateMultiplier={group.rate_multiplier}
          userRateMultiplier={group.user_rate_multiplier ?? null}
          imageRateIndependent={group.image_rate_independent}
          imageRateMultiplier={group.image_rate_multiplier}
          videoRateIndependent={group.video_rate_independent}
          videoRateMultiplier={group.video_rate_multiplier}
          peakWindow={peakWindow}
          peakRateMultiplier={group.peak_rate_multiplier}
        />
      ) : (
        <p className="px-4 py-6 text-center text-sm text-muted-foreground">
          {t('modelPlaza.detail.noModels')}
        </p>
      )}
    </section>
  )
}
