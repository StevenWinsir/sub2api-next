import { describe, expect, it } from 'vitest'
import { csvRow, formatLatency, formatTokensBig, requestTypeVariant, statusCodeVariant } from '../usageUi'

describe('usage ui helpers', () => {
  it('escapes CSV values and blocks formula injection', () => {
    expect(csvRow(['a', 'b,c', 'q"x', null, '-'])).toBe('a,"b,c","q""x",,-')
    expect(csvRow(['=SUM(A1)', '+1', '@x'])).toBe(`"'=SUM(A1)","'+1","'@x"`)
  })
  it('formats latency and tokens', () => {
    expect(formatLatency(null)).toBe('-')
    expect(formatLatency(420)).toBe('420ms')
    expect(formatLatency(1500)).toBe('1.50s')
    expect(formatLatency(125000)).toBe('2m 5s')
    expect(formatLatency(3_900_000)).toBe('1h 5m')
    expect(formatTokensBig(1_234_567)).toBe('1.23M')
    expect(formatTokensBig(12)).toBe('12')
  })
  it('maps tones', () => {
    expect(statusCodeVariant(500)).toBe('destructive')
    expect(statusCodeVariant(429)).toBe('default')
    expect(statusCodeVariant(404)).toBe('warning')
    expect(requestTypeVariant('stream')).toBe('info')
  })
})
