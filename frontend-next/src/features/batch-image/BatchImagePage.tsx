/**
 * /batch-image：批量生图（使用指南 + 任务管理）。
 * 通过网关 /v1/images/batches* 使用用户的 Gemini API Key 调用（不走 Axios 封装）。
 * 功能：创建任务（prompt 列表 + 参考图 + 张数）、任务列表（筛选 / 多选 / 子任务折叠）、详情（条目 / 按需预览）、
 * 取消 / 下载 ZIP / 重试失败项 / 删除记录、8 秒轮询未结束任务。
 */
import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  Download,
  Eye,
  Image as ImageIcon,
  Loader2,
  Plus,
  RefreshCw,
  RotateCcw,
  Trash2,
  X
} from 'lucide-react'
import * as batch from '@/api/batchImage'
import type { BatchImageItem, BatchImageJob, BatchImageReferenceImage } from '@/api/batchImage'
import { keysAPI } from '@/api/keys'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { CopyButton } from '@/components/CopyButton'
import { EmptyState } from '@/components/EmptyState'
import { FormField } from '@/components/FormField'
import { NativeSelect } from '@/components/NativeSelect'
import { PageHeader } from '@/components/PageHeader'
import { SearchInput } from '@/components/SearchInput'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Input, Textarea } from '@/components/ui/input'
import { useBatchImageAccessStore, keyAllowsBatchImage } from '@/hooks/useBatchImageAccess'
import { getLocale, t } from '@/i18n'
import { useLocale } from '@/i18n/react'
import { useAppStore } from '@/stores/app'
import type { ApiKey } from '@/types'
import { buildAgentInstruction } from './agentInstruction'
import {
  BATCH_IMAGE_MAX_OUTPUTS_PER_ITEM,
  BATCH_IMAGE_MAX_OUTPUTS_PER_JOB,
  ITEM_STATUS_KEYS,
  batchImageErrorMessage,
  buildSubmitItems,
  canCancel,
  canDeleteRecord,
  canDownload,
  canRetry,
  estimatedOutputCount,
  isTerminal,
  itemStatusTone,
  jobStatusKey,
  jobStatusTone,
  referenceImageLimitForModel,
  retryCustomID,
  rootBatchIdForRetry,
  type PromptRow
} from './batchLogic'

interface JobRow extends BatchImageJob {
  api_key_id: number
  api_key_name: string
}
type DetailItem = BatchImageItem & { source_task_name?: string }

const notify = {
  success: (m: string) => useAppStore.getState().showSuccess(m),
  error: (m: string) => useAppStore.getState().showError(m)
}
const msg = (key: string) => t(`batchImage.messages.${key}`)
const isZh = () => getLocale().startsWith('zh')
const errText = (error: unknown, fallbackKey: string) =>
  batchImageErrorMessage(error as batch.BatchImageJob & Record<string, unknown>, msg(fallbackKey), t, isZh())
const fmtDate = (ts: number | null | undefined) => (ts ? new Date(ts * 1000).toLocaleString() : '')
const money = (v: number | null | undefined) =>
  v === null || v === undefined || Number.isNaN(Number(v)) ? '$0.00' : `$${Number(v).toFixed(2)}`
const costLabel = (j: Pick<BatchImageJob, 'status' | 'hold_amount' | 'actual_cost'>) => {
  if (j.actual_cost !== null) return money(j.actual_cost)
  if (j.status === 'failed' || j.status === 'cancelled') return money(0)
  return t('batchImage.detail.holdCost', { amount: money(j.hold_amount) })
}
const statusLabel = (j: Pick<BatchImageJob, 'status' | 'success_count' | 'fail_count'>) => {
  const k = jobStatusKey(j)
  return k ? t(`batchImage.status.${k}`) : j.status
}
const itemStatusLabel = (s: string) =>
  ITEM_STATUS_KEYS[s] ? t(`batchImage.itemStatus.${ITEM_STATUS_KEYS[s]}`) : s
const friendlyItemError = (e: BatchImageItem['error']) => {
  if (!e) return '-'
  if (e.code === 'EMPTY_IMAGE_OUTPUT') return t('batchImage.itemResult.emptyImageOutput')
  if (e.code === 'PROVIDER_ITEM_FAILED') return t('batchImage.itemResult.providerItemFailed')
  return e.message || e.code || '-'
}
const defaultTaskName = () => new Date().toLocaleString()
const MAX_REF_BYTES = 10 * 1024 * 1024

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || '').replace(/^data:[^;]+;base64,/, ''))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

/* ───────────── 创建任务 ───────────── */

function CreateDialog({
  open,
  onOpenChange,
  keys,
  onCreated
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  keys: ApiKey[]
  onCreated: (job: BatchImageJob, key: ApiKey) => void
}) {
  const [keyId, setKeyId] = React.useState<number>(keys[0]?.id ?? 0)
  const [taskName, setTaskName] = React.useState('')
  const [model, setModel] = React.useState('')
  const [mime, setMime] = React.useState('image/png')
  const [rows, setRows] = React.useState<PromptRow[]>([])
  const [draft, setDraft] = React.useState('')
  const [customId, setCustomId] = React.useState('')
  const [count, setCount] = React.useState(1)
  const [refs, setRefs] = React.useState<(BatchImageReferenceImage & { name: string })[]>([])
  const [submitting, setSubmitting] = React.useState(false)
  const key = keys.find((k) => k.id === keyId) ?? null

  const models = useQuery({
    queryKey: ['user', 'batch-image', 'models', key?.id],
    enabled: open && !!key,
    queryFn: async () => {
      try {
        return (await batch.listBatchImageModels(key!.key)).data || []
      } catch (error) {
        notify.error(errText(error, 'loadModelsFailed'))
        throw error
      }
    }
  })
  const modelList = models.data ?? []
  const effectiveModel = modelList.some((m) => m.id === model) ? model : (modelList[0]?.id ?? '')
  const refLimit = referenceImageLimitForModel(effectiveModel)
  const estimated = estimatedOutputCount(rows)

  const addRow = () => {
    const prompt = draft.trim()
    if (!prompt) return
    setRows((r) => [
      ...r,
      {
        prompt,
        custom_id: customId.trim(),
        output_count: count,
        reference_images: refs.map(({ name: _n, ...rest }) => rest)
      }
    ])
    setDraft('')
    setCustomId('')
    setCount(1)
    setRefs([])
  }

  const onFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (refLimit === 0) return notify.error(t('batchImage.create.modelNoReferenceImages'))
    const next = [...refs]
    for (const file of files) {
      if (next.length >= refLimit) {
        notify.error(t('batchImage.create.refLimitExceededIgnored', { limit: refLimit }))
        break
      }
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
        notify.error(t('batchImage.create.refFormatUnsupported'))
        continue
      }
      if (file.size > MAX_REF_BYTES) {
        notify.error(t('batchImage.create.refFileTooLarge', { name: file.name }))
        continue
      }
      next.push({
        id: `ref_${next.length + 1}`,
        type: 'subject',
        mime_type: file.type,
        data: await readFileAsBase64(file),
        name: file.name
      })
    }
    setRefs(next)
  }

  const submit = async () => {
    if (submitting) return
    const allRows = draft.trim()
      ? [
          ...rows,
          {
            prompt: draft.trim(),
            custom_id: customId.trim(),
            output_count: count,
            reference_images: refs.map(({ name: _n, ...r }) => r)
          }
        ]
      : rows
    if (!key) return notify.error(msg('selectApiKey'))
    if (!effectiveModel)
      return notify.error(modelList.length === 0 ? msg('noModelsForKey') : msg('selectModel'))
    const items = buildSubmitItems(allRows)
    if (items.length === 0) return notify.error(msg('promptRequired'))
    if (estimatedOutputCount(allRows) > BATCH_IMAGE_MAX_OUTPUTS_PER_JOB)
      return notify.error(msg('tooManyOutputImages'))
    if (allRows.some((r) => r.reference_images.length > refLimit))
      return notify.error(msg('tooManyReferenceImages'))
    setSubmitting(true)
    try {
      const job = await batch.submitBatchImageJob(
        key.key,
        {
          model: effectiveModel,
          task_name: taskName.trim() || defaultTaskName(),
          image_size: '1K',
          response_mime_type: mime,
          items
        },
        `sub2api-ui-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
      )
      notify.success(msg('submitted'))
      onCreated(job, key)
    } catch (error) {
      notify.error(errText(error, 'submitFailed'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !submitting && onOpenChange(o)}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t('batchImage.create.title')}</DialogTitle>
          <DialogDescription className="sr-only">{t('batchImage.create.title')}</DialogDescription>
        </DialogHeader>
        {keys.length === 0 ? (
          <p className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
            {t('batchImage.create.noKeysHint')}
          </p>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField label={t('batchImage.columns.apiKey')}>
                <NativeSelect value={keyId} onChange={(e) => setKeyId(Number(e.target.value))}>
                  {keys.map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.name}
                    </option>
                  ))}
                </NativeSelect>
              </FormField>
              <FormField label={t('batchImage.create.taskName')}>
                <Input
                  value={taskName}
                  placeholder={t('batchImage.create.taskNamePlaceholder')}
                  onChange={(e) => setTaskName(e.target.value)}
                />
              </FormField>
              <FormField
                label={t('batchImage.create.model')}
                description={
                  models.isLoading
                    ? msg('loadingModels')
                    : modelList.length === 0
                      ? msg('noModelsHint')
                      : undefined
                }
              >
                <NativeSelect
                  value={effectiveModel}
                  disabled={models.isLoading || modelList.length === 0}
                  onChange={(e) => setModel(e.target.value)}
                >
                  {modelList.length === 0 ? <option value="">{msg('noModels')}</option> : null}
                  {modelList.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.id}
                    </option>
                  ))}
                </NativeSelect>
              </FormField>
              <FormField
                label={t('batchImage.create.outputFormat')}
                description={t('batchImage.create.imageSizeHint')}
              >
                <NativeSelect value={mime} onChange={(e) => setMime(e.target.value)}>
                  <option value="image/png">PNG</option>
                  <option value="image/jpeg">JPEG</option>
                  <option value="image/webp">WebP</option>
                </NativeSelect>
              </FormField>
            </div>

            <div className="space-y-3 rounded-lg border p-3">
              <Textarea
                rows={3}
                value={draft}
                placeholder={t('batchImage.create.promptPlaceholder')}
                onChange={(e) => setDraft(e.target.value)}
              />
              <div className="flex flex-wrap items-end gap-3">
                <Input
                  className="w-48"
                  value={customId}
                  placeholder={t('batchImage.create.customIdPlaceholder')}
                  onChange={(e) => setCustomId(e.target.value)}
                />
                <label className="flex items-center gap-2 text-sm">
                  {t('batchImage.create.outputCountPerPrompt')}
                  <NativeSelect
                    className="w-28"
                    value={count}
                    onChange={(e) => setCount(Number(e.target.value))}
                  >
                    {Array.from({ length: BATCH_IMAGE_MAX_OUTPUTS_PER_ITEM }, (_, i) => i + 1).map((n) => (
                      <option key={n} value={n}>
                        {t('batchImage.create.outputCountOption', { n, count: n })}
                      </option>
                    ))}
                  </NativeSelect>
                </label>
                <Button variant="outline" asChild>
                  <label className="cursor-pointer">
                    <ImageIcon aria-hidden />
                    {t('batchImage.create.referenceImage')}
                    <input
                      type="file"
                      multiple
                      accept="image/png,image/jpeg,image/webp"
                      className="sr-only"
                      onChange={(e) => void onFiles(e)}
                    />
                  </label>
                </Button>
                <Button onClick={addRow} disabled={!draft.trim()}>
                  <Plus aria-hidden />
                  {t('common.add')}
                </Button>
              </div>
              {refs.length > 0 ? (
                <ul className="flex flex-wrap gap-2">
                  {refs.map((r, i) => (
                    <li
                      key={`${r.name}-${i}`}
                      className="flex items-center gap-1 rounded-md border bg-muted px-2 py-1 text-xs"
                    >
                      {r.name}
                      <button
                        type="button"
                        aria-label={t('batchImage.create.removeReferenceImage')}
                        onClick={() => setRefs((x) => x.filter((_, j) => j !== i))}
                      >
                        <X className="size-3" aria-hidden />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
              <p className="text-xs text-muted-foreground">
                {t('batchImage.create.limitsHint', {
                  maxPerItem: BATCH_IMAGE_MAX_OUTPUTS_PER_ITEM,
                  maxPerJob: BATCH_IMAGE_MAX_OUTPUTS_PER_JOB,
                  refLimit
                })}
              </p>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="font-medium">
                  {t('batchImage.create.promptAdded', { count: rows.length })}
                </span>
                <span className="text-muted-foreground">
                  {t('batchImage.create.estimatedOutputValue', { images: estimated, prompts: rows.length })}
                </span>
              </div>
              {rows.length === 0 ? (
                <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
                  {t('batchImage.create.noPrompts')}
                </p>
              ) : (
                <ul className="max-h-52 space-y-1.5 overflow-y-auto">
                  {rows.map((r, i) => (
                    <li key={i} className="flex items-start gap-2 rounded-md border p-2 text-sm">
                      <span className="line-clamp-2 flex-1 break-words">{r.prompt}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {r.output_count > 1 ? `×${r.output_count} ` : ''}
                        {r.reference_images.length
                          ? t('batchImage.create.referenceCount', {
                              n: r.reference_images.length,
                              count: r.reference_images.length
                            })
                          : ''}
                      </span>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-6"
                        aria-label={t('common.delete')}
                        onClick={() => setRows((x) => x.filter((_, j) => j !== i))}
                      >
                        <X aria-hidden />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <p className="text-xs text-muted-foreground">{t('batchImage.create.cancelNotice')}</p>
            {submitting ? (
              <p className="text-xs text-info">{t('batchImage.create.submittingNotice')}</p>
            ) : null}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" disabled={submitting} onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button loading={submitting} disabled={keys.length === 0} onClick={() => void submit()}>
            {t('batchImage.actions.submitJob')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ───────────── 详情 ───────────── */

function ItemPreview({ apiKey, batchId, item }: { apiKey: string; batchId: string; item: DetailItem }) {
  const [url, setUrl] = React.useState('')
  const [loading, setLoading] = React.useState(false)
  const [failed, setFailed] = React.useState(false)
  const [zoom, setZoom] = React.useState(false)
  const urlRef = React.useRef('')
  React.useEffect(
    () => () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current)
    },
    []
  )
  const load = async () => {
    setLoading(true)
    setFailed(false)
    try {
      const blob = await batch.getBatchImageItemContent(apiKey, batchId, item.custom_id, 0)
      const next = URL.createObjectURL(blob)
      if (urlRef.current) URL.revokeObjectURL(urlRef.current)
      urlRef.current = next
      setUrl(next)
    } catch (error) {
      setFailed(true)
      notify.error(errText(error, 'loadPreviewFailed'))
    } finally {
      setLoading(false)
    }
  }
  if (url)
    return (
      <>
        <button
          type="button"
          onClick={() => setZoom(true)}
          aria-label={t('batchImage.detail.previewZoom', { id: item.custom_id })}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- 本地 blob URL */}
          <img src={url} alt={item.custom_id} className="size-16 rounded-md border object-cover" />
        </button>
        <Dialog open={zoom} onOpenChange={setZoom}>
          <DialogContent className="sm:max-w-3xl">
            <DialogHeader>
              <DialogTitle>{t('batchImage.imagePreview.title')}</DialogTitle>
              <DialogDescription>{item.custom_id}</DialogDescription>
            </DialogHeader>
            {/* eslint-disable-next-line @next/next/no-img-element -- 本地 blob URL */}
            <img src={url} alt={item.custom_id} className="max-h-[70vh] w-full rounded-lg object-contain" />
          </DialogContent>
        </Dialog>
      </>
    )
  return (
    <Button size="sm" variant="outline" loading={loading} onClick={() => void load()}>
      <Eye aria-hidden />
      {failed ? t('batchImage.detail.previewReload') : t('batchImage.detail.previewLoad')}
    </Button>
  )
}

function DetailDialog({
  job,
  apiKey,
  onClose,
  onChanged
}: {
  job: JobRow | null
  apiKey: ApiKey | null
  onClose: () => void
  onChanged: (j: BatchImageJob) => void
}) {
  const [cancelled, setCancelled] = React.useState<BatchImageJob | null>(null)
  const [busy, setBusy] = React.useState('')
  const [confirmCancel, setConfirmCancel] = React.useState(false)
  const [prevId, setPrevId] = React.useState(job?.id)
  if (job?.id !== prevId) {
    setPrevId(job?.id)
    setCancelled(null)
  }
  const enabled = !!job && !!apiKey

  // 任务详情：未结束时每 8 秒轮询，结果同步回列表
  const jobQuery = useQuery({
    queryKey: ['user', 'batch-image', 'job', job?.id],
    enabled,
    queryFn: async () => {
      try {
        return await batch.getBatchImageJob(apiKey!.key, job!.id)
      } catch (error) {
        notify.error(errText(error, 'refreshFailed'))
        throw error
      }
    },
    refetchInterval: (q) => (q.state.data && isTerminal(q.state.data.status) ? false : 8000),
    retry: false
  })
  const fresh = jobQuery.data
  React.useEffect(() => {
    if (fresh) onChanged(fresh)
  }, [fresh, onChanged])
  const itemsQuery = useQuery({
    queryKey: ['user', 'batch-image', 'items', job?.id],
    enabled,
    queryFn: async (): Promise<DetailItem[]> => {
      try {
        const res = await batch.listBatchImageItems(apiKey!.key, job!.id)
        return (res.data || []).map((it) => ({ ...it, batch_id: job!.id, source_task_name: job!.task_name }))
      } catch (error) {
        notify.error(errText(error, 'loadItemsFailed'))
        throw error
      }
    },
    retry: false
  })
  const items = itemsQuery.data ?? []
  const loadingItems = itemsQuery.isLoading
  const job_ = cancelled ?? fresh ?? job
  const refresh = () => jobQuery.refetch()
  const loadItems = () => itemsQuery.refetch()

  const cancel = async () => {
    if (!job_ || !apiKey) return
    setBusy('cancel')
    try {
      const j = await batch.cancelBatchImageJob(apiKey.key, job_.id)
      setCancelled(j)
      onChanged(j)
      notify.success(msg('cancelled'))
    } catch (error) {
      notify.error(errText(error, 'cancelFailed'))
    } finally {
      setBusy('')
      setConfirmCancel(false)
    }
  }
  const download = async () => {
    if (!job_ || !apiKey) return
    setBusy('download')
    try {
      batch.saveBlob(await batch.downloadBatchImageZip(apiKey.key, job_.id), `${job_.id}.zip`)
    } catch (error) {
      notify.error(errText(error, 'downloadFailed'))
    } finally {
      setBusy('')
    }
  }

  return (
    <Dialog open={!!job} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{t('batchImage.detail.title')}</DialogTitle>
          <DialogDescription className="break-all">{job_?.task_name || job_?.id}</DialogDescription>
        </DialogHeader>
        {job_ ? (
          <>
            <dl className="grid gap-3 text-sm sm:grid-cols-4">
              <div>
                <dt className="text-xs text-muted-foreground">{t('batchImage.columns.model')}</dt>
                <dd className="break-all font-medium">{job_.model}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{t('batchImage.detail.result')}</dt>
                <dd className="flex flex-wrap items-center gap-1 font-medium">
                  <Badge variant={jobStatusTone(job_)}>{statusLabel(job_)}</Badge>
                  <span className="tabular text-xs text-muted-foreground">
                    {job_.success_count}/{job_.item_count}
                  </span>
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{t('batchImage.detail.cost')}</dt>
                <dd className="tabular font-medium">{costLabel(job_)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{t('batchImage.detail.downloadStatus')}</dt>
                <dd className="font-medium">
                  {job_.downloaded_at ? fmtDate(job_.downloaded_at) : t('batchImage.list.notDownloaded')}
                </dd>
              </div>
            </dl>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => void Promise.all([refresh(), loadItems()])}>
                <RefreshCw aria-hidden />
                {t('common.refresh')}
              </Button>
              {canDownload(job_) ? (
                <Button size="sm" loading={busy === 'download'} onClick={() => void download()}>
                  <Download aria-hidden />
                  {t('batchImage.actions.downloadZip')}
                </Button>
              ) : null}
              {canCancel(job_) ? (
                <Button
                  size="sm"
                  variant="destructive"
                  loading={busy === 'cancel'}
                  onClick={() => setConfirmCancel(true)}
                >
                  {t('batchImage.actions.cancelJob')}
                </Button>
              ) : null}
            </div>
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                    <th className="px-3 py-2 font-medium">{t('batchImage.detail.items')}</th>
                    <th className="px-3 py-2 font-medium">{t('batchImage.columns.result')}</th>
                    <th className="px-3 py-2 font-medium">{t('batchImage.detail.preview')}</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingItems ? (
                    <tr>
                      <td colSpan={3} className="px-3 py-6 text-center text-muted-foreground">
                        <Loader2
                          className="mx-auto size-4 animate-spin"
                          aria-label={t('batchImage.detail.loadingItems')}
                        />
                      </td>
                    </tr>
                  ) : items.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-3 py-6 text-center text-muted-foreground">
                        <p className="font-medium text-foreground">{t('batchImage.detail.noItems')}</p>
                        <p className="text-xs">{t('batchImage.detail.noItemsHint')}</p>
                      </td>
                    </tr>
                  ) : (
                    items.map((it) => {
                      const ok = it.status === 'succeeded' || it.status === 'success'
                      return (
                        <tr
                          key={`${it.batch_id}:${it.custom_id}`}
                          className="border-b align-top last:border-0"
                        >
                          <td className="px-3 py-2">
                            <p className="font-mono text-xs">{it.custom_id}</p>
                            {it.prompt_preview ? (
                              <p className="mt-0.5 line-clamp-2 max-w-md break-words text-xs text-muted-foreground">
                                {it.prompt_preview}
                              </p>
                            ) : null}
                          </td>
                          <td className="px-3 py-2">
                            <Badge variant={itemStatusTone(it.status)}>{itemStatusLabel(it.status)}</Badge>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {it.error
                                ? friendlyItemError(it.error)
                                : ok
                                  ? t('batchImage.itemResult.readyPreview')
                                  : it.status === 'failed'
                                    ? t('batchImage.itemResult.noUsableImage')
                                    : it.status === 'cancelled'
                                      ? t('batchImage.itemResult.cancelled')
                                      : t('batchImage.itemResult.waiting')}
                            </p>
                          </td>
                          <td className="px-3 py-2">
                            {ok && it.image_count > 0 && apiKey ? (
                              <ItemPreview apiKey={apiKey.key} batchId={job_.id} item={it} />
                            ) : (
                              <span className="text-xs text-muted-foreground">
                                {t('batchImage.detail.noImage')}
                              </span>
                            )}
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted-foreground">{t('batchImage.imagePreview.notice')}</p>
          </>
        ) : null}
        <ConfirmDialog
          open={confirmCancel}
          onOpenChange={setConfirmCancel}
          destructive
          title={t('batchImage.actions.cancelJob')}
          description={msg('cancelConfirm')}
          loading={busy === 'cancel'}
          onConfirm={cancel}
        />
      </DialogContent>
    </Dialog>
  )
}

/* ───────────── 页面 ───────────── */

export function BatchImagePage() {
  useLocale()
  const apiBase = useAppStore((s) => s.apiBaseUrl)
  const refreshAccess = useBatchImageAccessStore((s) => s.refresh)

  const keys = useQuery({
    queryKey: ['user', 'batch-image', 'keys'],
    queryFn: async () => {
      try {
        const res = await keysAPI.list(1, 100, {
          status: 'active',
          sort_by: 'created_at',
          sort_order: 'desc'
        })
        return (res.items || []).filter(keyAllowsBatchImage)
      } catch (error) {
        notify.error(msg('loadKeysFailed'))
        throw error
      }
    }
  })
  const apiKeys = React.useMemo(() => keys.data ?? [], [keys.data])

  const [filters, setFilters] = React.useState({ apiKeyId: 0, status: '', downloaded: '', taskName: '' })
  const [jobs, setJobs] = React.useState<JobRow[]>([])
  const [loadingJobs, setLoadingJobs] = React.useState(false)
  const [pageSize, setPageSize] = React.useState(20)
  const [hasMore, setHasMore] = React.useState(false)
  const [selected, setSelected] = React.useState<Set<string>>(new Set())
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set())
  const [createOpen, setCreateOpen] = React.useState(false)
  const [guideOpen, setGuideOpen] = React.useState(false)
  const [detail, setDetail] = React.useState<JobRow | null>(null)
  const [deleteTargets, setDeleteTargets] = React.useState<JobRow[] | null>(null)
  const [busy, setBusy] = React.useState('')

  const filteredKeys = React.useMemo(
    () => (filters.apiKeyId ? apiKeys.filter((k) => k.id === filters.apiKeyId) : apiKeys),
    [apiKeys, filters.apiKeyId]
  )
  const keyOf = React.useCallback((id: number) => apiKeys.find((k) => k.id === id) ?? null, [apiKeys])
  const toRow = (job: BatchImageJob, key: ApiKey): JobRow => ({
    ...job,
    api_key_id: key.id,
    api_key_name: key.name
  })

  const loadJobs = React.useCallback(async () => {
    if (filteredKeys.length === 0) {
      setJobs([])
      setHasMore(false)
      return
    }
    setLoadingJobs(true)
    try {
      const results = await Promise.all(
        filteredKeys.map(async (key) => {
          const r = await batch.listBatchImageJobs(key.key, {
            limit: pageSize,
            status: filters.status || undefined,
            downloaded: filters.downloaded || undefined,
            taskName: filters.taskName.trim() || undefined
          })
          return { more: Boolean(r.has_more), rows: (r.data || []).map((j) => toRow(j, key)) }
        })
      )
      setJobs(
        results
          .flatMap((r) => r.rows)
          .sort((a, b) => b.created_at - a.created_at)
          .slice(0, pageSize)
      )
      setHasMore(results.some((r) => r.more))
    } catch (error) {
      notify.error(errText(error, 'loadJobsFailed'))
    } finally {
      setLoadingJobs(false)
    }
  }, [filteredKeys, pageSize, filters.status, filters.downloaded, filters.taskName])

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 密钥或筛选变化时重新拉取任务列表
    if (!keys.isLoading) void loadJobs()
  }, [keys.isLoading, loadJobs])

  // 有未结束任务时每 8 秒刷新列表
  React.useEffect(() => {
    if (!jobs.some((j) => !isTerminal(j.status))) return
    const id = setInterval(() => void loadJobs(), 8000)
    return () => clearInterval(id)
  }, [jobs, loadJobs])

  const upsert = React.useCallback((job: BatchImageJob) => {
    setJobs((rows) => rows.map((r) => (r.id === job.id ? { ...r, ...job } : r)))
  }, [])

  const childrenByParent = React.useMemo(() => {
    const map = new Map<string, JobRow[]>()
    for (const j of jobs)
      if (j.parent_batch_id) map.set(j.parent_batch_id, [...(map.get(j.parent_batch_id) ?? []), j])
    return map
  }, [jobs])
  const visible = React.useMemo(() => {
    const ids = new Set(jobs.map((j) => j.id))
    const out: (JobRow & { child?: boolean })[] = []
    for (const j of jobs) {
      if (j.parent_batch_id && ids.has(j.parent_batch_id)) continue // 子任务挂在主任务下
      out.push(j)
      if (expanded.has(j.id))
        for (const c of childrenByParent.get(j.id) ?? []) out.push({ ...c, child: true })
    }
    return out
  }, [jobs, expanded, childrenByParent])

  const selectedRows = jobs.filter((j) => selected.has(j.id))
  const toggle = (id: string, on: boolean) =>
    setSelected((s) => {
      const n = new Set(s)
      if (on) n.add(id)
      else n.delete(id)
      return n
    })

  const download = async (job: JobRow) => {
    const key = keyOf(job.api_key_id)
    if (!key) return
    setBusy(`dl:${job.id}`)
    try {
      batch.saveBlob(await batch.downloadBatchImageZip(key.key, job.id), `${job.id}.zip`)
      setJobs((rows) =>
        rows.map((r) => (r.id === job.id ? { ...r, downloaded_at: Math.floor(Date.now() / 1000) } : r))
      )
    } catch (error) {
      notify.error(errText(error, 'downloadFailed'))
    } finally {
      setBusy('')
    }
  }
  const downloadSelected = async () => {
    const rows = selectedRows.filter(canDownload)
    if (rows.length === 0) return
    setBusy('bulk-dl')
    try {
      for (const r of rows) await download(r)
      notify.success(msg('batchDownloadStarted'))
    } finally {
      setBusy('')
    }
  }
  const retry = async (job: JobRow) => {
    const key = keyOf(job.api_key_id)
    if (!key || !canRetry(job) || busy) return
    setBusy(`retry:${job.id}`)
    try {
      const src = (await batch.listBatchImageItems(key.key, job.id)).data || []
      const failed = src
        .filter((i) => i.status === 'failed')
        .map((i) => ({
          custom_id: retryCustomID(i.custom_id),
          prompt: String(i.prompt_preview || '').trim()
        }))
        .filter((i) => i.prompt)
      if (failed.length === 0) return notify.error(msg('retryMissingPrompts'))
      const created = await batch.submitBatchImageJob(
        key.key,
        {
          model: job.model,
          task_name: `${job.task_name || defaultTaskName()} ${msg('retryTaskNameSuffix')}`,
          parent_batch_id: rootBatchIdForRetry(job),
          provider: job.provider,
          image_size: '1K',
          response_mime_type: 'image/png',
          items: failed
        },
        `sub2api-ui-retry-${job.id}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
      )
      setJobs((rows) => [toRow(created, key), ...rows])
      if (created.parent_batch_id) setExpanded((s) => new Set([...s, created.parent_batch_id as string]))
      notify.success(msg('retrySubmitted'))
    } catch (error) {
      notify.error(errText(error, 'retryFailed'))
    } finally {
      setBusy('')
    }
  }
  const doDelete = async () => {
    const targets = deleteTargets ?? []
    setBusy('delete')
    try {
      for (const j of targets) {
        const key = keyOf(j.api_key_id)
        if (key) await batch.deleteBatchImageJobRecord(key.key, j.id)
      }
      const ids = new Set(targets.map((j) => j.id))
      setJobs((rows) => rows.filter((r) => !ids.has(r.id)))
      setSelected((s) => new Set([...s].filter((id) => !ids.has(id))))
      notify.success(msg('deleted'))
    } catch (error) {
      notify.error(errText(error, 'deleteFailed'))
    } finally {
      setBusy('')
      setDeleteTargets(null)
    }
  }

  const endpointBase = (apiBase?.trim() || window.location.origin).replace(/\/+$/, '')
  const instruction = React.useMemo(() => buildAgentInstruction(endpointBase), [endpointBase])

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('batchImageGuide.title')}
        description={t('batchImageGuide.description')}
        actions={
          <>
            <Button variant="outline" onClick={() => setGuideOpen(true)}>
              <BookOpen aria-hidden />
              {t('batchImage.actions.usageGuide')}
            </Button>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus aria-hidden />
              {t('batchImage.actions.createJob')}
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <SearchInput
          value={filters.taskName}
          onValueChange={(v) => setFilters((f) => ({ ...f, taskName: v }))}
          placeholder={t('batchImage.filters.searchTaskName')}
          containerClassName="w-full sm:w-64"
        />
        <NativeSelect
          className="w-48"
          aria-label={t('batchImage.columns.apiKey')}
          value={filters.apiKeyId}
          onChange={(e) => setFilters((f) => ({ ...f, apiKeyId: Number(e.target.value) }))}
        >
          <option value={0}>{t('batchImage.filters.allApiKeys')}</option>
          {apiKeys.map((k) => (
            <option key={k.id} value={k.id}>
              {k.name}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect
          className="w-44"
          aria-label={t('batchImage.detail.result')}
          value={filters.status}
          onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
        >
          <option value="">{t('batchImage.filters.allStatuses')}</option>
          {['queued', 'running', 'processing_results', 'settling', 'completed', 'failed', 'cancelled'].map(
            (s) => (
              <option key={s} value={s}>
                {t(`batchImage.status.${jobStatusKey({ status: s, success_count: 0, fail_count: 0 })}`)}
              </option>
            )
          )}
        </NativeSelect>
        <NativeSelect
          className="w-48"
          aria-label={t('batchImage.columns.downloadStatus')}
          value={filters.downloaded}
          onChange={(e) => setFilters((f) => ({ ...f, downloaded: e.target.value }))}
        >
          <option value="">{t('batchImage.filters.allDownloadStates')}</option>
          <option value="true">{t('batchImage.filters.downloaded')}</option>
          <option value="false">{t('batchImage.filters.notDownloaded')}</option>
        </NativeSelect>
        <Button
          variant="outline"
          size="icon"
          aria-label={t('common.refresh')}
          onClick={() => void Promise.all([keys.refetch(), loadJobs()])}
          disabled={loadingJobs}
        >
          <RefreshCw className={loadingJobs ? 'animate-spin' : ''} aria-hidden />
        </Button>
      </div>

      {selected.size > 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-accent px-3 py-2 text-sm">
          <span className="font-medium">{t('batchImage.list.selectedJobs', { count: selected.size })}</span>
          <Button
            size="sm"
            variant="outline"
            loading={busy === 'bulk-dl'}
            disabled={!selectedRows.some(canDownload)}
            onClick={() => void downloadSelected()}
          >
            <Download aria-hidden />
            {t('batchImage.actions.downloadSelected')}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!selectedRows.some(canDeleteRecord)}
            onClick={() => setDeleteTargets(selectedRows.filter(canDeleteRecord))}
          >
            <Trash2 aria-hidden />
            {t('batchImage.actions.deleteRecords')}
          </Button>
        </div>
      ) : null}

      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-left text-xs uppercase text-muted-foreground">
              <th className="w-10 px-3 py-2.5">
                <Checkbox
                  aria-label="select all"
                  checked={visible.length > 0 && visible.every((j) => selected.has(j.id))}
                  onCheckedChange={(v) =>
                    setSelected(v === true ? new Set(visible.map((j) => j.id)) : new Set())
                  }
                />
              </th>
              <th className="px-3 py-2.5 font-medium">{t('batchImage.columns.taskName')}</th>
              <th className="px-3 py-2.5 font-medium">{t('batchImage.columns.model')}</th>
              <th className="px-3 py-2.5 font-medium">{t('batchImage.columns.apiKey')}</th>
              <th className="px-3 py-2.5 font-medium">{t('batchImage.columns.result')}</th>
              <th className="px-3 py-2.5 font-medium">{t('batchImage.columns.cost')}</th>
              <th className="px-3 py-2.5 font-medium">{t('batchImage.columns.downloadStatus')}</th>
              <th className="px-3 py-2.5 font-medium">{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {loadingJobs && jobs.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-10 text-center">
                  <Loader2
                    className="mx-auto size-5 animate-spin text-primary"
                    aria-label={t('common.loading')}
                  />
                </td>
              </tr>
            ) : visible.length === 0 ? (
              <tr>
                <td colSpan={8}>
                  <EmptyState
                    title={t('batchImage.list.empty')}
                    description={t('batchImage.list.emptyHint')}
                  />
                </td>
              </tr>
            ) : (
              visible.map((j) => {
                const kids = childrenByParent.get(j.id)?.length ?? 0
                return (
                  <tr key={j.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="px-3 py-2.5">
                      <Checkbox
                        aria-label={j.task_name}
                        checked={selected.has(j.id)}
                        onCheckedChange={(v) => toggle(j.id, v === true)}
                      />
                    </td>
                    <td className="px-3 py-2.5">
                      <div
                        className={j.child ? 'flex items-center gap-1.5 pl-5' : 'flex items-center gap-1.5'}
                      >
                        {kids > 0 ? (
                          <button
                            type="button"
                            aria-expanded={expanded.has(j.id)}
                            aria-label={
                              expanded.has(j.id)
                                ? t('batchImage.list.collapseChildren')
                                : t('batchImage.list.expandChildren', { n: kids, count: kids })
                            }
                            onClick={() =>
                              setExpanded((s) => {
                                const n = new Set(s)
                                if (n.has(j.id)) n.delete(j.id)
                                else n.add(j.id)
                                return n
                              })
                            }
                          >
                            {expanded.has(j.id) ? (
                              <ChevronDown className="size-4" aria-hidden />
                            ) : (
                              <ChevronRight className="size-4" aria-hidden />
                            )}
                          </button>
                        ) : null}
                        <div className="min-w-0">
                          <button
                            type="button"
                            className="max-w-xs truncate text-left font-medium hover:underline"
                            onClick={() => setDetail(j)}
                          >
                            {j.task_name || j.id}
                          </button>
                          <p className="text-xs text-muted-foreground">
                            {j.child ? (
                              <Badge variant="secondary" className="mr-1">
                                {t('batchImage.list.childBadge')}
                              </Badge>
                            ) : null}
                            {fmtDate(j.created_at)}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="max-w-40 truncate px-3 py-2.5" title={j.model}>
                      {j.model}
                    </td>
                    <td className="px-3 py-2.5">{j.api_key_name || t('batchImage.list.keyNotRecorded')}</td>
                    <td className="px-3 py-2.5">
                      <Badge variant={jobStatusTone(j)}>{statusLabel(j)}</Badge>
                      <span className="tabular ml-1.5 text-xs text-muted-foreground">
                        {j.success_count}/{j.item_count}
                      </span>
                    </td>
                    <td className="tabular px-3 py-2.5">{costLabel(j)}</td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground">
                      {j.downloaded_at ? fmtDate(j.downloaded_at) : t('batchImage.list.notDownloaded')}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-0.5">
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={t('batchImage.actions.viewDetail')}
                          title={t('batchImage.actions.viewDetail')}
                          onClick={() => setDetail(j)}
                        >
                          <Eye aria-hidden />
                        </Button>
                        {canDownload(j) ? (
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label={t('batchImage.actions.downloadZip')}
                            title={t('batchImage.actions.downloadZip')}
                            disabled={busy === `dl:${j.id}`}
                            onClick={() => void download(j)}
                          >
                            <Download aria-hidden />
                          </Button>
                        ) : null}
                        {canRetry(j) ? (
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label={t('batchImage.actions.retryFailedItems')}
                            title={t('batchImage.actions.retryFailedItems')}
                            disabled={busy === `retry:${j.id}`}
                            onClick={() => void retry(j)}
                          >
                            <RotateCcw aria-hidden />
                          </Button>
                        ) : null}
                        {canDeleteRecord(j) ? (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="text-destructive hover:text-destructive"
                            aria-label={t('common.delete')}
                            title={t('common.delete')}
                            onClick={() => setDeleteTargets([j])}
                          >
                            <Trash2 aria-hidden />
                          </Button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t px-3 py-2.5 text-sm text-muted-foreground">
          <span>{t('batchImage.pagination.pageItems', { count: visible.length })}</span>
          <div className="flex items-center gap-2">
            <NativeSelect
              className="h-8 w-20"
              aria-label={t('ui.table.rowsPerPage')}
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
            >
              {[20, 50, 100].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </NativeSelect>
            {hasMore ? (
              <Button size="sm" variant="outline" onClick={() => setPageSize((n) => Math.min(100, n + 20))}>
                {t('common.next')}
              </Button>
            ) : null}
          </div>
        </div>
      </Card>

      <CreateDialog
        key={createOpen ? 'open' : 'closed'}
        open={createOpen}
        onOpenChange={setCreateOpen}
        keys={apiKeys}
        onCreated={(job, key) => {
          setCreateOpen(false)
          setJobs((rows) => [toRow(job, key), ...rows])
          setDetail(toRow(job, key))
          void refreshAccess(true)
        }}
      />
      <DetailDialog
        job={detail}
        apiKey={detail ? keyOf(detail.api_key_id) : null}
        onClose={() => setDetail(null)}
        onChanged={upsert}
      />
      <ConfirmDialog
        open={!!deleteTargets}
        onOpenChange={(o) => !o && setDeleteTargets(null)}
        destructive
        title={t('batchImage.actions.deleteRecords')}
        description={
          deleteTargets && deleteTargets.length > 1 ? msg('deleteSelectedConfirm') : msg('deleteConfirm')
        }
        loading={busy === 'delete'}
        onConfirm={doDelete}
      />
      <Dialog open={guideOpen} onOpenChange={setGuideOpen}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{t('batchImage.guide.title')}</DialogTitle>
            <DialogDescription>{t('batchImage.guide.uiTitle')}</DialogDescription>
          </DialogHeader>
          <ol className="space-y-2 text-sm text-muted-foreground">
            {(['step1', 'step2', 'step3', 'step4'] as const).map((s) => (
              <li key={s}>{t(`batchImage.guide.${s}`)}</li>
            ))}
          </ol>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold">{t('batchImage.guide.skillTitle')}</h3>
                <p className="text-xs text-muted-foreground">{t('batchImage.guide.skillDesc')}</p>
              </div>
              <CopyButton
                value={instruction}
                size="sm"
                variant="outline"
                aria-label={t('batchImage.actions.copyInstruction')}
              >
                {t('batchImage.actions.copyInstruction')}
              </CopyButton>
            </div>
            <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-lg border bg-muted p-3 font-mono text-xs leading-relaxed">
              {instruction}
            </pre>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
