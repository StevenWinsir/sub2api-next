import { describe, expect, it, vi } from 'vitest'
import {
  dockerRollbackCommand,
  formatPublishedAt,
  scriptRollbackCommand,
  waitForService
} from '../versionHelpers'

describe('rollback commands', () => {
  it('builds the install.sh command pinned to the tag, and empty when nothing is selected', () => {
    expect(scriptRollbackCommand('0.1.146')).toBe(
      'curl -sSL https://raw.githubusercontent.com/Wei-Shaw/sub2api/v0.1.146/deploy/install.sh | sudo bash -s -- rollback v0.1.146'
    )
    expect(scriptRollbackCommand('')).toBe('')
  })
  it('builds the docker snippet with the untagged-v image', () => {
    const cmd = dockerRollbackCommand('0.1.146', { edit: 'Edit tag', recreate: 'Recreate' })
    expect(cmd).toBe('# Edit tag\nimage: weishaw/sub2api:0.1.146\n\n# Recreate\ndocker compose up -d')
    expect(dockerRollbackCommand('', { edit: '', recreate: '' })).toBe('')
  })
})

describe('waitForService (/health after restart)', () => {
  const sleep = vi.fn(async () => undefined)
  it('returns up as soon as /health is ok', async () => {
    const f = vi
      .fn()
      .mockRejectedValueOnce(new Error('down'))
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({ ok: true })
    expect(await waitForService(f, { sleep })).toBe('up')
    expect(f).toHaveBeenCalledTimes(3)
    expect(f).toHaveBeenCalledWith('/health', { method: 'GET', cache: 'no-cache' })
  })
  it('times out after the retry budget without a trailing sleep', async () => {
    sleep.mockClear()
    const f = vi.fn().mockResolvedValue({ ok: false })
    expect(await waitForService(f, { retries: 3, sleep })).toBe('timeout')
    expect(f).toHaveBeenCalledTimes(3)
    expect(sleep).toHaveBeenCalledTimes(2)
  })
})

describe('formatPublishedAt', () => {
  it('ignores empty and invalid dates', () => {
    expect(formatPublishedAt('')).toBe('')
    expect(formatPublishedAt('nope')).toBe('')
    expect(formatPublishedAt('2026-01-02T00:00:00Z')).not.toBe('')
  })
})
