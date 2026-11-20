import * as React from 'react'
import type { DateRange } from 'react-day-picker'
import { Button } from '@/components/ui/button'
import { DateRangePicker } from '@/components/DateRangePicker'
import { formatDateLocalInput } from '@/utils/format'
import { cn } from '@/lib/utils'
import { t } from '@/i18n'

export interface DateStrRange {
  start: string
  end: string
}

export type DatePresetKey =
  'today' | 'yesterday' | 'last24Hours' | '7days' | '14days' | '30days' | 'thisMonth' | 'lastMonth'

const addDays = (n: number) => {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d
}

/** 快捷区间（与 Vue 版 DateRangePicker 的预设一致，日期按浏览器本地时区）。 */
export const DATE_PRESETS: { key: DatePresetKey; labelKey: string; range: () => DateStrRange }[] = [
  {
    key: 'today',
    labelKey: 'dates.today',
    range: () => ({ start: formatDateLocalInput(new Date()), end: formatDateLocalInput(new Date()) })
  },
  {
    key: 'yesterday',
    labelKey: 'dates.yesterday',
    range: () => ({ start: formatDateLocalInput(addDays(-1)), end: formatDateLocalInput(addDays(-1)) })
  },
  {
    key: 'last24Hours',
    labelKey: 'dates.last24Hours',
    range: () => ({
      start: formatDateLocalInput(new Date(Date.now() - 86400000)),
      end: formatDateLocalInput(new Date())
    })
  },
  {
    key: '7days',
    labelKey: 'dates.last7Days',
    range: () => ({ start: formatDateLocalInput(addDays(-6)), end: formatDateLocalInput(new Date()) })
  },
  {
    key: '14days',
    labelKey: 'dates.last14Days',
    range: () => ({ start: formatDateLocalInput(addDays(-13)), end: formatDateLocalInput(new Date()) })
  },
  {
    key: '30days',
    labelKey: 'dates.last30Days',
    range: () => ({ start: formatDateLocalInput(addDays(-29)), end: formatDateLocalInput(new Date()) })
  },
  {
    key: 'thisMonth',
    labelKey: 'dates.thisMonth',
    range: () => {
      const n = new Date()
      return {
        start: formatDateLocalInput(new Date(n.getFullYear(), n.getMonth(), 1)),
        end: formatDateLocalInput(n)
      }
    }
  },
  {
    key: 'lastMonth',
    labelKey: 'dates.lastMonth',
    range: () => {
      const n = new Date()
      return {
        start: formatDateLocalInput(new Date(n.getFullYear(), n.getMonth() - 1, 1)),
        end: formatDateLocalInput(new Date(n.getFullYear(), n.getMonth(), 0))
      }
    }
  }
]

const parseLocal = (s: string) => new Date(`${s}T00:00:00`)

export interface DateRangeBarProps {
  value: DateStrRange
  onChange: (range: DateStrRange) => void
  presets?: DatePresetKey[]
  className?: string
}

/** 日期区间选择：快捷预设 + 日历区间；对外统一使用 YYYY-MM-DD 字符串（后端按 timezone 参数解释）。 */
export function DateRangeBar({ value, onChange, presets, className }: DateRangeBarProps) {
  const list = presets ? DATE_PRESETS.filter((p) => presets.includes(p.key)) : DATE_PRESETS
  const active = list.find((p) => {
    const r = p.range()
    return r.start === value.start && r.end === value.end
  })
  const range: DateRange = { from: parseLocal(value.start), to: parseLocal(value.end) }
  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      <DateRangePicker
        value={range}
        onChange={(r) => {
          if (r?.from) {
            onChange({ start: formatDateLocalInput(r.from), end: formatDateLocalInput(r.to ?? r.from) })
          }
        }}
      />
      <div className="flex flex-wrap gap-1">
        {list.map((p) => (
          <Button
            key={p.key}
            type="button"
            size="sm"
            variant={active?.key === p.key ? 'secondary' : 'ghost'}
            aria-pressed={active?.key === p.key}
            onClick={() => onChange(p.range())}
          >
            {t(p.labelKey)}
          </Button>
        ))}
      </div>
    </div>
  )
}

/** 区间天数 ≤ 1 用小时粒度，否则按天（与 Vue 版 UsageView 一致）。 */
export function granularityForRange(start: string, end: string): 'day' | 'hour' {
  const diff = Math.ceil((parseLocal(end).getTime() - parseLocal(start).getTime()) / 86400000)
  return diff <= 1 ? 'hour' : 'day'
}
