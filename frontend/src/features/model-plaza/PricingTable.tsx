import * as React from 'react'
import type { UserPricingInterval } from '@/api/channels'
import type { PlazaModel, PlazaTimePricingPeriod } from '@/api/modelPlaza'
import { BILLING_MODE_IMAGE, BILLING_MODE_TOKEN } from '@/constants/channel'
import { platformBadgeLightClass, platformLabel } from '@/utils/platformColors'
import { cn } from '@/lib/utils'
import { t } from '@/i18n'
import {
  billingMode,
  buildRows,
  effectiveRate as effectiveRateOfCtx,
  formatTimeWindow,
  hasCachePricing,
  hasCustomRate as hasCustomRateOfCtx,
  hasOfficialCache,
  hasTierCachePricing,
  intervalHasCache,
  officialIntervals,
  officialPerMillion,
  paidPerMillion,
  paidRequestPrice,
  periodRate,
  reasoningEffortMultipliers,
  requestIntervals,
  requestRate,
  tierLabel,
  tokenIntervals,
  usesIndependentMediaRate,
  type RateContext
} from './pricing'

interface Props extends RateContext {
  models: PlazaModel[]
  platform?: string
  /** 高峰窗口描述（含倍率与服务器时区标注），空串 = 分组未启用高峰。 */
  peakWindow?: string
  peakRateMultiplier?: number | null
}

const NUM = 'px-3 py-2 text-right align-top tabular-nums font-mono text-[13px]'
const MUTED = 'text-muted-foreground'

function TierBadge({ label, title }: { label: string; title?: string }) {
  return (
    <span
      title={title}
      className="mr-1.5 inline-block rounded bg-muted px-1 py-px font-sans text-[10px] font-medium text-muted-foreground"
    >
      {label}
    </span>
  )
}

function Pill({
  children,
  title,
  className
}: {
  children: React.ReactNode
  title?: string
  className?: string
}) {
  return (
    <span
      title={title}
      className={cn('inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium', className)}
    >
      {children}
    </span>
  )
}

/** 缓存价单元：(写入 [1h/12h]) + 读取；fmt 决定实付 / 官方口径。 */
function CacheLine({
  fmt,
  write,
  write1h,
  write12h,
  read,
  short
}: {
  fmt: (v: number | null | undefined) => string
  write?: number | null
  write1h?: number | null
  write12h?: number | null
  read?: number | null
  short?: boolean
}) {
  return (
    <>
      <div>
        <span className={cn('mr-1 font-sans text-[10px]', MUTED)}>
          {short ? t('modelPlaza.table.cacheWriteShort') : t('modelPlaza.table.cacheWrite')}
        </span>
        {fmt(write)}
        {write1h != null ? <span className={MUTED}> (1h {fmt(write1h)})</span> : null}
        {write12h != null ? <span className={MUTED}> (12h {fmt(write12h)})</span> : null}
      </div>
      <div>
        <span className={cn('mr-1 font-sans text-[10px]', MUTED)}>
          {short ? t('modelPlaza.table.cacheReadShort') : t('modelPlaza.table.cacheRead')}
        </span>
        {fmt(read)}
      </div>
    </>
  )
}

function TieredCache({
  intervals,
  fmt,
  hint
}: {
  intervals: UserPricingInterval[]
  fmt: (v: number | null | undefined) => string
  hint?: string
}) {
  return (
    <>
      {intervals.map((iv, idx) => (
        <div key={idx} title={hint}>
          {intervalHasCache(iv) ? (
            <div className="flex flex-wrap gap-x-2">
              <CacheLine
                fmt={fmt}
                write={iv.cache_write_price}
                write1h={iv.cache_write_1h_price}
                write12h={iv.cache_write_12h_price}
                read={iv.cache_read_price}
                short
              />
            </div>
          ) : (
            <span className={MUTED}>-</span>
          )}
        </div>
      ))}
    </>
  )
}

/** 模型价格表：实付价（已乘倍率）与官方参考价并列；支持阶梯、缓存、分时倍率、按次 / 按图计费。 */
export function PricingTable({ models, platform, peakWindow, peakRateMultiplier, ...ctx }: Props) {
  const rows = React.useMemo(() => buildRows(models), [models])
  const effective = effectiveRateOfCtx(ctx)
  const custom = hasCustomRateOfCtx(ctx)

  const tierHint = (m: PlazaModel) =>
    m.long_context_basis === 'marginal'
      ? t('modelPlaza.table.tierHintMarginal')
      : t('modelPlaza.table.tierHint')
  const rowHint = (m: PlazaModel) => {
    let hint = t(
      m.time_pricing?.weekdays_only
        ? 'modelPlaza.table.timePricingRowHintWeekdays'
        : 'modelPlaza.table.timePricingRowHint',
      {
        timezone: m.time_pricing?.timezone
      }
    )
    if (peakWindow)
      hint += t('modelPlaza.table.timePricingRowHintPeak', {
        window: peakWindow,
        multiplier: peakRateMultiplier ?? 1
      })
    return hint
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[56rem] border-collapse text-sm">
        <thead className="text-xs text-muted-foreground">
          <tr className="border-b">
            <th rowSpan={2} scope="col" className="px-3 py-2 text-left font-medium">
              {t('modelPlaza.table.model')}
            </th>
            <th
              colSpan={3}
              scope="colgroup"
              className="border-l bg-primary/5 px-3 py-2 text-center font-medium text-primary"
            >
              {t('modelPlaza.table.paidPrice')}{' '}
              <span className="font-normal opacity-70">{t('modelPlaza.table.unitPerMillion')}</span>
            </th>
            <th colSpan={3} scope="colgroup" className="border-l px-3 py-2 text-center font-medium">
              {t('modelPlaza.table.officialPrice')}{' '}
              <span className="font-normal opacity-70">{t('modelPlaza.table.unitPerMillion')}</span>
            </th>
            <th rowSpan={2} scope="col" className="border-l px-3 py-2 text-right font-medium">
              {t('modelPlaza.table.rate')}
            </th>
          </tr>
          <tr className="border-b">
            <th scope="col" className="border-l bg-primary/5 px-3 py-1.5 text-right font-medium">
              {t('modelPlaza.table.input')}
            </th>
            <th scope="col" className="bg-primary/5 px-3 py-1.5 text-right font-medium">
              {t('modelPlaza.table.output')}
            </th>
            <th scope="col" className="bg-primary/5 px-3 py-1.5 text-right font-medium">
              {t('modelPlaza.table.cache')}
            </th>
            <th scope="col" className="border-l px-3 py-1.5 text-right font-medium">
              {t('modelPlaza.table.input')}
            </th>
            <th scope="col" className="px-3 py-1.5 text-right font-medium">
              {t('modelPlaza.table.output')}
            </th>
            <th scope="col" className="px-3 py-1.5 text-right font-medium">
              {t('modelPlaza.table.cache')}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ model: m, period, key }) => (
            <PricingRow
              key={key}
              m={m}
              period={period}
              platform={platform}
              ctx={ctx}
              effective={effective}
              custom={custom}
              tierHint={tierHint(m)}
              rowHint={rowHint(m)}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function PricingRow({
  m,
  period,
  platform,
  ctx,
  effective,
  custom,
  tierHint,
  rowHint
}: {
  m: PlazaModel
  period: PlazaTimePricingPeriod | null
  platform?: string
  ctx: RateContext
  effective: number
  custom: boolean
  tierHint: string
  rowHint: string
}) {
  const mode = billingMode(m)
  const isToken = mode === BILLING_MODE_TOKEN
  const paid = (v: number | null | undefined) => paidPerMillion(ctx, v, period)
  const tokenTiers = tokenIntervals(m)
  const officialTiers = officialIntervals(m)
  const unitSuffix =
    mode === BILLING_MODE_IMAGE ? t('modelPlaza.table.perUnitImage') : t('modelPlaza.table.perUnitRequest')

  return (
    <tr className="border-b last:border-0 hover:bg-muted/30">
      <td className="px-3 py-2 align-top">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-medium break-all">{m.name}</span>
          {period ? (
            <Pill title={rowHint} className="bg-info/15 text-info">
              {m.time_pricing?.weekdays_only ? (
                <span className="mr-1">{t('modelPlaza.table.timePricingWeekdays')}</span>
              ) : null}
              {formatTimeWindow(period)}
            </Pill>
          ) : null}
          {platform && m.platform !== platform ? (
            <Pill className={cn('border', platformBadgeLightClass(m.platform))}>
              {platformLabel(m.platform)}
            </Pill>
          ) : null}
          {!isToken ? (
            <Pill className="bg-muted text-muted-foreground">
              {mode === BILLING_MODE_IMAGE
                ? t('modelPlaza.table.perImage')
                : t('modelPlaza.table.perRequest')}
            </Pill>
          ) : null}
          {m.long_context_basis === 'marginal' ? (
            <Pill title={t('modelPlaza.table.tierHintMarginal')} className="bg-warning/15 text-warning">
              {t('modelPlaza.table.marginalBadge')}
            </Pill>
          ) : null}
          {reasoningEffortMultipliers(m).map(([effort, multiplier]) => (
            <Pill
              key={effort}
              title={t('modelPlaza.table.reasoningMultiplierHint', { effort, multiplier })}
              className="bg-accent text-accent-foreground"
            >
              <span data-reasoning-effort={effort}>
                {t('modelPlaza.table.reasoningMultiplierBadge', { effort, multiplier })}
              </span>
            </Pill>
          ))}
        </div>
      </td>

      {isToken ? (
        <>
          <td className={cn(NUM, 'border-l bg-primary/5')}>
            {tokenTiers.length
              ? tokenTiers.map((iv, idx) => (
                  <div key={idx}>
                    <TierBadge label={tierLabel(iv)} title={tierHint} />
                    {paid(iv.input_price)}
                  </div>
                ))
              : paid(m.pricing?.input_price)}
          </td>
          <td className={cn(NUM, 'bg-primary/5')}>
            {tokenTiers.length
              ? tokenTiers.map((iv, idx) => (
                  <div key={idx} title={tierHint}>
                    {paid(iv.output_price)}
                  </div>
                ))
              : paid(m.pricing?.output_price)}
          </td>
          <td className={cn(NUM, 'bg-primary/5 text-xs')}>
            {hasTierCachePricing(tokenTiers) ? (
              <TieredCache intervals={tokenTiers} fmt={paid} hint={tierHint} />
            ) : hasCachePricing(m) ? (
              <CacheLine
                fmt={paid}
                write={m.pricing?.cache_write_price}
                write1h={m.pricing?.cache_write_1h_price}
                write12h={m.pricing?.cache_write_12h_price}
                read={m.pricing?.cache_read_price}
              />
            ) : (
              <span className={MUTED}>-</span>
            )}
          </td>
        </>
      ) : (
        <td colSpan={3} className="border-l bg-primary/5 px-3 py-2 align-top">
          {requestIntervals(m).length ? (
            <div className="flex flex-wrap gap-2">
              {requestIntervals(m).map((iv, idx) => (
                <span
                  key={idx}
                  className="rounded-md border bg-card px-2 py-1 font-mono text-[13px] tabular-nums"
                >
                  <span className="mr-1.5 font-sans text-[10px] text-muted-foreground">{tierLabel(iv)}</span>
                  {paidRequestPrice(ctx, m, iv.per_request_price)}
                  <span className="ml-1 font-sans text-[10px] text-muted-foreground">{unitSuffix}</span>
                </span>
              ))}
            </div>
          ) : m.pricing?.per_request_price != null ? (
            <span className="font-mono text-[13px] tabular-nums">
              {paidRequestPrice(ctx, m, m.pricing.per_request_price)}
              <span className="ml-1 font-sans text-[10px] text-muted-foreground">{unitSuffix}</span>
            </span>
          ) : (
            <span className={MUTED}>-</span>
          )}
        </td>
      )}

      <td className={cn(NUM, 'border-l text-muted-foreground')}>
        {officialTiers.length
          ? officialTiers.map((iv, idx) => (
              <div key={idx}>
                <TierBadge label={tierLabel(iv)} title={t('modelPlaza.table.tierHint')} />
                {officialPerMillion(iv.input_price)}
              </div>
            ))
          : officialPerMillion(m.official_pricing?.input_price)}
      </td>
      <td className={cn(NUM, 'text-muted-foreground')}>
        {officialTiers.length
          ? officialTiers.map((iv, idx) => (
              <div key={idx} title={t('modelPlaza.table.tierHint')}>
                {officialPerMillion(iv.output_price)}
              </div>
            ))
          : officialPerMillion(m.official_pricing?.output_price)}
      </td>
      <td className={cn(NUM, 'text-xs text-muted-foreground')}>
        {hasTierCachePricing(officialTiers) ? (
          <TieredCache
            intervals={officialTiers}
            fmt={officialPerMillion}
            hint={t('modelPlaza.table.tierHint')}
          />
        ) : m.official_pricing && hasOfficialCache(m.official_pricing) ? (
          <CacheLine
            fmt={officialPerMillion}
            write={m.official_pricing.cache_write_price}
            write1h={m.official_pricing.cache_write_1h_price}
            write12h={m.official_pricing.cache_write_12h_price}
            read={m.official_pricing.cache_read_price}
          />
        ) : (
          <span>-</span>
        )}
      </td>

      <td className={cn(NUM, 'border-l')}>
        {period ? (
          <span
            title={t('modelPlaza.table.timePricingRateHint', {
              rate: effective,
              multiplier: period.multiplier
            })}
          >
            {periodRate(ctx, period)}x
          </span>
        ) : usesIndependentMediaRate(ctx, m) ? (
          <span>{requestRate(ctx, m)}x</span>
        ) : custom ? (
          <>
            <span className="mr-1 text-muted-foreground line-through">{ctx.rateMultiplier}x</span>
            <span className="font-semibold text-primary">{effective}x</span>
          </>
        ) : (
          <span>{effective}x</span>
        )}
      </td>
    </tr>
  )
}
