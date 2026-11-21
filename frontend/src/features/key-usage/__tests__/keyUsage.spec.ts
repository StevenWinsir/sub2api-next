import { describe, expect, it } from 'vitest'
import {
  buildDateParams,
  buildDetailRows,
  buildRingItems,
  buildStatusInfo,
  buildUsageStatCells,
  formatResetTime,
  fmtNum,
  usageColor,
  usd
} from '../keyUsage'

const t = (key: string, options?: Record<string, unknown>) =>
  options ? `${key}:${JSON.stringify(options)}` : key

describe('buildDateParams', () => {
  const now = new Date(2026, 4, 19, 23, 59, 30) // 本地时间，临近午夜
  it('today queries the current local calendar date', () => {
    const q = new URLSearchParams(buildDateParams('today', { start: '', end: '' }, 30, now, 'Asia/Shanghai'))
    expect(q.get('start_date')).toBe('2026-05-19')
    expect(q.get('end_date')).toBe('2026-05-19')
    expect(q.get('days')).toBe('30')
    expect(q.get('timezone')).toBe('Asia/Shanghai')
  })

  it('7d / 30d go back by whole days', () => {
    expect(
      new URLSearchParams(buildDateParams('7d', { start: '', end: '' }, 7, now, 'UTC')).get('start_date')
    ).toBe('2026-05-12')
    expect(
      new URLSearchParams(buildDateParams('30d', { start: '', end: '' }, 90, now, 'UTC')).get('start_date')
    ).toBe('2026-04-19')
  })

  it('custom range is only sent when both ends are filled', () => {
    const full = new URLSearchParams(
      buildDateParams('custom', { start: '2026-01-01', end: '2026-01-31' }, 30, now, 'UTC')
    )
    expect(full.get('start_date')).toBe('2026-01-01')
    expect(full.get('end_date')).toBe('2026-01-31')
    const partial = new URLSearchParams(
      buildDateParams('custom', { start: '2026-01-01', end: '' }, 30, now, 'UTC')
    )
    expect(partial.has('start_date')).toBe(false)
    expect(partial.get('days')).toBe('30')
  })
})

describe('formatters', () => {
  it('usd hides negative / missing values', () => {
    expect(usd(1.005)).toBe('$1.00')
    expect(usd(0)).toBe('$0.00')
    expect(usd(-1)).toBe('-')
    expect(usd(null)).toBe('-')
  })
  it('fmtNum handles missing', () => {
    expect(fmtNum(null)).toBe('-')
    expect(fmtNum(1200)).toBe((1200).toLocaleString())
  })
  it('usage colour thresholds', () => {
    expect(usageColor(50)).toBe('success')
    expect(usageColor(71)).toBe('warning')
    expect(usageColor(91)).toBe('danger')
  })
  it('formatResetTime', () => {
    const now = new Date('2026-01-01T00:00:00Z')
    expect(formatResetTime(null, now, t)).toBe('')
    expect(formatResetTime('2025-12-31T00:00:00Z', now, t)).toBe('keyUsage.resetNow')
    expect(formatResetTime('2026-01-01T00:45:00Z', now, t)).toBe('45m')
    expect(formatResetTime('2026-01-01T03:10:00Z', now, t)).toBe('3h 10m')
    expect(formatResetTime('2026-01-03T05:00:00Z', now, t)).toBe('2d 5h')
  })
})

const quotaData = {
  mode: 'quota_limited',
  isValid: true,
  status: 'active',
  quota: { limit: 10, used: 1, remaining: 9 },
  rate_limits: [{ window: '5h', used: 5, limit: 10, reset_at: '2026-01-01T01:00:00Z' }],
  expires_at: '2026-02-01T00:00:00Z',
  days_until_expiry: 0,
  usage: { today: { requests: 1 }, total: { requests: 12, actual_cost: 0.12 }, rpm: 0, tpm: 0 }
}

describe('quota-limited keys', () => {
  it('status reflects validity', () => {
    expect(buildStatusInfo(quotaData, t)).toMatchObject({ statusText: 'Active', isActive: true })
    expect(buildStatusInfo({ ...quotaData, status: 'expired' }, t)).toMatchObject({
      statusText: 'Expired',
      isActive: false
    })
    expect(buildStatusInfo({ ...quotaData, isValid: false }, t)?.isActive).toBe(false)
  })

  it('builds rings for total quota and each rate-limit window', () => {
    const rings = buildRingItems(quotaData, t)
    expect(rings.map((r) => [r.title, r.pct, r.amount])).toEqual([
      ['keyUsage.totalQuota', 10, '$1.00 / $10.00'],
      ['keyUsage.limit5h', 50, '$5.00 / $10.00']
    ])
    expect(rings[1].iconType).toBe('clock')
  })

  it('builds detail rows including expiry hint and reset time', () => {
    const rows = buildDetailRows(quotaData, {
      t,
      locale: 'en',
      subscriptionEnabled: true,
      now: new Date('2026-01-01T00:00:00Z')
    })
    expect(rows[0]).toMatchObject({ label: 'keyUsage.remainingQuota', value: '$9.00', valueTone: 'success' })
    expect(rows[1].value).toContain('keyUsage.todayExpires')
    expect(rows[2].value).toBe('$5.00 / $10.00 (⟳ 1h 0m)')
  })

  it('warns when the remaining quota drops below 10%', () => {
    const rows = buildDetailRows(
      { ...quotaData, quota: { limit: 10, used: 9.5, remaining: 0.5 } },
      { t, locale: 'en', subscriptionEnabled: true, now: new Date() }
    )
    expect(rows[0].valueTone).toBe('warning')
    const exhausted = buildDetailRows(
      { ...quotaData, quota: { limit: 10, used: 10, remaining: 0 } },
      { t, locale: 'en', subscriptionEnabled: true, now: new Date() }
    )
    expect(exhausted[0].valueTone).toBe('danger')
  })
})

describe('wallet / subscription keys', () => {
  const wallet = { mode: 'unrestricted', planName: '', balance: 12.5, remaining: 12.5 }
  it('shows a balance ring when there is no subscription', () => {
    expect(buildRingItems(wallet, t)).toEqual([
      { title: 'keyUsage.walletBalance', pct: 0, amount: '$12.50', isBalance: true, iconType: 'dollar' }
    ])
  })

  it('labels the plan row by whether subscriptions are enabled', () => {
    const on = buildDetailRows(wallet, { t, locale: 'en', subscriptionEnabled: true, now: new Date() })
    const off = buildDetailRows(wallet, { t, locale: 'en', subscriptionEnabled: false, now: new Date() })
    expect(on[0].label).toBe('keyUsage.subscriptionType')
    expect(off[0].label).toBe('keyUsage.billingType')
  })

  it('renders subscription limits only when positive', () => {
    const data = {
      mode: 'unrestricted',
      planName: 'Pro',
      remaining: 5,
      subscription: {
        daily_limit_usd: 10,
        daily_usage_usd: 9.5,
        weekly_limit_usd: 0,
        weekly_usage_usd: 0,
        monthly_limit_usd: 100,
        monthly_usage_usd: 10
      }
    }
    const rings = buildRingItems(data, t)
    expect(rings.map((r) => r.title)).toEqual(['keyUsage.limitDaily', 'keyUsage.limitMonthly'])
    const rows = buildDetailRows(data, { t, locale: 'zh', subscriptionEnabled: true, now: new Date() })
    expect(rows.map((r) => r.label)).toEqual([
      'keyUsage.subscriptionType',
      'keyUsage.usedQuota (日)',
      'keyUsage.usedQuota (月)',
      'keyUsage.remainingQuota'
    ])
    expect(rows[1].valueTone).toBe('danger')
  })
})

describe('usage stat cells', () => {
  it('returns 16 cells and tolerates missing sections', () => {
    expect(buildUsageStatCells(quotaData, t)).toHaveLength(16)
    expect(buildUsageStatCells({}, t)).toEqual([])
    const cells = buildUsageStatCells({ usage: { average_duration_ms: 120.4 } }, t)
    expect(cells.at(-1)?.value).toBe('120 ms')
    expect(cells.find((c) => c.label === 'keyUsage.rpmTpm')?.value).toBe('0 / 0')
  })
})
