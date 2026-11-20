/** 账号用量统计：30 天概览 + 趋势图 + 按模型分布。 */
import { useQuery } from '@tanstack/react-query'
import { adminAPI } from '@/api/admin'
import { LazyTrendAreaChart } from '@/components/charts/LazyCharts'
import { StatCard } from '@/components/StatCard'
import { AdminFormDialog } from '@/features/admin/common/AdminFormDialog'
import { money } from '@/features/admin/common/fieldUtils'
import { t } from '@/i18n'
import type { Account } from '@/types'
import { formatCompactNumber } from '@/utils/format'

export function AccountStatsDialog({ account, onClose }: { account: Account; onClose: () => void }) {
  const q = useQuery({
    queryKey: ['admin', 'accounts', account.id, 'stats'],
    queryFn: () => adminAPI.accounts.getStats(account.id, 30)
  })
  const s = q.data?.summary
  return (
    <AdminFormDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={t('admin.accounts.usageStatistics')}
      description={account.name}
      size="xl"
    >
      <div className="grid gap-3 sm:grid-cols-4">
        <StatCard
          label={t('admin.accounts.stats.totalCost')}
          value={money(s?.total_cost, 4)}
          loading={q.isLoading}
        />
        <StatCard
          label={t('admin.accounts.stats.totalRequests')}
          value={formatCompactNumber(s?.total_requests ?? 0)}
          loading={q.isLoading}
        />
        <StatCard
          label={t('admin.accounts.stats.totalTokens')}
          value={formatCompactNumber(s?.total_tokens ?? 0)}
          loading={q.isLoading}
        />
        <StatCard
          label={t('admin.accounts.stats.avgResponseTime')}
          value={`${Math.round(s?.avg_duration_ms ?? 0)} ms`}
          loading={q.isLoading}
        />
      </div>
      <LazyTrendAreaChart
        data={(q.data?.history ?? []) as unknown as Record<string, unknown>[]}
        xKey="label"
        series={[
          { key: 'requests', label: t('admin.accounts.stats.requests') },
          { key: 'actual_cost', label: t('admin.accounts.stats.cost') }
        ]}
        height={220}
      />
      <ul className="divide-y rounded-md border text-sm">
        {(q.data?.models ?? []).slice(0, 8).map((m) => (
          <li key={m.model} className="flex items-center justify-between gap-3 px-3 py-2">
            <span className="min-w-0 truncate font-mono text-xs">{m.model}</span>
            <span className="tabular text-muted-foreground">
              {formatCompactNumber(m.requests)} · {money(m.actual_cost, 4)}
            </span>
          </li>
        ))}
      </ul>
    </AdminFormDialog>
  )
}
