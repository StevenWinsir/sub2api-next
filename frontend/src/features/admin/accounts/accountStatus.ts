import type { Status } from '@/components/StatusBadge'
import type { Account } from '@/types'

export type AccountDisplayStatus =
  'error' | 'inactive' | 'rate_limited' | 'overloaded' | 'temp_unschedulable' | 'unschedulable' | 'active'

/** 与后端状态筛选值对齐的展示状态（优先级：错误 > 停用 > 限流 > 过载 > 临时不可调度 > 不可调度 > 正常）。 */
export function accountDisplayStatus(a: Account, now = Date.now()): AccountDisplayStatus {
  const future = (v: string | null | undefined) => !!v && new Date(v).getTime() > now
  if (a.status === 'error') return 'error'
  if (a.status === 'inactive') return 'inactive'
  if (future(a.rate_limit_reset_at)) return 'rate_limited'
  if (future(a.overload_until)) return 'overloaded'
  if (future(a.temp_unschedulable_until)) return 'temp_unschedulable'
  if (!a.schedulable) return 'unschedulable'
  return 'active'
}

export const STATUS_TONE: Record<AccountDisplayStatus, Status> = {
  error: 'error',
  inactive: 'neutral',
  rate_limited: 'warning',
  overloaded: 'warning',
  temp_unschedulable: 'warning',
  unschedulable: 'neutral',
  active: 'success'
}
