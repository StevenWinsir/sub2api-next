/** Recharts 图表封装（经 LazyCharts 动态加载，不进入首屏包）。 */
import * as React from 'react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts'

import { CHART_COLORS } from './chartColors'

export interface TrendSeries {
  key: string
  label: string
  color?: string
  /** 堆叠组；同组累加。 */
  stackId?: string
}

const tooltipStyle: React.CSSProperties = {
  background: 'var(--popover)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  fontSize: 12,
  color: 'var(--popover-foreground)'
}

export function TrendAreaChart({
  data,
  xKey = 'date',
  series,
  height = 260,
  yFormatter,
  tooltipFormatter
}: {
  data: Record<string, unknown>[]
  xKey?: string
  series: TrendSeries[]
  height?: number
  yFormatter?: (v: number) => string
  tooltipFormatter?: (v: number, name: string) => string
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis
          dataKey={xKey}
          tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
          tickLine={false}
          axisLine={false}
          minTickGap={24}
        />
        <YAxis
          tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
          tickLine={false}
          axisLine={false}
          width={48}
          tickFormatter={yFormatter}
        />
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={(v, name) => (tooltipFormatter ? tooltipFormatter(Number(v), String(name)) : String(v))}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {series.map((s, i) => (
          <Area
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.label}
            stackId={s.stackId}
            stroke={s.color ?? CHART_COLORS[i % CHART_COLORS.length]}
            fill={s.color ?? CHART_COLORS[i % CHART_COLORS.length]}
            fillOpacity={0.18}
            strokeWidth={2}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  )
}

export function DonutChart({
  data,
  height = 220,
  valueFormatter
}: {
  data: { name: string; value: number }[]
  height?: number
  valueFormatter?: (v: number) => string
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          innerRadius="58%"
          outerRadius="85%"
          paddingAngle={2}
          stroke="var(--card)"
        >
          {data.map((_, i) => (
            <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={(v) => (valueFormatter ? valueFormatter(Number(v)) : String(v))}
        />
      </PieChart>
    </ResponsiveContainer>
  )
}
