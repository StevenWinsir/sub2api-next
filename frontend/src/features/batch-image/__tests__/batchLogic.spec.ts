import { describe, expect, it } from 'vitest'
import { buildAgentInstruction } from '../agentInstruction'
import {
  batchImageErrorMessage,
  buildSubmitItems,
  canCancel,
  canDeleteRecord,
  canDownload,
  canRetry,
  estimatedOutputCount,
  jobStatusKey,
  jobStatusTone,
  normalizeOutputCount,
  referenceImageLimitForModel,
  retryCustomID,
  rootBatchIdForRetry,
  uniqueCustomID
} from '../batchLogic'

const row = (over = {}) => ({ prompt: 'p', custom_id: '', output_count: 1, reference_images: [], ...over })

describe('submit items', () => {
  it('generates stable unique ids, drops empty prompts and only sends output_count > 1', () => {
    const items = buildSubmitItems([
      row({ prompt: ' a ' }),
      row({ prompt: 'b', custom_id: 'x y' }),
      row({ prompt: '' }),
      row({ prompt: 'c', custom_id: 'x y', output_count: 3 })
    ])
    expect(items).toEqual([
      { custom_id: 'img_001', prompt: 'a' },
      { custom_id: 'x_y', prompt: 'b' },
      { custom_id: 'x_y_2', prompt: 'c', output_count: 3 }
    ])
  })
  it('clamps output counts to 1..4 and sums the estimate', () => {
    expect(normalizeOutputCount(0)).toBe(1)
    expect(normalizeOutputCount(9)).toBe(4)
    expect(normalizeOutputCount('x')).toBe(1)
    expect(estimatedOutputCount([{ output_count: 2 }, { output_count: 10 }])).toBe(6)
  })
  it('de-duplicates custom ids', () => {
    const used = new Set<string>()
    expect([uniqueCustomID('a', used, 0), uniqueCustomID('a', used, 1), uniqueCustomID('', used, 2)]).toEqual(
      ['a', 'a_2', 'img_003']
    )
  })
  it('limits reference images by model family', () => {
    expect(referenceImageLimitForModel('gemini-3-pro-image-preview')).toBe(14)
    expect(referenceImageLimitForModel('gemini-2.5-flash-image')).toBe(3)
    expect(referenceImageLimitForModel('imagen-4')).toBe(0)
  })
})

describe('job state', () => {
  it('derives action availability from the status', () => {
    expect(canCancel({ status: 'running' })).toBe(true)
    expect(canCancel({ status: 'completed' })).toBe(false)
    expect(canDownload({ status: 'completed', success_count: 1 })).toBe(true)
    expect(canDownload({ status: 'completed', success_count: 0 })).toBe(false)
    expect(canRetry({ status: 'completed', fail_count: 2 })).toBe(true)
    expect(canRetry({ status: 'running', fail_count: 2 })).toBe(false)
    expect(canDeleteRecord({ status: 'failed' })).toBe(true)
  })
  it('labels completed jobs with failures', () => {
    expect(jobStatusKey({ status: 'completed', success_count: 3, fail_count: 1 })).toBe('partialSuccess')
    expect(jobStatusKey({ status: 'completed', success_count: 0, fail_count: 1 })).toBe('allFailed')
    expect(jobStatusKey({ status: 'indexing', success_count: 0, fail_count: 0 })).toBe('processingResults')
    expect(jobStatusTone({ status: 'completed', success_count: 3, fail_count: 1 })).toBe('warning')
    expect(jobStatusTone({ status: 'cancelled', success_count: 0, fail_count: 0 })).toBe('destructive')
  })
  it('retries under the root batch with fresh custom ids', () => {
    expect(rootBatchIdForRetry({ id: 'child', parent_batch_id: 'root' })).toBe('root')
    expect(rootBatchIdForRetry({ id: 'solo', parent_batch_id: null })).toBe('solo')
    expect(retryCustomID('a b', 36)).toBe('a_b_retry_10')
  })
})

describe('error mapping', () => {
  const t = (k: string, o?: Record<string, unknown>) => (o ? `${k}:${JSON.stringify(o)}` : k)
  it('maps known codes and appends admin hints only for admin-fixable errors', () => {
    expect(batchImageErrorMessage({ code: 'BATCH_IMAGE_INSUFFICIENT_BALANCE' }, 'fb', t, false)).toBe(
      'batchImage.messages.insufficientBalance'
    )
    const admin = batchImageErrorMessage(
      { code: 'BATCH_IMAGE_QUEUE_FAILED', requestId: 'r1' },
      'fb',
      t,
      false
    )
    expect(admin).toContain('batchImage.messages.queueFailed')
    expect(admin).toContain('batchImage.messages.adminReference')
    expect(admin).toContain('r1')
  })
  it('falls back to the server message (en) or a localized wrapper (zh)', () => {
    expect(batchImageErrorMessage({ code: 'X', message: 'boom' }, 'fb', t, false)).toBe('boom')
    expect(batchImageErrorMessage({ code: 'X' }, 'fb', t, false)).toBe('fb')
    expect(batchImageErrorMessage({ code: 'X', message: 'boom' }, 'fb', t, true)).toContain('boom')
  })
  it('recognizes legacy message-only errors', () => {
    expect(
      batchImageErrorMessage({ message: 'no compatible batch image account' }, 'fb', t, false)
    ).toContain('batchImage.messages.noCompatibleAccount')
  })
})

describe('agent instruction', () => {
  it('embeds the endpoint in every API line', () => {
    const text = buildAgentInstruction('https://api.example.com/')
    expect(text).toContain('https://api.example.com/')
    expect(text).toContain('POST https://api.example.com/v1/images/batches')
    expect(text).toContain('GET https://api.example.com/v1/images/batches/{id}/download')
  })
})
