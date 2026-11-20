/** 账号连通性测试：SSE 流式输出，可中断，错误展示，媒体结果预览。 */
import * as React from 'react'
import { Copy, Play, Square } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { adminAPI } from '@/api/admin'
import { FormField } from '@/components/FormField'
import { NativeSelect } from '@/components/NativeSelect'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/input'
import { AdminFormDialog } from '@/features/admin/common/AdminFormDialog'
import { notifySuccess } from '@/features/admin/common/notify'
import { t } from '@/i18n'
import type { Account } from '@/types'
import { streamAccountTest, type TestEvent, type TestRequestBody } from './testStream'

type Status = 'idle' | 'connecting' | 'success' | 'error'
interface Line {
  text: string
  tone: 'info' | 'ok' | 'muted' | 'warn' | 'error' | 'accent'
}
interface Media {
  kind: 'image' | 'audio' | 'video'
  url: string
}

const TONE: Record<Line['tone'], string> = {
  info: 'text-info',
  ok: 'text-success',
  muted: 'text-muted-foreground',
  warn: 'text-warning',
  error: 'text-destructive',
  accent: 'text-primary'
}

export function AccountTestDialog({ account, onClose }: { account: Account; onClose: () => void }) {
  const [status, setStatus] = React.useState<Status>('idle')
  const [lines, setLines] = React.useState<Line[]>([])
  const [streaming, setStreaming] = React.useState('')
  const [error, setError] = React.useState('')
  const [media, setMedia] = React.useState<Media[]>([])
  const [modelId, setModelId] = React.useState('')
  const [prompt, setPrompt] = React.useState('')
  const [mode, setMode] = React.useState<'default' | 'compact'>('default')
  const abortRef = React.useRef<AbortController | null>(null)
  const terminalRef = React.useRef<HTMLDivElement>(null)

  const models = useQuery({
    queryKey: ['admin', 'accounts', account.id, 'models'],
    queryFn: () => adminAPI.accounts.getAvailableModels(account.id)
  })
  // 模型列表到达后默认选第一个（渲染期派生，不用 effect）
  if (models.data && models.data.length > 0 && !modelId) setModelId(models.data[0].id)

  React.useEffect(() => () => abortRef.current?.abort(), [])
  React.useEffect(() => {
    terminalRef.current?.scrollTo({ top: terminalRef.current.scrollHeight })
  }, [lines, streaming])

  const add = (text: string, tone: Line['tone'] = 'muted') => setLines((prev) => [...prev, { text, tone }])

  const flush = () => {
    setStreaming((s) => {
      if (s) setLines((prev) => [...prev, { text: s, tone: 'ok' }])
      return ''
    })
  }

  const handle = (e: TestEvent) => {
    switch (e.type) {
      case 'test_start':
        add(t('admin.accounts.connectedToApi'), 'ok')
        if (e.model) add(t('admin.accounts.usingModel', { model: e.model }), 'info')
        add(t('admin.accounts.sendingTestMessage'))
        add(t('admin.accounts.response'), 'warn')
        break
      case 'content':
        if (e.text) setStreaming((s) => s + e.text)
        break
      case 'image':
      case 'audio':
      case 'video': {
        const url = e.image_url || e.audio_url || e.video_url
        if (url) setMedia((m) => [...m, { kind: e.type as Media['kind'], url }])
        break
      }
      case 'status':
        if (e.text) add(e.text, 'accent')
        break
      case 'test_complete':
        flush()
        if (e.success) setStatus('success')
        else {
          setStatus('error')
          setError(e.error || t('admin.accounts.testFailed'))
        }
        break
      case 'error':
        flush()
        setStatus('error')
        setError(e.error || t('common.unknownError'))
        break
    }
  }

  const start = async () => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setLines([])
    setStreaming('')
    setMedia([])
    setError('')
    setStatus('connecting')
    add(t('admin.accounts.startingTestForAccount', { name: account.name }), 'info')
    add(t('admin.accounts.testAccountTypeLabel', { type: account.type }))
    const body: TestRequestBody = { model_id: modelId, prompt: prompt.trim() }
    if (account.platform === 'openai') body.mode = mode
    try {
      await streamAccountTest(account.id, body, handle, controller.signal)
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setStatus('idle')
        return
      }
      const msg = err instanceof Error ? err.message : t('common.unknownError')
      setStatus('error')
      setError(msg)
      add(t('admin.accounts.errorPrefix', { message: msg }), 'error')
    }
  }

  const stop = () => {
    abortRef.current?.abort()
    abortRef.current = null
    setStatus('idle')
  }

  const copy = async () => {
    await navigator.clipboard.writeText(
      lines.map((l) => l.text).join('\n') + (streaming ? `\n${streaming}` : '')
    )
    notifySuccess(t('admin.accounts.outputCopied'))
  }

  const running = status === 'connecting'

  return (
    <AdminFormDialog
      open
      onOpenChange={(o) => {
        if (!o) {
          abortRef.current?.abort()
          onClose()
        }
      }}
      title={t('admin.accounts.testConnection')}
      description={`${account.name} · ${account.platform}`}
      size="lg"
      footerExtra={
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => void copy()}
          disabled={lines.length === 0}
        >
          <Copy aria-hidden />
          {t('common.copy')}
        </Button>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label={t('admin.accounts.selectTestModel')}>
          <NativeSelect value={modelId} onChange={(e) => setModelId(e.target.value)} disabled={running}>
            {(models.data ?? []).map((m) => (
              <option key={m.id} value={m.id}>
                {m.display_name || m.id}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        {account.platform === 'openai' ? (
          <FormField label={t('admin.accounts.openai.testModeDefault')}>
            <NativeSelect
              value={mode}
              onChange={(e) => setMode(e.target.value as 'default' | 'compact')}
              disabled={running}
            >
              <option value="default">{t('admin.accounts.openai.testModeDefault')}</option>
              <option value="compact">{t('admin.accounts.openai.testModeCompact')}</option>
            </NativeSelect>
          </FormField>
        ) : null}
        <FormField label={t('admin.accounts.imagePromptLabel')} className="sm:col-span-2">
          <Textarea
            rows={2}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={t('admin.accounts.imagePromptPlaceholder')}
            disabled={running}
          />
        </FormField>
      </div>
      <div
        ref={terminalRef}
        role="log"
        aria-live="polite"
        className="h-64 overflow-y-auto whitespace-pre-wrap rounded-md border bg-muted/50 p-3 font-mono text-xs"
      >
        {lines.length === 0 && !streaming ? (
          <span className="text-muted-foreground">{t('admin.accounts.readyToTest')}</span>
        ) : null}
        {lines.map((l, i) => (
          <div key={i} className={TONE[l.tone]}>
            {l.text || ' '}
          </div>
        ))}
        {streaming ? <div className="text-success">{streaming}</div> : null}
        {status === 'error' && error ? <div className="text-destructive">{error}</div> : null}
        {status === 'success' ? (
          <div className="text-success">{t('admin.accounts.testCompleted')}</div>
        ) : null}
      </div>
      {media.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {media.map((m, i) =>
            m.kind === 'image' ? (
              // eslint-disable-next-line @next/next/no-img-element -- 测试返回的 data URL / 远程图，无需 next/image
              <img key={i} src={m.url} alt="" className="max-h-40 rounded-md border" />
            ) : m.kind === 'audio' ? (
              <audio key={i} src={m.url} controls />
            ) : (
              <video key={i} src={m.url} controls className="max-h-40 rounded-md border" />
            )
          )}
        </div>
      ) : null}
      <div className="flex justify-end gap-2">
        {running ? (
          <Button type="button" variant="destructive" onClick={stop}>
            <Square aria-hidden />
            {t('common.cancel')}
          </Button>
        ) : (
          <Button
            type="button"
            onClick={() => void start()}
            disabled={!modelId && (models.data?.length ?? 0) > 0}
          >
            <Play aria-hidden />
            {status === 'idle' ? t('admin.accounts.startTest') : t('admin.accounts.retry')}
          </Button>
        )}
      </div>
    </AdminFormDialog>
  )
}
