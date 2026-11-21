/** 运维看板：URL 查询参数 ↔ 状态、接口参数构造（纯函数，行为与 Vue 版 OpsDashboard 一致）。 */
export type TimeRange = '5m' | '30m' | '1h' | '6h' | '24h' | 'custom'
export type QueryMode = 'auto' | 'raw' | 'preagg'

export const ALLOWED_TIME_RANGES: readonly TimeRange[] = ['5m', '30m', '1h', '6h', '24h', 'custom']
export const ALLOWED_QUERY_MODES: readonly QueryMode[] = ['auto', 'raw', 'preagg']

export const QUERY_KEYS = {
  timeRange: 'tr',
  platform: 'platform',
  groupId: 'group_id',
  queryMode: 'mode',
  fullscreen: 'fullscreen',
  // 深链
  openErrorDetails: 'open_error_details',
  errorType: 'error_type',
  alertRuleId: 'alert_rule_id',
  openAlertRules: 'open_alert_rules'
} as const

export const SWITCH_TREND_WINDOW_HOURS = 5

export interface OpsFilterState {
  timeRange: TimeRange
  platform: string
  groupId: number | null
  queryMode: QueryMode
}

export interface OpsDeepLinks {
  openAlertRules: boolean
  openErrorDetails: boolean
  errorType: 'request' | 'upstream'
}

export type RouteQuery = Record<string, string | string[] | undefined>

export function readQueryString(q: RouteQuery, key: string): string {
  const v = q[key]
  if (typeof v === 'string') return v
  if (Array.isArray(v) && typeof v[0] === 'string') return v[0]
  return ''
}

export function readQueryNumber(q: RouteQuery, key: string): number | null {
  const raw = readQueryString(q, key)
  if (!raw) return null
  const n = Number.parseInt(raw, 10)
  return Number.isFinite(n) ? n : null
}

export function isFullscreenQuery(q: RouteQuery): boolean {
  const v = readQueryString(q, QUERY_KEYS.fullscreen)
  return v === '1' || v === 'true'
}

export function parseRouteQuery(
  q: RouteQuery,
  current: OpsFilterState,
  defaultMode: string
): { state: OpsFilterState; links: OpsDeepLinks } {
  const tr = readQueryString(q, QUERY_KEYS.timeRange)
  const timeRange =
    tr && (ALLOWED_TIME_RANGES as readonly string[]).includes(tr) ? (tr as TimeRange) : current.timeRange
  const gid = readQueryNumber(q, QUERY_KEYS.groupId)
  const mode = readQueryString(q, QUERY_KEYS.queryMode)
  const fallback = (ALLOWED_QUERY_MODES as readonly string[]).includes(defaultMode)
    ? (defaultMode as QueryMode)
    : 'auto'
  const queryMode = (ALLOWED_QUERY_MODES as readonly string[]).includes(mode) ? (mode as QueryMode) : fallback
  const rules = readQueryString(q, QUERY_KEYS.openAlertRules)
  const ruleId = readQueryNumber(q, QUERY_KEYS.alertRuleId)
  const openErr = readQueryString(q, QUERY_KEYS.openErrorDetails)
  return {
    state: {
      timeRange,
      platform: readQueryString(q, QUERY_KEYS.platform) || '',
      groupId: typeof gid === 'number' && gid > 0 ? gid : null,
      queryMode
    },
    links: {
      openAlertRules: rules === '1' || rules === 'true' || (typeof ruleId === 'number' && ruleId > 0),
      openErrorDetails: openErr === '1' || openErr === 'true',
      errorType: readQueryString(q, QUERY_KEYS.errorType) === 'upstream' ? 'upstream' : 'request'
    }
  }
}

/** 状态 → 查询串：仅写入与默认值不同的项，并清掉深链与全屏之外的旧键。 */
export function buildQueryFromState(q: RouteQuery, s: OpsFilterState): Record<string, string | string[]> {
  const next: Record<string, string | string[]> = {}
  for (const [k, v] of Object.entries(q)) if (v !== undefined) next[k] = v
  for (const k of Object.values(QUERY_KEYS)) delete next[k]
  if (s.timeRange !== '1h') next[QUERY_KEYS.timeRange] = s.timeRange
  if (s.platform) next[QUERY_KEYS.platform] = s.platform
  if (typeof s.groupId === 'number' && s.groupId > 0) next[QUERY_KEYS.groupId] = String(s.groupId)
  if (s.queryMode !== 'auto') next[QUERY_KEYS.queryMode] = s.queryMode
  return next
}

export interface ApiParams {
  platform?: string
  group_id?: number
  mode: QueryMode
  time_range?: '5m' | '30m' | '1h' | '6h' | '24h'
  start_time?: string
  end_time?: string
}

export function buildApiParams(
  s: OpsFilterState,
  custom: { start: string | null; end: string | null }
): ApiParams {
  const params: ApiParams = {
    platform: s.platform || undefined,
    group_id: s.groupId ?? undefined,
    mode: s.queryMode
  }
  if (s.timeRange === 'custom') {
    if (custom.start && custom.end) {
      params.start_time = custom.start
      params.end_time = custom.end
    } else {
      // 兜底：不向后端发送 time_range=custom
      params.time_range = '1h'
    }
  } else params.time_range = s.timeRange
  return params
}

export function buildSwitchTrendParams(s: OpsFilterState, now = Date.now()): ApiParams {
  return {
    platform: s.platform || undefined,
    group_id: s.groupId ?? undefined,
    mode: s.queryMode,
    start_time: new Date(now - SWITCH_TREND_WINDOW_HOURS * 3_600_000).toISOString(),
    end_time: new Date(now).toISOString()
  }
}

export function isOpsDisabledError(err: unknown): boolean {
  return (
    !!err && typeof err === 'object' && 'code' in err && (err as { code?: unknown }).code === 'OPS_DISABLED'
  )
}

export function isCanceledRequest(err: unknown): boolean {
  return (
    !!err && typeof err === 'object' && 'code' in err && (err as { code?: unknown }).code === 'ERR_CANCELED'
  )
}

/** 指标越界着色：SLA 低于下限 / 其余高于上限为 'error'。 */
export function thresholdTone(
  value: number | null | undefined,
  limit: number | null | undefined,
  kind: 'min' | 'max'
): 'neutral' | 'error' | 'success' {
  if (value == null || limit == null) return 'neutral'
  const bad = kind === 'min' ? value < limit : value > limit
  return bad ? 'error' : 'success'
}
