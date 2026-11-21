/** 审计日志：时间范围 → 查询参数等纯函数（与 Vue 版 AuditLogView 行为一致）。 */

export const TIME_RANGE_MINUTES: Record<string, number> = {
  '30m': 30,
  '1h': 60,
  '6h': 6 * 60,
  '24h': 24 * 60,
  '7d': 7 * 24 * 60,
  '30d': 30 * 24 * 60
}

export interface AuditFilters {
  q: string
  actor_email: string
  action: string
  client_ip: string
  method: string
  auth_method: string
  success: string
}

export const emptyAuditFilters = (): AuditFilters => ({
  q: '',
  actor_email: '',
  action: '',
  client_ip: '',
  method: '',
  auth_method: '',
  success: ''
})

export function toRFC3339(local: string): string | undefined {
  if (!local) return undefined
  const d = new Date(local)
  if (Number.isNaN(d.getTime())) return undefined
  return d.toISOString()
}

export function buildTimeRangeQuery(
  timeRange: string,
  custom: { start: string; end: string },
  now = Date.now()
): { start_time?: string; end_time?: string } {
  if (timeRange === 'custom') {
    return { start_time: toRFC3339(custom.start), end_time: toRFC3339(custom.end) }
  }
  const minutes = TIME_RANGE_MINUTES[timeRange]
  if (!minutes) return {}
  return { start_time: new Date(now - minutes * 60 * 1000).toISOString() }
}

export function buildAuditQuery(
  page: number,
  pageSize: number,
  filters: AuditFilters,
  timeRange: string,
  custom: { start: string; end: string },
  now = Date.now()
) {
  return {
    page,
    page_size: pageSize,
    q: filters.q || undefined,
    actor_email: filters.actor_email || undefined,
    action: filters.action || undefined,
    client_ip: filters.client_ip || undefined,
    method: filters.method || undefined,
    auth_method: filters.auth_method || undefined,
    success: filters.success || undefined,
    ...buildTimeRangeQuery(timeRange, custom, now)
  }
}

export function prettyBody(body: string): string {
  try {
    return JSON.stringify(JSON.parse(body), null, 2)
  } catch {
    return body
  }
}

export function statusTone(code: number): 'success' | 'warning' | 'error' | 'neutral' {
  if (code >= 200 && code < 400) return 'success'
  if (code >= 400 && code < 500) return 'warning'
  if (code >= 500) return 'error'
  return 'neutral'
}
