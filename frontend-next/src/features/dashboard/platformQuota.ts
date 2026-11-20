/** 仪表盘平台拆分卡片的融合逻辑（对应 UserDashboardStats.vue 的 computed）。 */
import type { PlatformDashboardStats, UserDashboardStats } from '@/api/usage'
import type { PlatformQuotaItem } from '@/types'

export interface FusedPlatformCard {
  platform: string
  total_actual_cost: number
  today_actual_cost: number
  total_requests: number
  total_tokens: number
  isOther?: boolean
  quota?: PlatformQuotaItem
}

export const PLATFORM_LABELS: Record<string, string> = {
  anthropic: 'Claude',
  openai: 'OpenAI',
  gemini: 'Gemini',
  antigravity: 'Antigravity',
  grok: 'Grok',
  kimi: 'Kimi',
  zhipu: 'Zhipu GLM',
  deepseek: 'DeepSeek',
  minimax: 'MiniMax',
  typesafe: 'TypeSafe / Jev'
}

const PLATFORM_ORDER = ['anthropic', 'openai', 'gemini', 'antigravity', 'grok', 'typesafe']
const OTHER_THRESHOLD = 0.0001

export function hasAnyLimit(q: PlatformQuotaItem | undefined): boolean {
  if (!q) return false
  return q.daily_limit_usd != null || q.weekly_limit_usd != null || q.monthly_limit_usd != null
}

export function calcPercent(usage: number, limit: number): number {
  if (!limit || limit <= 0) return 0
  return Math.min(100, Math.max(0, Math.round((usage / limit) * 100)))
}

export function quotaTone(p: number): 'destructive' | 'warning' | 'success' {
  if (p >= 95) return 'destructive'
  if (p >= 75) return 'warning'
  return 'success'
}

export function buildPlatformCards(
  stats: Pick<UserDashboardStats, 'by_platform' | 'total_actual_cost' | 'today_actual_cost'>,
  platformQuotas: PlatformQuotaItem[] | null | undefined
): FusedPlatformCard[] {
  const byPlat = new Map<string, PlatformDashboardStats>()
  for (const item of stats.by_platform ?? []) byPlat.set(item.platform, item)
  const byQuota = new Map<string, PlatformQuotaItem>()
  for (const q of platformQuotas ?? []) byQuota.set(q.platform, q)

  // 卡片集合 = 有用量的平台 ∪ 至少配置了一档限额的平台
  const platforms = new Set<string>(byPlat.keys())
  for (const [platform, q] of byQuota) if (hasAnyLimit(q)) platforms.add(platform)

  const cards: FusedPlatformCard[] = []
  for (const p of platforms) {
    const stat = byPlat.get(p)
    cards.push({
      platform: p,
      total_actual_cost: stat?.total_actual_cost ?? 0,
      today_actual_cost: stat?.today_actual_cost ?? 0,
      total_requests: stat?.total_requests ?? 0,
      total_tokens: stat?.total_tokens ?? 0,
      quota: byQuota.get(p)
    })
  }
  cards.sort((a, b) => {
    const ai = PLATFORM_ORDER.indexOf(a.platform)
    const bi = PLATFORM_ORDER.indexOf(b.platform)
    if (ai === -1 && bi === -1) return a.platform.localeCompare(b.platform)
    if (ai === -1) return 1
    if (bi === -1) return -1
    return ai - bi
  })

  // “其他”补差：各平台之和 < 总值时显式展示差额，避免总值与拆分对不上
  const sumTotal = cards.reduce((s, c) => s + c.total_actual_cost, 0)
  const sumToday = cards.reduce((s, c) => s + c.today_actual_cost, 0)
  const diffTotal = Math.max(0, (stats.total_actual_cost ?? 0) - sumTotal)
  const diffToday = Math.max(0, (stats.today_actual_cost ?? 0) - sumToday)
  if (diffTotal > OTHER_THRESHOLD || diffToday > OTHER_THRESHOLD) {
    cards.push({
      platform: '__other__',
      total_actual_cost: diffTotal,
      today_actual_cost: diffToday,
      total_requests: 0,
      total_tokens: 0,
      isOther: true
    })
  }
  return cards
}
