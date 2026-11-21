/** /admin/orders/dashboard：支付概览（KPI / 每日收入 / 支付方式分布 / 消费排行，按币种拆分）。 */
import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { adminAPI } from '@/api/admin'
import { LazyDonutChart, LazyTrendAreaChart } from '@/components/charts/LazyCharts'
import { NativeSelect } from '@/components/NativeSelect'
import { PageHeader } from '@/components/PageHeader'
import { StatCard } from '@/components/StatCard'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatPaymentAmount } from '@/features/payment/currency'
import { t } from '@/i18n'
import { useLocale } from '@/i18n/react'
import type { CurrencyAmounts } from '@/types/payment'

/** 按币种拼接金额：`¥12.00 · $3.00`；空对象返回 0。 */
export function formatCurrencyAmounts(amounts: CurrencyAmounts | undefined, locale?: string): string {
  const entries = Object.entries(amounts ?? {}).filter(([, v]) => v !== 0)
  if (entries.length === 0) return formatPaymentAmount(0, undefined, locale)
  return entries.map(([cur, v]) => formatPaymentAmount(v, cur, locale)).join(' · ')
}

/** 把多币种金额折为单一数值序列（仅用于图表：取各币种求和，币种混合时图表仅作趋势参考）。 */
export function sumCurrencyAmounts(amounts: CurrencyAmounts | undefined): number {
  return Object.values(amounts ?? {}).reduce((a, b) => a + b, 0)
}

export function OrdersDashboardPage() {
  const locale = useLocale()
  const [days, setDays] = React.useState(30)
  const q = useQuery({
    queryKey: ['admin', 'payment', 'dashboard', days],
    queryFn: async () => (await adminAPI.payment.getDashboard(days)).data
  })
  const d = q.data
  const daily = (d?.daily_series ?? []).map((x) => ({
    date: x.date.slice(5),
    revenue: sumCurrencyAmounts(x.amount),
    count: x.count
  }))
  const methods = (d?.payment_methods ?? []).map((m) => ({
    name: m.type,
    value: sumCurrencyAmounts(m.amount)
  }))

  return (
    <div>
      <PageHeader
        title={t('payment.admin.dashboardTitle')}
        description={t('payment.admin.dashboardDesc')}
        actions={
          <div className="w-36">
            <NativeSelect
              value={days}
              aria-label={t('payment.admin.daySuffix')}
              onChange={(e) => setDays(Number(e.target.value))}
            >
              {[7, 30, 90].map((n) => (
                <option key={n} value={n}>
                  {n} {t('payment.admin.daySuffix')}
                </option>
              ))}
            </NativeSelect>
          </div>
        }
      />
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label={t('payment.admin.todayRevenue')}
          value={formatCurrencyAmounts(d?.today_amount, locale)}
          loading={q.isLoading}
        />
        <StatCard
          label={t('payment.admin.totalRevenue')}
          value={formatCurrencyAmounts(d?.total_amount, locale)}
          loading={q.isLoading}
        />
        <StatCard label={t('payment.admin.todayOrders')} value={d?.today_count ?? 0} loading={q.isLoading} />
        <StatCard
          label={t('payment.admin.avgAmount')}
          value={formatCurrencyAmounts(d?.avg_amount, locale)}
          hint={`${d?.total_count ?? 0} ${t('payment.admin.orders')}`}
          loading={q.isLoading}
        />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{t('payment.admin.dailyRevenue')}</CardTitle>
          </CardHeader>
          <CardContent>
            {daily.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">{t('payment.admin.noData')}</p>
            ) : (
              <LazyTrendAreaChart
                data={daily}
                xKey="date"
                series={[{ key: 'revenue', label: t('payment.admin.revenue') }]}
                height={260}
              />
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t('payment.admin.paymentDistribution')}</CardTitle>
          </CardHeader>
          <CardContent>
            {methods.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">{t('payment.admin.noData')}</p>
            ) : (
              <LazyDonutChart data={methods} />
            )}
          </CardContent>
        </Card>
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {Object.entries(d?.top_users ?? {}).map(([currency, users]) => (
          <Card key={currency}>
            <CardHeader>
              <CardTitle>
                {t('payment.admin.topUsers')} · {currency}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="divide-y text-sm">
                {users.slice(0, 10).map((u, i) => (
                  <li key={u.user_id} className="flex items-center justify-between gap-3 py-2">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="tabular w-5 text-muted-foreground">{i + 1}</span>
                      <span className="truncate">{u.email}</span>
                    </span>
                    <span className="tabular font-medium">
                      {formatPaymentAmount(u.amount, currency, locale)}
                    </span>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
