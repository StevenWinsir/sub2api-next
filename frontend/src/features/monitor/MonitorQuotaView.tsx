/** 渠道监控的配额快照渲染（管理端监控列表 + 用户端监控卡片共用）：套餐档位 / 用量窗口进度条 / 多币种余额 / 错误。 */
import type { MonitorQuotaSnapshot, MonitorQuotaTier } from '@/api/admin/channelMonitor'
import { Progress } from '@/components/ui/progress'
import { t } from '@/i18n'
import { cn } from '@/lib/utils'

const WINDOW_KEYS: Record<string, string> = {
  '5h': 'monitorCommon.quota.windows.5h',
  '7d': 'monitorCommon.quota.windows.7d',
  '7d-sonnet': 'monitorCommon.quota.windows.7dSonnet',
  '7d-fable': 'monitorCommon.quota.windows.7dFable',
  weekly: 'monitorCommon.quota.windows.weekly',
  daily: 'monitorCommon.quota.windows.daily',
  '30d': 'monitorCommon.quota.windows.30d',
  total: 'monitorCommon.quota.windows.total'
}
const LABEL_KEYS: Record<string, string> = {
  requests: 'monitorCommon.quota.labels.requests',
  tokens: 'monitorCommon.quota.labels.tokens',
  shared: 'monitorCommon.quota.labels.shared',
  pro: 'monitorCommon.quota.labels.pro',
  flash: 'monitorCommon.quota.labels.flash'
}

/** 已知的机器 token 走 i18n，未知 token 原样展示（前向兼容）。 */
export function tierLabel(tier: Pick<MonitorQuotaTier, 'window' | 'label'>): string {
  const window = WINDOW_KEYS[tier.window] ? t(WINDOW_KEYS[tier.window]) : tier.window
  if (!tier.label) return window
  const label = LABEL_KEYS[tier.label] ? t(LABEL_KEYS[tier.label]) : tier.label
  return `${label}/${window}`
}

export function balanceRows(snapshot: MonitorQuotaSnapshot): { currency: string; balance: number }[] {
  if (snapshot.balances?.length) return snapshot.balances
  if (snapshot.balance != null) return [{ currency: snapshot.currency || '?', balance: snapshot.balance }]
  return []
}

const tone = (pct: number) =>
  pct >= 90 ? '[&>div]:bg-destructive' : pct >= 70 ? '[&>div]:bg-warning' : '[&>div]:bg-success'

export function MonitorQuotaView({ snapshot }: { snapshot?: MonitorQuotaSnapshot | null }) {
  if (!snapshot) return null
  const balances = balanceRows(snapshot)
  const error = snapshot.error || t('monitorCommon.quota.unavailable')
  return (
    <div className="space-y-1.5" data-testid="monitor-quota-view">
      {snapshot.plan_level ? (
        <span className="inline-block rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
          {snapshot.plan_level}
        </span>
      ) : null}
      {snapshot.success && snapshot.tiers?.length ? (
        <ul className="space-y-1.5">
          {snapshot.tiers.map((tier, i) => (
            <li
              key={`${tier.window}-${tier.label || ''}-${i}`}
              data-testid="monitor-quota-tier"
              className="space-y-0.5"
            >
              <div className="flex justify-between text-[11px]">
                <span className="text-muted-foreground">{tierLabel(tier)}</span>
                <span className="tabular font-medium">{Math.round(tier.used_percent)}%</span>
              </div>
              <Progress
                value={Math.min(100, Math.max(0, tier.used_percent))}
                className={cn('h-1.5', tone(tier.used_percent))}
              />
            </li>
          ))}
        </ul>
      ) : null}
      {snapshot.success && balances.length ? (
        <div className="flex flex-wrap gap-x-2 text-[11px]">
          {balances.map((b) => (
            <span
              key={b.currency}
              className={cn('tabular font-medium', b.balance <= 0 && 'text-destructive')}
            >
              {b.balance.toFixed(2)} {b.currency}
            </span>
          ))}
        </div>
      ) : null}
      {!snapshot.success ? (
        <p
          className="truncate text-[11px] text-destructive"
          title={snapshot.error}
          data-testid="monitor-quota-error"
        >
          {error.length > 48 ? `${error.slice(0, 48)}…` : error}
        </p>
      ) : null}
    </div>
  )
}
