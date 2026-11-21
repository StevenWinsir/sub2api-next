/**
 * 渠道定价表单的纯逻辑：价格单位换算（后端 per-token ⇄ 界面 $/百万 Token）与校验。
 * 与 Vue 版 components/admin/channel/types.ts 的换算保持一致（toPrecision(10) 消除浮点误差）。
 */
import type { BillingMode, ChannelModelPricing } from '@/api/admin/channels'

const MTOK = 1_000_000

export function toNullableNumber(val: number | string | null | undefined): number | null {
  if (val === null || val === undefined || val === '') return null
  const num = Number(val)
  return Number.isNaN(num) ? null : num
}

/** 界面值（$/MTok）→ 后端值（per-token）。 */
export function mTokToPerToken(val: number | string | null | undefined): number | null {
  const num = toNullableNumber(val)
  return num === null ? null : parseFloat((num / MTOK).toPrecision(10))
}

/** 后端值（per-token）→ 界面值（$/MTok）。 */
export function perTokenToMTok(val: number | null | undefined): number | null {
  if (val === null || val === undefined) return null
  return parseFloat((val * MTOK).toPrecision(10))
}

export interface PricingDraft {
  platform: string
  modelsText: string
  billingMode: BillingMode
  input: string
  output: string
  cacheWrite: string
  cacheRead: string
  imageInput: string
  imageOutput: string
  perRequest: string
  /** 保留的原始条目：区间 / 时间段 / 倍率等本表单不编辑的字段原样回传，避免误清空。 */
  base: ChannelModelPricing | null
}

const text = (v: number | null | undefined) => (v === null || v === undefined ? '' : String(v))

export function pricingToDraft(p: ChannelModelPricing): PricingDraft {
  return {
    platform: p.platform,
    modelsText: p.models.join('\n'),
    billingMode: p.billing_mode,
    input: text(perTokenToMTok(p.input_price)),
    output: text(perTokenToMTok(p.output_price)),
    cacheWrite: text(perTokenToMTok(p.cache_write_price)),
    cacheRead: text(perTokenToMTok(p.cache_read_price)),
    imageInput: text(perTokenToMTok(p.image_input_price)),
    imageOutput: text(perTokenToMTok(p.image_output_price)),
    perRequest: text(p.per_request_price),
    base: p
  }
}

export function emptyDraft(platform = 'anthropic'): PricingDraft {
  return {
    platform,
    modelsText: '',
    billingMode: 'token',
    input: '',
    output: '',
    cacheWrite: '',
    cacheRead: '',
    imageInput: '',
    imageOutput: '',
    perRequest: '',
    base: null
  }
}

export function parseModels(raw: string): string[] {
  return Array.from(
    new Set(
      raw
        .split(/[\n,]/)
        .map((s) => s.trim())
        .filter(Boolean)
    )
  )
}

/** 草稿 → API 条目；以原始条目为底，仅覆盖本表单编辑的字段。 */
export function draftToPricing(d: PricingDraft): ChannelModelPricing {
  const base: ChannelModelPricing = d.base ?? {
    platform: d.platform,
    models: [],
    billing_mode: d.billingMode,
    input_price: null,
    output_price: null,
    cache_write_price: null,
    cache_read_price: null,
    image_input_price: null,
    image_output_price: null,
    per_request_price: null,
    intervals: [],
    time_pricing: null
  }
  return {
    ...base,
    platform: d.platform,
    models: parseModels(d.modelsText),
    billing_mode: d.billingMode,
    input_price: mTokToPerToken(d.input),
    output_price: mTokToPerToken(d.output),
    cache_write_price: mTokToPerToken(d.cacheWrite),
    cache_read_price: mTokToPerToken(d.cacheRead),
    image_input_price: mTokToPerToken(d.imageInput),
    image_output_price: mTokToPerToken(d.imageOutput),
    per_request_price: toNullableNumber(d.perRequest)
  }
}

/** 校验：模型不能为空、同一平台内不能重复；按次 / 图片 / 视频模式需要单次价格（有区间时除外）。返回 i18n 键与参数。 */
export function validateDrafts(
  drafts: PricingDraft[]
): { key: string; params?: Record<string, unknown> } | null {
  const seen = new Map<string, string>()
  for (const d of drafts) {
    const models = parseModels(d.modelsText)
    if (models.length === 0) return { key: 'admin.channels.emptyModelsInPricing' }
    for (const m of models) {
      const k = `${d.platform}::${m.toLowerCase()}`
      if (seen.has(k))
        return { key: 'admin.channels.duplicateModels', params: { model: m, platform: d.platform } }
      seen.set(k, m)
    }
    if (
      d.billingMode !== 'token' &&
      toNullableNumber(d.perRequest) === null &&
      (d.base?.intervals?.length ?? 0) === 0
    ) {
      return { key: 'admin.channels.form.perRequestPriceRequired' }
    }
  }
  return null
}
