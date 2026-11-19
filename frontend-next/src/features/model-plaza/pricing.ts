/** 模型广场定价表的纯逻辑（与 Vue 版 PlazaModelPricingTable 逐条对应），便于单测。 */
import type { UserPricingInterval } from '@/api/channels'
import type { ModelPlazaGroup, PlazaModel, PlazaTimePricingPeriod } from '@/api/modelPlaza'
import {
  BILLING_MODE_IMAGE,
  BILLING_MODE_TOKEN,
  BILLING_MODE_VIDEO,
  REASONING_EFFORT_LEVELS,
  type BillingMode
} from '@/constants/channel'
import { formatScaled, resolveIntervalPrices } from '@/utils/pricing'

export const PER_MILLION = 1_000_000
/** 价格统一保底 2 位小数，更长的有效小数原样保留。 */
export const MIN_DECIMALS = 2

export interface RateContext {
  rateMultiplier: number
  userRateMultiplier?: number | null
  imageRateIndependent?: boolean
  imageRateMultiplier?: number | null
  videoRateIndependent?: boolean
  videoRateMultiplier?: number | null
}

export function billingMode(m: PlazaModel): BillingMode {
  return (m.pricing?.billing_mode || BILLING_MODE_TOKEN) as BillingMode
}

/** 生效倍率 = 用户专属倍率 ?? 分组默认倍率。 */
export function effectiveRateOf(
  g: Pick<ModelPlazaGroup, 'user_rate_multiplier' | 'rate_multiplier'>
): number {
  return g.user_rate_multiplier ?? g.rate_multiplier
}

export function effectiveRate(ctx: RateContext): number {
  return ctx.userRateMultiplier ?? ctx.rateMultiplier
}

export function hasCustomRate(ctx: RateContext): boolean {
  return ctx.userRateMultiplier != null && ctx.userRateMultiplier !== ctx.rateMultiplier
}

/**
 * 展示顺序：
 * 1. token 计费的在前，按图 / 按次计费的沉到末尾（量纲不同，混排无意义）；
 * 2. 组内按官方输出价从高到低，无官方价的排最后；
 * 3. 同价按名称降序（新版本号在前）。
 */
export function sortModels(models: PlazaModel[]): PlazaModel[] {
  return [...models].sort((a, b) => {
    const ta = billingMode(a) === BILLING_MODE_TOKEN
    const tb = billingMode(b) === BILLING_MODE_TOKEN
    if (ta !== tb) return ta ? -1 : 1
    const pa = a.official_pricing?.output_price ?? null
    const pb = b.official_pricing?.output_price ?? null
    if (pa != null && pb != null && pa !== pb) return pb - pa
    if (pa != null && pb == null) return -1
    if (pa == null && pb != null) return 1
    return b.name.localeCompare(a.name)
  })
}

export function timePeriods(m: PlazaModel): PlazaTimePricingPeriod[] {
  return m.time_pricing?.periods ?? []
}

export interface PlazaRow {
  model: PlazaModel
  period: PlazaTimePricingPeriod | null
  key: string
}

/** 表格行：每个模型一行标准价；配置了分时倍率的模型再按时段各加一行。 */
export function buildRows(models: PlazaModel[]): PlazaRow[] {
  return sortModels(models).flatMap((m) => {
    const base: PlazaRow = { model: m, period: null, key: `${m.platform}:${m.name}` }
    const periodRows = timePeriods(m).map<PlazaRow>((p, idx) => ({
      model: m,
      period: p,
      key: `${m.platform}:${m.name}:${idx}`
    }))
    return [base, ...periodRows]
  })
}

/** 时段行的生效倍率 = 生效倍率 × 时段倍率（去掉浮点噪声）。 */
export function periodRate(ctx: RateContext, period: PlazaTimePricingPeriod): number {
  return Math.round(effectiveRate(ctx) * period.multiplier * 1000) / 1000
}

/** 实付价 = 渠道单价 × 生效倍率（时段行再乘时段倍率），按 $/1M token 展示。 */
export function paidPerMillion(
  ctx: RateContext,
  value: number | null | undefined,
  period: PlazaTimePricingPeriod | null = null
): string {
  if (value == null) return '-'
  const rate = period ? periodRate(ctx, period) : effectiveRate(ctx)
  return formatScaled(value * rate, PER_MILLION, MIN_DECIMALS)
}

/** 图片和视频分别使用对应的独立倍率开关。 */
export function usesIndependentMediaRate(ctx: RateContext, m: PlazaModel): boolean {
  const mode = billingMode(m)
  return (
    (mode === BILLING_MODE_IMAGE && ctx.imageRateIndependent === true) ||
    (mode === BILLING_MODE_VIDEO && ctx.videoRateIndependent === true)
  )
}

/** 非 token 行的生效倍率，图片和视频可分别覆盖通用倍率。 */
export function requestRate(ctx: RateContext, m: PlazaModel): number {
  const mode = billingMode(m)
  if (mode === BILLING_MODE_VIDEO && ctx.videoRateIndependent === true)
    return Math.max(0, ctx.videoRateMultiplier ?? 1)
  return mode === BILLING_MODE_IMAGE && ctx.imageRateIndependent === true
    ? (ctx.imageRateMultiplier ?? 1)
    : effectiveRate(ctx)
}

/** 非 token 单价乘该行生效倍率，不换算为每百万 token。 */
export function paidRequestPrice(ctx: RateContext, m: PlazaModel, value: number | null | undefined): string {
  if (value == null) return '-'
  return formatScaled(value * requestRate(ctx, m), 1, MIN_DECIMALS)
}

/** 官方参考价不乘倍率。 */
export function officialPerMillion(value: number | null | undefined): string {
  if (value == null) return '-'
  return formatScaled(value, PER_MILLION, MIN_DECIMALS)
}

export function reasoningEffortMultipliers(m: PlazaModel): [string, number][] {
  const multipliers = m.pricing?.reasoning_effort_multipliers
  return REASONING_EFFORT_LEVELS.flatMap((effort) => {
    const multiplier = multipliers?.[effort]
    return typeof multiplier === 'number' && Number.isFinite(multiplier) && multiplier > 0
      ? [[effort, multiplier] as [string, number]]
      : []
  })
}

export function hasCachePricing(m: PlazaModel): boolean {
  const p = m.pricing
  return (
    p?.cache_write_price != null ||
    p?.cache_write_1h_price != null ||
    p?.cache_write_12h_price != null ||
    p?.cache_read_price != null
  )
}

export function hasOfficialCache(o: NonNullable<PlazaModel['official_pricing']>): boolean {
  return (
    o.cache_write_price != null ||
    o.cache_read_price != null ||
    o.cache_write_1h_price != null ||
    o.cache_write_12h_price != null
  )
}

/** 上下文档位按下限升序展示（后端已升序，此处兜底）。 */
export function sortByContext(intervals: UserPricingInterval[]): UserPricingInterval[] {
  return [...intervals].sort((a, b) => a.min_tokens - b.min_tokens)
}

/** token 模式的阶梯定价（内联进输入 / 输出 / 缓存列）。 */
export function tokenIntervals(m: PlazaModel): UserPricingInterval[] {
  return sortByContext(m.pricing?.intervals ?? []).map((iv) => resolveIntervalPrices(iv, m.pricing!))
}

/** 官方阶梯（后端按目录规则合成，不受分组开关影响）。 */
export function officialIntervals(m: PlazaModel): UserPricingInterval[] {
  return sortByContext(m.official_pricing?.intervals ?? [])
}

/** 任一档带缓存价才按档渲染缓存列；否则沿用平价的写入 / 读取两行。 */
export function hasTierCachePricing(intervals: UserPricingInterval[]): boolean {
  return intervals.some(
    (iv) =>
      iv.cache_write_price != null ||
      iv.cache_write_1h_price != null ||
      iv.cache_write_12h_price != null ||
      iv.cache_read_price != null ||
      iv.cache_write_multiplier != null ||
      iv.cache_read_multiplier != null
  )
}

export function intervalHasCache(iv: UserPricingInterval): boolean {
  return (
    iv.cache_write_price != null ||
    iv.cache_write_1h_price != null ||
    iv.cache_write_12h_price != null ||
    iv.cache_read_price != null
  )
}

/** 按次 / 按图模式的阶梯定价（仅保留配了按次价的档位）。 */
export function requestIntervals(m: PlazaModel): UserPricingInterval[] {
  return (m.pricing?.intervals ?? []).filter((iv) => iv.per_request_price != null)
}

function trimZero(n: number): string {
  return String(Math.round(n * 100) / 100)
}

export function formatTokenCount(n: number): string {
  if (n >= 1_000_000) return `${trimZero(n / 1_000_000)}M`
  if (n >= 1_000) return `${trimZero(n / 1_000)}K`
  return String(n)
}

/** 档位标签：优先 tier_label，否则「≤上限」/ 末档「>下限」。 */
export function tierLabel(iv: UserPricingInterval): string {
  if (iv.tier_label) return iv.tier_label
  const { min_tokens: min, max_tokens: max } = iv
  return max == null ? `>${formatTokenCount(min)}` : `≤${formatTokenCount(max)}`
}

/** “00:30–08:30”；整分钟的 HH:mm:ss 省略秒。 */
export function formatTimeWindow(p: PlazaTimePricingPeriod): string {
  const clock = (v: string) => v.replace(/^(\d{2}:\d{2}):00$/, '$1')
  return `${clock(p.start_time)}–${clock(p.end_time)}`
}

// ───────── 筛选（ModelPlazaContent / PlazaFilterBar）─────────

export interface GroupOption {
  id: number
  platform: string
  rate: number
}
export interface PlazaFilters {
  platform: string
  groupId: number | 'all'
  rate: number | 'all'
  search: string
}

/** 三个维度互为约束：某选项可点 ⟺ 在其他两维当前选择下仍有分组命中。 */
export function platformEnabled(groups: GroupOption[], f: PlazaFilters, p: string): boolean {
  return groups.some(
    (g) =>
      g.platform === p &&
      (f.groupId === 'all' || g.id === f.groupId) &&
      (f.rate === 'all' || g.rate === f.rate)
  )
}
export function groupEnabled(f: PlazaFilters, g: Pick<GroupOption, 'platform' | 'rate'>): boolean {
  return (f.platform === 'all' || g.platform === f.platform) && (f.rate === 'all' || g.rate === f.rate)
}
export function rateEnabled(groups: GroupOption[], f: PlazaFilters, r: number): boolean {
  return groups.some(
    (g) =>
      g.rate === r &&
      (f.platform === 'all' || g.platform === f.platform) &&
      (f.groupId === 'all' || g.id === f.groupId)
  )
}

export function filterGroups(groups: ModelPlazaGroup[], f: PlazaFilters): ModelPlazaGroup[] {
  let result = groups
  if (f.platform !== 'all') result = result.filter((g) => g.platform === f.platform)
  if (f.groupId !== 'all') result = result.filter((g) => g.id === f.groupId)
  if (f.rate !== 'all') result = result.filter((g) => effectiveRateOf(g) === f.rate)
  // 模型名搜索：分组内只留命中的模型，整组无命中则隐藏该分组
  const q = f.search.trim().toLowerCase()
  if (q) {
    result = result
      .map((g) => ({ ...g, models: g.models.filter((m) => m.name.toLowerCase().includes(q)) }))
      .filter((g) => g.models.length > 0)
  }
  // 专属倍率会改变生效值，不能只依赖后端按默认倍率的排序
  return [...result].sort((a, b) => effectiveRateOf(a) - effectiveRateOf(b) || a.name.localeCompare(b.name))
}
