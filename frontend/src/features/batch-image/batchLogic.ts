/** 批量生图页的纯逻辑（提交条目构建 / 状态判定 / 错误码到文案的映射）。 */
import type {
  BatchImageJob,
  BatchImageStatus,
  BatchImageSubmitItem,
  BatchImageReferenceImage
} from '@/api/batchImage'

export const TERMINAL_STATUSES = new Set(['completed', 'failed', 'cancelled', 'output_deleted'])
export const BATCH_IMAGE_MAX_OUTPUTS_PER_ITEM = 4
export const BATCH_IMAGE_MAX_OUTPUTS_PER_JOB = 200

export interface PromptRow {
  prompt: string
  custom_id: string
  output_count: number
  reference_images: BatchImageReferenceImage[]
}

export const isTerminal = (status: BatchImageStatus): boolean => TERMINAL_STATUSES.has(status)
export const canCancel = (job: Pick<BatchImageJob, 'status'>): boolean => !isTerminal(job.status)
export const canDownload = (job: Pick<BatchImageJob, 'status' | 'success_count'>): boolean =>
  job.status === 'completed' && job.success_count > 0
export const canRetry = (job: Pick<BatchImageJob, 'status' | 'fail_count'>): boolean =>
  isTerminal(job.status) && job.fail_count > 0
export const canDeleteRecord = (job: Pick<BatchImageJob, 'status'>): boolean => isTerminal(job.status)

/** 模型单条 prompt 的参考图上限：Pro Image 14，Flash Image 3，其余 0。 */
export function referenceImageLimitForModel(model: string): number {
  const m = String(model || '').toLowerCase()
  if (m.includes('pro-image')) return 14
  if (m.includes('flash-image')) return 3
  return 0
}

export function normalizeOutputCount(value: unknown): number {
  const parsed = Math.floor(Number(value || 1))
  if (!Number.isFinite(parsed)) return 1
  return Math.min(BATCH_IMAGE_MAX_OUTPUTS_PER_ITEM, Math.max(1, parsed))
}

export function uniqueCustomID(raw: string, used: Set<string>, index: number): string {
  const base =
    raw.replace(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '') || `img_${String(index + 1).padStart(3, '0')}`
  let candidate = base
  let suffix = 2
  while (used.has(candidate)) {
    candidate = `${base}_${suffix}`
    suffix += 1
  }
  used.add(candidate)
  return candidate
}

/** 由 prompt 行构建提交条目：custom_id 去重规范化，空 prompt 丢弃，output_count > 1 才下发。 */
export function buildSubmitItems(rows: PromptRow[]): BatchImageSubmitItem[] {
  const used = new Set<string>()
  return rows
    .map((row, index) => {
      const item: BatchImageSubmitItem = {
        custom_id: uniqueCustomID(row.custom_id || `img_${String(index + 1).padStart(3, '0')}`, used, index),
        prompt: row.prompt.trim()
      }
      const count = normalizeOutputCount(row.output_count)
      if (count > 1) item.output_count = count
      if (row.reference_images.length) item.reference_images = row.reference_images
      return item
    })
    .filter((item) => item.prompt)
}

export const estimatedOutputCount = (rows: Pick<PromptRow, 'output_count'>[]): number =>
  rows.reduce((sum, r) => sum + normalizeOutputCount(r.output_count), 0)

/** 重试子任务的 custom_id（保证与历史条目不冲突）。 */
export function retryCustomID(customID: string, now = Date.now()): string {
  const base =
    String(customID || 'item')
      .replace(/[^\w.-]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'item'
  return `${base}_retry_${now.toString(36)}`
}

export const rootBatchIdForRetry = (job: Pick<BatchImageJob, 'id' | 'parent_batch_id'>): string =>
  job.parent_batch_id || job.id

export const STATUS_KEYS: Record<string, string> = {
  queued: 'queued',
  running: 'running',
  indexing: 'processingResults',
  processing_results: 'processingResults',
  settling: 'settling',
  completed: 'completed',
  failed: 'failed',
  cancelled: 'cancelled',
  output_deleted: 'outputDeleted'
}

/** 状态展示键（已完成但有失败项 → 部分成功 / 全部失败）；返回 batchImage.status.* 的后缀。 */
export function jobStatusKey(job: Pick<BatchImageJob, 'status' | 'success_count' | 'fail_count'>): string {
  if (job.status === 'completed' && job.fail_count > 0)
    return job.success_count > 0 ? 'partialSuccess' : 'allFailed'
  return STATUS_KEYS[job.status] ?? ''
}

export type Tone = 'success' | 'warning' | 'destructive' | 'secondary' | 'default'
export function jobStatusTone(job: Pick<BatchImageJob, 'status' | 'success_count' | 'fail_count'>): Tone {
  if (job.status === 'completed' && job.fail_count > 0)
    return job.success_count > 0 ? 'warning' : 'destructive'
  if (job.status === 'completed') return 'success'
  if (job.status === 'failed' || job.status === 'cancelled') return 'destructive'
  if (job.status === 'output_deleted') return 'secondary'
  return 'default'
}

export const ITEM_STATUS_KEYS: Record<string, string> = {
  pending: 'pending',
  succeeded: 'succeeded',
  success: 'succeeded',
  failed: 'failed',
  cancelled: 'cancelled'
}
export function itemStatusTone(status: string): Tone {
  if (status === 'succeeded' || status === 'success') return 'success'
  if (status === 'failed' || status === 'cancelled') return 'destructive'
  return 'default'
}

const ERROR_KEYS: Record<string, { key: string; admin?: boolean }> = {
  API_KEY_REQUIRED: { key: 'authRequired' },
  '401': { key: 'authRequired' },
  BATCH_IMAGE_NO_ACCOUNT_AVAILABLE: { key: 'noCompatibleAccount', admin: true },
  BATCH_IMAGE_UNSUPPORTED_PROVIDER: { key: 'unsupportedProvider', admin: true },
  BATCH_IMAGE_VERTEX_GCS_BUCKET_MISSING: { key: 'vertexGcsBucketMissing', admin: true },
  VERTEX_MANAGED_GCS_BUCKET_MISSING: { key: 'vertexGcsBucketMissing', admin: true },
  BATCH_IMAGE_PROVIDER_SUBMIT_FAILED: { key: 'providerSubmitFailed', admin: true },
  BATCH_IMAGE_PROVIDER_MISSING_API_KEY: { key: 'providerSubmitFailed', admin: true },
  BATCH_IMAGE_PROVIDER_MISSING_SERVICE_ACCOUNT: { key: 'providerSubmitFailed', admin: true },
  BATCH_IMAGE_PROVIDER_UNSUPPORTED_ACCOUNT: { key: 'providerSubmitFailed', admin: true },
  BATCH_IMAGE_QUEUE_FAILED: { key: 'queueFailed', admin: true },
  BATCH_IMAGE_QUEUE_NOT_CONFIGURED: { key: 'queueFailed', admin: true },
  BATCH_IMAGE_BILLING_HOLD_FAILED: { key: 'billingHoldFailed', admin: true },
  BATCH_IMAGE_GROUP_DISABLED: { key: 'groupDisabled' },
  BATCH_IMAGE_SETTLEMENT_PRICING_MISSING: { key: 'pricingMissing', admin: true },
  BATCH_IMAGE_INSUFFICIENT_BALANCE: { key: 'insufficientBalance' },
  BATCH_IMAGE_INVALID_MODEL: { key: 'invalidModel' },
  BATCH_IMAGE_INVALID_ITEMS: { key: 'invalidItems' },
  BATCH_IMAGE_DUPLICATE_CUSTOM_ID: { key: 'duplicateCustomId' },
  BATCH_IMAGE_PROMPT_TOO_LONG: { key: 'promptTooLong' },
  BATCH_IMAGE_INVALID_REFERENCE_IMAGE: { key: 'invalidReferenceImage' },
  BATCH_IMAGE_TOO_MANY_REFERENCE_IMAGES: { key: 'tooManyReferenceImages' },
  BATCH_IMAGE_REFERENCE_IMAGES_TOO_LARGE: { key: 'referenceImagesTooLarge' },
  BATCH_IMAGE_TOO_MANY_OUTPUT_IMAGES: { key: 'tooManyOutputImages' },
  BATCH_IMAGE_IDEMPOTENCY_CONFLICT: { key: 'idempotencyConflict' },
  BATCH_IMAGE_NOT_READY: { key: 'notReady' },
  BATCH_IMAGE_OUTPUT_DELETED: { key: 'outputDeleted' },
  BATCH_IMAGE_RESULT_MISSING: { key: 'resultMissing', admin: true },
  BATCH_IMAGE_ITEM_FAILED: { key: 'itemFailed' },
  BATCH_IMAGE_ITEM_IMAGE_INDEX_OUT_OF_RANGE: { key: 'itemImageIndexOutOfRange' },
  BATCH_IMAGE_DOWNLOAD_LIMITED: { key: 'downloadLimited' },
  BATCH_IMAGE_DOWNLOAD_TOO_LARGE: { key: 'downloadTooLarge' },
  BATCH_IMAGE_RECORD_DELETE_NOT_READY: { key: 'deleteNotReady' },
  BATCH_IMAGE_DISABLED: { key: 'disabled', admin: true }
}

export interface BatchError {
  code?: unknown
  status?: unknown
  requestId?: unknown
  message?: unknown
}

export type Translate = (key: string, options?: Record<string, unknown>) => string

/** 错误引用信息（错误码 / 请求 ID / HTTP 状态），便于用户向管理员反馈。 */
export function errorReference(error: BatchError, t: Translate, zh: boolean): string {
  const parts: string[] = []
  const code = String(error?.code || '').trim()
  const requestId = String(error?.requestId || '').trim()
  const status = String(error?.status || '').trim()
  if (code) parts.push(t('batchImage.messages.errorCodeRef', { code }))
  if (requestId) parts.push(t('batchImage.messages.requestIdRef', { id: requestId }))
  if (!code && status) parts.push(t('batchImage.messages.httpStatusRef', { status }))
  return parts.length ? `（${parts.join(zh ? '，' : ', ')}）` : ''
}

/** 把网关错误码映射为本地化文案；需要管理员介入的错误附带“联系管理员”提示与引用信息。 */
export function batchImageErrorMessage(
  error: BatchError,
  fallback: string,
  t: Translate,
  zh: boolean
): string {
  const code = String(error?.code || '').trim()
  const message = String(error?.message || '').trim()
  const text = (k: string) => t(`batchImage.messages.${k}`)
  const withAdmin = (base: string) => {
    const ref = errorReference(error, t, zh)
    return `${base}${ref ? ` ${ref}` : ''} ${text('adminReference')}`
  }
  let entry = ERROR_KEYS[code]
  if (!entry && /no compatible batch image account/i.test(message))
    entry = ERROR_KEYS.BATCH_IMAGE_NO_ACCOUNT_AVAILABLE
  if (!entry && /unsupported batch image provider/i.test(message))
    entry = ERROR_KEYS.BATCH_IMAGE_UNSUPPORTED_PROVIDER
  if (entry) return entry.admin ? withAdmin(text(entry.key)) : text(entry.key)
  if (code === 'INTERNAL_ERROR' || code === '500') return withAdmin(fallback)
  if (zh) {
    const detail = message ? `${text('errorReference')}：${message}` : text('adminReference')
    return `${fallback}。${detail} ${errorReference(error, t, zh)}`
  }
  return message || fallback
}
