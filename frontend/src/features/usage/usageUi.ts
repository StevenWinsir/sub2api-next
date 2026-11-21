import type { BadgeProps } from '@/components/ui/badge'
import type { UsageRequestType } from '@/types'

type Variant = NonNullable<BadgeProps['variant']>

export function requestTypeVariant(kind: UsageRequestType): Variant {
  switch (kind) {
    case 'cyber':
      return 'destructive'
    case 'live':
      return 'success'
    case 'ws_v2':
      return 'default'
    case 'stream':
      return 'info'
    case 'sync':
      return 'secondary'
    default:
      return 'warning'
  }
}

export function statusCodeVariant(code: number): Variant {
  if (code >= 500) return 'destructive'
  if (code === 429) return 'default'
  if (code >= 400) return 'warning'
  return 'secondary'
}

export function billingModeVariant(mode: string | null | undefined): Variant {
  switch (mode) {
    case 'image':
      return 'default'
    case 'video':
      return 'info'
    case 'per_request':
      return 'warning'
    default:
      return 'secondary'
  }
}

/** 超过 1 分钟简化为 "Xm Ys"，超过 1 小时进位为 "Xh Ym"。 */
export function formatLatency(ms: number | null | undefined): string {
  if (ms == null) return '-'
  if (ms < 1000) return `${ms}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(2)}s`
  const totalSec = Math.round(ms / 1000)
  if (totalSec < 3600) return `${Math.floor(totalSec / 60)}m ${totalSec % 60}s`
  return `${Math.floor(totalSec / 3600)}h ${Math.floor((totalSec % 3600) / 60)}m`
}

export function formatTokensBig(value: number): string {
  if (value >= 1e9) return (value / 1e9).toFixed(2) + 'B'
  if (value >= 1e6) return (value / 1e6).toFixed(2) + 'M'
  if (value >= 1e3) return (value / 1e3).toFixed(2) + 'K'
  return value.toLocaleString()
}

const escapeCSVValue = (value: unknown): string => {
  if (value == null) return ''
  const str = String(value)
  const escaped = str.replace(/"/g, '""')
  if (str === '-') return str
  // 防 CSV 公式注入：以 = + - @ 制表符 回车 开头的值前置单引号
  if (/^[=+\-@\t\r]/.test(str)) return `"'${escaped}"`
  if (/[,"\n\r]/.test(str)) return `"${escaped}"`
  return str
}

export const csvRow = (cells: unknown[]): string => cells.map(escapeCSVValue).join(',')
