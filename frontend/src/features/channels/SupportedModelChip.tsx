/** 模型徽章：悬停 / 聚焦 / 点击弹出定价详情（Token / 按次 / 图片 / 视频 / 阶梯）。 */
import * as React from 'react'
import type { UserPricingInterval, UserSupportedModel, UserSupportedModelPricing } from '@/api/channels'
import { PlatformIcon } from '@/components/PlatformIcon'
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover'
import {
  BILLING_MODE_IMAGE,
  BILLING_MODE_PER_REQUEST,
  BILLING_MODE_TOKEN,
  BILLING_MODE_VIDEO
} from '@/constants/channel'
import { t } from '@/i18n'
import { cn } from '@/lib/utils'
import { platformBadgeClass } from '@/utils/platformColors'
import { formatScaled, resolveIntervalPrices } from '@/utils/pricing'

const PER_MILLION = 1_000_000

function Row({
  label,
  value,
  unit,
  scale
}: {
  label: string
  value: number | null | undefined
  unit: string
  scale: number
}) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular font-mono">
        {value == null ? '-' : `${formatScaled(value, scale)} ${unit}`}
      </span>
    </div>
  )
}

function formatRange(min: number, max: number | null): string {
  return `(${min}, ${max == null ? '∞' : String(max)}]`
}

function formatInterval(
  iv: UserPricingInterval,
  pricing: UserSupportedModelPricing,
  key: (k: string) => string
): string {
  if (pricing.billing_mode === BILLING_MODE_VIDEO)
    return `${formatScaled(iv.per_request_price, 1)} ${t(key('unitPerSecond'))}`
  if (pricing.billing_mode === BILLING_MODE_PER_REQUEST || pricing.billing_mode === BILLING_MODE_IMAGE)
    return formatScaled(iv.per_request_price, 1)
  const r = resolveIntervalPrices(iv, pricing)
  return `${formatScaled(r.input_price, PER_MILLION)} / ${formatScaled(r.output_price, PER_MILLION)}`
}

export function PricingDetails({
  pricing,
  pricingKeyPrefix = 'availableChannels.pricing',
  noPricingLabel
}: {
  pricing: UserSupportedModelPricing | null
  pricingKeyPrefix?: string
  noPricingLabel: string
}) {
  const key = (k: string) => `${pricingKeyPrefix}.${k}`
  if (!pricing) return <p className="text-muted-foreground">{noPricingLabel}</p>
  const modeLabel = (() => {
    switch (pricing.billing_mode) {
      case BILLING_MODE_TOKEN:
        return t(key('billingModeToken'))
      case BILLING_MODE_PER_REQUEST:
        return t(key('billingModePerRequest'))
      case BILLING_MODE_IMAGE:
        return t(key('billingModeImage'))
      case BILLING_MODE_VIDEO:
        return t(key('billingModeVideo'))
      default:
        return '-'
    }
  })()
  const unit = t(key('unitPerMillion'))
  return (
    <div className="space-y-2">
      <div className="flex justify-between">
        <span className="text-muted-foreground">{t(key('billingMode'))}</span>
        <span>{modeLabel}</span>
      </div>
      {pricing.billing_mode === BILLING_MODE_TOKEN ? (
        <>
          <Row label={t(key('inputPrice'))} value={pricing.input_price} unit={unit} scale={PER_MILLION} />
          <Row label={t(key('outputPrice'))} value={pricing.output_price} unit={unit} scale={PER_MILLION} />
          <Row
            label={t(key('cacheWrite5mPrice'))}
            value={pricing.cache_write_price}
            unit={unit}
            scale={PER_MILLION}
          />
          {pricing.cache_write_1h_price != null ? (
            <Row
              label={t(key('cacheWrite1hPrice'))}
              value={pricing.cache_write_1h_price}
              unit={unit}
              scale={PER_MILLION}
            />
          ) : null}
          {pricing.cache_write_12h_price != null ? (
            <Row
              label={t(key('cacheWrite12hPrice'))}
              value={pricing.cache_write_12h_price}
              unit={unit}
              scale={PER_MILLION}
            />
          ) : null}
          <Row
            label={t(key('cacheReadPrice'))}
            value={pricing.cache_read_price}
            unit={unit}
            scale={PER_MILLION}
          />
          {pricing.image_input_price != null && pricing.image_input_price > 0 ? (
            <Row
              label={t(key('imageInputPrice'))}
              value={pricing.image_input_price}
              unit={unit}
              scale={PER_MILLION}
            />
          ) : null}
          {pricing.image_output_price != null && pricing.image_output_price > 0 ? (
            <Row
              label={t(key('imageOutputPrice'))}
              value={pricing.image_output_price}
              unit={unit}
              scale={PER_MILLION}
            />
          ) : null}
        </>
      ) : pricing.billing_mode === BILLING_MODE_VIDEO ? (
        <Row
          label={t(key('videoPrice'))}
          value={pricing.per_request_price}
          unit={t(key('unitPerSecond'))}
          scale={1}
        />
      ) : (
        <Row
          label={t(key('perRequestPrice'))}
          value={pricing.per_request_price}
          unit={t(key('unitPerRequest'))}
          scale={1}
        />
      )}
      {pricing.intervals?.length > 0 ? (
        <div className="space-y-1 border-t pt-2">
          <p className="font-medium">{t(key('intervals'))}</p>
          {pricing.intervals.map((iv, i) => (
            <div key={i} className="flex justify-between gap-2">
              <span className="text-muted-foreground">
                {iv.tier_label || formatRange(iv.min_tokens, iv.max_tokens)}
              </span>
              <span className="tabular font-mono">{formatInterval(iv, pricing, key)}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}

export function SupportedModelChip({
  model,
  pricingKeyPrefix = 'availableChannels.pricing',
  noPricingLabel,
  showPlatform = true,
  platformHint = ''
}: {
  model: UserSupportedModel
  pricingKeyPrefix?: string
  noPricingLabel: string
  showPlatform?: boolean
  platformHint?: string
}) {
  const [open, setOpen] = React.useState(false)
  const platform = model.platform || platformHint
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <button
          type="button"
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onClick={() => setOpen((o) => !o)}
          className={cn(
            'inline-flex cursor-help items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium transition-colors',
            platform ? platformBadgeClass(platform) : 'border-border bg-muted text-foreground'
          )}
        >
          {platform ? <PlatformIcon platform={platform} size="xs" /> : null}
          {showPlatform && model.platform ? (
            <span className="rounded bg-foreground/10 px-1 text-[10px] uppercase">{model.platform}</span>
          ) : null}
          {model.name}
        </button>
      </PopoverAnchor>
      <PopoverContent
        align="center"
        className="pointer-events-none w-80 max-w-[min(22rem,calc(100vw-1rem))] p-0 text-xs"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
          <span className="truncate font-semibold">{model.name}</span>
          {model.platform ? (
            <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase">
              {model.platform}
            </span>
          ) : null}
        </div>
        <div className="p-3">
          <PricingDetails
            pricing={model.pricing}
            pricingKeyPrefix={pricingKeyPrefix}
            noPricingLabel={noPricingLabel}
          />
        </div>
      </PopoverContent>
    </Popover>
  )
}
