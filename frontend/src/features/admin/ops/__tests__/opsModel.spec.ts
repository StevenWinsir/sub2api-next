import { describe, expect, it } from 'vitest'
import {
  buildApiParams,
  buildQueryFromState,
  buildSwitchTrendParams,
  isFullscreenQuery,
  isOpsDisabledError,
  parseRouteQuery,
  thresholdTone,
  type OpsFilterState
} from '../opsModel'

const base: OpsFilterState = { timeRange: '1h', platform: '', groupId: null, queryMode: 'auto' }

describe('ops query ↔ state', () => {
  it('parses valid values and ignores invalid ones', () => {
    const { state } = parseRouteQuery(
      { tr: '6h', platform: 'openai', group_id: '12', mode: 'raw' },
      base,
      'auto'
    )
    expect(state).toEqual({ timeRange: '6h', platform: 'openai', groupId: 12, queryMode: 'raw' })
    const bad = parseRouteQuery(
      { tr: '99y', group_id: '-3', mode: 'x' },
      { ...base, timeRange: '30m' },
      'preagg'
    )
    expect(bad.state).toEqual({ timeRange: '30m', platform: '', groupId: null, queryMode: 'preagg' })
    expect(parseRouteQuery({}, base, 'bogus').state.queryMode).toBe('auto')
  })

  it('reads deep links', () => {
    const a = parseRouteQuery(
      { open_alert_rules: '1', open_error_details: 'true', error_type: 'upstream' },
      base,
      'auto'
    ).links
    expect(a).toEqual({ openAlertRules: true, openErrorDetails: true, errorType: 'upstream' })
    expect(parseRouteQuery({ alert_rule_id: '5' }, base, 'auto').links.openAlertRules).toBe(true)
    expect(parseRouteQuery({ error_type: 'zzz' }, base, 'auto').links.errorType).toBe('request')
  })

  it('writes only non-default keys, keeps foreign keys, drops deep links', () => {
    expect(buildQueryFromState({ x: '1', open_alert_rules: '1', tr: '5m' }, base)).toEqual({ x: '1' })
    expect(
      buildQueryFromState(
        { fullscreen: '1' },
        { timeRange: '24h', platform: 'gemini', groupId: 3, queryMode: 'raw' }
      )
    ).toEqual({
      tr: '24h',
      platform: 'gemini',
      group_id: '3',
      mode: 'raw'
    })
  })

  it('fullscreen flag', () => {
    expect(isFullscreenQuery({ fullscreen: '1' })).toBe(true)
    expect(isFullscreenQuery({ fullscreen: 'true' })).toBe(true)
    expect(isFullscreenQuery({ fullscreen: '0' })).toBe(false)
  })
})

describe('ops api params', () => {
  it('uses time_range, or start/end for custom, never time_range=custom', () => {
    expect(buildApiParams(base, { start: null, end: null })).toEqual({
      platform: undefined,
      group_id: undefined,
      mode: 'auto',
      time_range: '1h'
    })
    const c = { ...base, timeRange: 'custom' as const }
    expect(buildApiParams(c, { start: 'a', end: 'b' })).toMatchObject({ start_time: 'a', end_time: 'b' })
    expect(buildApiParams(c, { start: 'a', end: null }).time_range).toBe('1h')
  })
  it('switch trend uses a fixed 5h window', () => {
    const now = Date.UTC(2026, 0, 1, 12)
    const p = buildSwitchTrendParams(base, now)
    expect(new Date(p.end_time!).getTime() - new Date(p.start_time!).getTime()).toBe(5 * 3_600_000)
  })
  it('detects OPS_DISABLED', () => {
    expect(isOpsDisabledError({ code: 'OPS_DISABLED' })).toBe(true)
    expect(isOpsDisabledError(new Error('x'))).toBe(false)
  })
  it('threshold tone', () => {
    expect(thresholdTone(99, 99.5, 'min')).toBe('error')
    expect(thresholdTone(1500, 1000, 'max')).toBe('error')
    expect(thresholdTone(1, null, 'max')).toBe('neutral')
  })
})
