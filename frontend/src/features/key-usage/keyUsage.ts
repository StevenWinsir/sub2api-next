/** /key-usage 的纯逻辑：日期参数、环形进度、详情行、统计单元（与 Vue 版 KeyUsageView 逐条对应）。 */
import { formatDateLocalInput } from '@/utils/format'

type Translate = (key: string, options?: Record<string, unknown>) => string

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type UsageResult = any

export type DateRangeKey = 'today' | '7d' | '30d' | 'custom'
export type DailyUsageDays = 7 | 30 | 90

export function getBrowserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

/** 构造 /v1/usage 的查询串。today 取当前本地日期；自定义范围只在起止都填写时才携带。 */
export function buildDateParams(
  range: DateRangeKey,
  custom: { start: string; end: string },
  days: DailyUsageDays,
  now: Date = new Date(),
  timezone: string = getBrowserTimezone()
): string {
  const params = new URLSearchParams()
  if (range === 'custom') {
    if (custom.start && custom.end) {
      params.set('start_date', custom.start)
      params.set('end_date', custom.end)
    }
  } else {
    const end = formatDateLocalInput(now)
    const back = range === '7d' ? 7 : range === '30d' ? 30 : 0
    const start = range === 'today' ? end : formatDateLocalInput(new Date(now.getTime() - back * 86400000))
    params.set('start_date', start)
    params.set('end_date', end)
  }
  params.set('days', String(days))
  params.set('timezone', timezone)
  return params.toString()
}

export function usd(value: number | null | undefined): string {
  if (value == null || value < 0) return '-'
  return '$' + Number(value).toFixed(2)
}

export function fmtNum(val: number | null | undefined): string {
  if (val == null) return '-'
  return val.toLocaleString()
}

export function formatDate(iso: string | null | undefined, locale: string): string {
  if (!iso) return '-'
  return new Date(iso).toLocaleDateString(locale === 'zh' ? 'zh-CN' : 'en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })
}

export function formatResetTime(resetAt: string | null | undefined, now: Date, t: Translate): string {
  if (!resetAt) return ''
  const diff = new Date(resetAt).getTime() - now.getTime()
  if (diff <= 0) return t('keyUsage.resetNow')
  const days = Math.floor(diff / 86400000)
  const hours = Math.floor((diff % 86400000) / 3600000)
  const mins = Math.floor((diff % 3600000) / 60000)
  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${mins}m`
  return `${mins}m`
}

export function usageColor(pct: number): 'danger' | 'warning' | 'success' {
  if (pct > 90) return 'danger'
  if (pct > 70) return 'warning'
  return 'success'
}

export interface StatusInfo {
  label: string
  statusText: string
  isActive: boolean
}

export function buildStatusInfo(data: UsageResult, t: Translate): StatusInfo | null {
  if (!data) return null
  if (data.mode === 'quota_limited') {
    const isValid = data.isValid !== false
    const statusMap: Record<string, string> = {
      active: 'Active',
      quota_exhausted: 'Quota Exhausted',
      expired: 'Expired'
    }
    return {
      label: t('keyUsage.quotaMode'),
      statusText: statusMap[data.status] || data.status || 'Unknown',
      isActive: isValid && data.status === 'active'
    }
  }
  return { label: data.planName || t('keyUsage.walletBalance'), statusText: 'Active', isActive: true }
}

export interface RingItem {
  title: string
  pct: number
  amount: string
  isBalance?: boolean
  iconType: 'clock' | 'calendar' | 'dollar'
  resetAt?: string | null
}

const pctOf = (used: number, limit: number) =>
  limit > 0 ? Math.min(Math.round((used / limit) * 100), 100) : 0

export function buildRingItems(data: UsageResult, t: Translate): RingItem[] {
  if (!data) return []
  const items: RingItem[] = []
  if (data.mode === 'quota_limited') {
    if (data.quota) {
      items.push({
        title: t('keyUsage.totalQuota'),
        pct: pctOf(data.quota.used, data.quota.limit),
        amount: `${usd(data.quota.used)} / ${usd(data.quota.limit)}`,
        iconType: 'dollar'
      })
    }
    if (data.rate_limits) {
      const labels: Record<string, string> = {
        '5h': t('keyUsage.limit5h'),
        '1d': t('keyUsage.limitDaily'),
        '7d': t('keyUsage.limit7d')
      }
      const icons: Record<string, 'clock' | 'calendar'> = {
        '5h': 'clock',
        '1d': 'calendar',
        '7d': 'calendar'
      }
      for (const rl of data.rate_limits) {
        items.push({
          title: labels[rl.window] || rl.window,
          pct: pctOf(rl.used, rl.limit),
          amount: `${usd(rl.used)} / ${usd(rl.limit)}`,
          iconType: icons[rl.window] || 'clock',
          resetAt: rl.reset_at
        })
      }
    }
  } else {
    if (data.subscription) {
      const sub = data.subscription
      const limits = [
        { label: t('keyUsage.limitDaily'), usage: sub.daily_usage_usd, limit: sub.daily_limit_usd },
        { label: t('keyUsage.limitWeekly'), usage: sub.weekly_usage_usd, limit: sub.weekly_limit_usd },
        { label: t('keyUsage.limitMonthly'), usage: sub.monthly_usage_usd, limit: sub.monthly_limit_usd }
      ]
      for (const l of limits) {
        if (l.limit != null && l.limit > 0) {
          items.push({
            title: l.label,
            pct: pctOf(l.usage, l.limit),
            amount: `${usd(l.usage)} / ${usd(l.limit)}`,
            iconType: 'calendar'
          })
        }
      }
    }
    if (!data.subscription && data.balance != null) {
      items.push({
        title: t('keyUsage.walletBalance'),
        pct: 0,
        amount: usd(data.balance),
        isBalance: true,
        iconType: 'dollar'
      })
    }
  }
  return items
}

export type DetailIcon = 'shield' | 'calendar' | 'dollar' | 'check'
export type DetailTone = 'emerald' | 'amber' | 'primary' | 'indigo'

export interface DetailRow {
  icon: DetailIcon
  tone: DetailTone
  label: string
  value: string
  /** 值的状态色；缺省为默认文字色。 */
  valueTone?: 'danger' | 'warning' | 'success'
}

export function buildDetailRows(
  data: UsageResult,
  opts: { t: Translate; locale: string; subscriptionEnabled: boolean; now: Date }
): DetailRow[] {
  if (!data) return []
  const { t, locale, subscriptionEnabled, now } = opts
  const zh = locale === 'zh'
  const rows: DetailRow[] = []
  if (data.mode === 'quota_limited') {
    if (data.quota) {
      rows.push({
        icon: 'shield',
        tone: 'emerald',
        label: t('keyUsage.remainingQuota'),
        value: usd(data.quota.remaining),
        valueTone:
          data.quota.remaining <= 0
            ? 'danger'
            : data.quota.remaining < data.quota.limit * 0.1
              ? 'warning'
              : 'success'
      })
    }
    if (data.expires_at) {
      const daysLeft = data.days_until_expiry
      let expiry = formatDate(data.expires_at, locale)
      if (daysLeft != null) {
        expiry +=
          daysLeft > 0
            ? ` ${t('keyUsage.daysLeft', { days: daysLeft })}`
            : daysLeft === 0
              ? ` ${t('keyUsage.todayExpires')}`
              : ''
      }
      rows.push({ icon: 'calendar', tone: 'amber', label: t('keyUsage.expiresAt'), value: expiry })
    }
    if (data.rate_limits) {
      const windowMap: Record<string, string> = { '5h': '5H', '1d': zh ? '日' : 'D', '7d': '7D' }
      for (const rl of data.rate_limits) {
        const pct = rl.limit > 0 ? (rl.used / rl.limit) * 100 : 0
        let value = `${usd(rl.used)} / ${usd(rl.limit)}`
        const reset = formatResetTime(rl.reset_at, now, t)
        if (reset) value += ` (⟳ ${reset})`
        rows.push({
          icon: 'dollar',
          tone: 'primary',
          label: `${t('keyUsage.usedQuota')} (${windowMap[rl.window] || rl.window})`,
          value,
          valueTone: usageColor(pct)
        })
      }
    }
  } else {
    rows.push({
      icon: 'check',
      tone: 'emerald',
      // 订阅功能关闭后这一行只会是「钱包余额」，标签改用不带「订阅」字样的「计费方式」
      label: subscriptionEnabled ? t('keyUsage.subscriptionType') : t('keyUsage.billingType'),
      value: data.planName || t('keyUsage.walletBalance')
    })
    if (data.subscription) {
      const sub = data.subscription
      const periods: Array<[number, number, string, DetailTone]> = [
        [sub.daily_usage_usd, sub.daily_limit_usd, zh ? '日' : 'D', 'primary'],
        [sub.weekly_usage_usd, sub.weekly_limit_usd, zh ? '周' : 'W', 'indigo'],
        [sub.monthly_usage_usd, sub.monthly_limit_usd, zh ? '月' : 'M', 'emerald']
      ]
      for (const [used, limit, tag, tone] of periods) {
        if (limit > 0) {
          rows.push({
            icon: 'dollar',
            tone,
            label: `${t('keyUsage.usedQuota')} (${tag})`,
            value: `${usd(used)} / ${usd(limit)}`,
            valueTone: usageColor((used / limit) * 100)
          })
        }
      }
      if (sub.expires_at) {
        rows.push({
          icon: 'calendar',
          tone: 'amber',
          label: t('keyUsage.subscriptionExpires'),
          value: formatDate(sub.expires_at, locale)
        })
      }
    }
    rows.push({
      icon: 'shield',
      tone: 'emerald',
      label: t('keyUsage.remainingQuota'),
      value: data.remaining != null ? usd(data.remaining) : '-',
      valueTone:
        data.remaining != null
          ? data.remaining <= 0
            ? 'danger'
            : data.remaining < 10
              ? 'warning'
              : 'success'
          : undefined
    })
  }
  return rows
}

export interface StatCell {
  label: string
  value: string
}

export function buildUsageStatCells(data: UsageResult, t: Translate): StatCell[] {
  const usage = data?.usage
  if (!usage) return []
  const today = usage.today || {}
  const total = usage.total || {}
  return [
    { label: t('keyUsage.todayRequests'), value: fmtNum(today.requests) },
    { label: t('keyUsage.todayInputTokens'), value: fmtNum(today.input_tokens) },
    { label: t('keyUsage.todayOutputTokens'), value: fmtNum(today.output_tokens) },
    { label: t('keyUsage.todayTokens'), value: fmtNum(today.total_tokens) },
    { label: t('keyUsage.todayCacheCreation'), value: fmtNum(today.cache_creation_tokens) },
    { label: t('keyUsage.todayCacheRead'), value: fmtNum(today.cache_read_tokens) },
    { label: t('keyUsage.todayCost'), value: usd(today.actual_cost) },
    { label: t('keyUsage.rpmTpm'), value: `${usage.rpm || 0} / ${usage.tpm || 0}` },
    { label: t('keyUsage.totalRequests'), value: fmtNum(total.requests) },
    { label: t('keyUsage.totalInputTokens'), value: fmtNum(total.input_tokens) },
    { label: t('keyUsage.totalOutputTokens'), value: fmtNum(total.output_tokens) },
    { label: t('keyUsage.totalTokensLabel'), value: fmtNum(total.total_tokens) },
    { label: t('keyUsage.totalCacheCreation'), value: fmtNum(total.cache_creation_tokens) },
    { label: t('keyUsage.totalCacheRead'), value: fmtNum(total.cache_read_tokens) },
    { label: t('keyUsage.totalCost'), value: usd(total.actual_cost) },
    {
      label: t('keyUsage.avgDuration'),
      value: usage.average_duration_ms ? `${Math.round(usage.average_duration_ms)} ms` : '-'
    }
  ]
}
