import { LazyDonutChart } from '@/components/charts/LazyCharts'
import { EmptyState } from '@/components/EmptyState'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { t } from '@/i18n'
import { formatTokensK } from '@/utils/format'

export type DistributionMetric = 'tokens' | 'actual_cost'

export interface DistributionItem {
  name: string
  requests: number
  tokens: number
  actualCost: number
  cost: number
}

/** 分布图卡片：环形图 + 明细列表 + 指标切换（Token / 实际费用）。 */
export function DistributionCard({
  title,
  items,
  loading,
  metric,
  onMetricChange
}: {
  title: string
  items: DistributionItem[]
  loading?: boolean
  metric: DistributionMetric
  onMetricChange: (m: DistributionMetric) => void
}) {
  const data = items
    .map((i) => ({ name: i.name, value: metric === 'tokens' ? i.tokens : i.actualCost }))
    .filter((d) => d.value > 0)
  const fmt = (v: number) => (metric === 'tokens' ? `${formatTokensK(v)} tokens` : `$${v.toFixed(4)}`)
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm">{title}</CardTitle>
        <Tabs value={metric} onValueChange={(v) => onMetricChange(v as DistributionMetric)}>
          <TabsList>
            <TabsTrigger value="tokens">{t('dashboard.tokens')}</TabsTrigger>
            <TabsTrigger value="actual_cost">{t('dashboard.actual')}</TabsTrigger>
          </TabsList>
        </Tabs>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="py-10 text-center text-sm text-muted-foreground">{t('common.loading')}</p>
        ) : data.length === 0 ? (
          <EmptyState title={t('dashboard.noDataAvailable')} />
        ) : (
          <div className="grid items-center gap-4 sm:grid-cols-2">
            <LazyDonutChart data={data} valueFormatter={fmt} height={200} />
            <ul className="max-h-52 space-y-1.5 overflow-y-auto text-sm">
              {items
                .slice()
                .sort((a, b) => (metric === 'tokens' ? b.tokens - a.tokens : b.actualCost - a.actualCost))
                .slice(0, 10)
                .map((i) => (
                  <li key={i.name} className="flex items-center justify-between gap-3">
                    <span className="truncate" title={i.name}>
                      {i.name}
                    </span>
                    <span className="tabular shrink-0 text-muted-foreground">
                      {metric === 'tokens' ? formatTokensK(i.tokens) : `$${i.actualCost.toFixed(4)}`}
                    </span>
                  </li>
                ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
