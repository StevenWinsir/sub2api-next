/** “使用密钥”对话框：按平台 / 客户端 / 操作系统生成配置片段（逻辑见 keyConfigs.ts）。 */
import * as React from 'react'
import { saveAs } from 'file-saver'
import { AlertTriangle, Check, Copy, Download, Info, Loader2, RefreshCw } from 'lucide-react'
import { buildCodexModelCatalogUrl, fetchCodexModelsManifest } from '@/api/codex'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { NativeSelect } from '@/components/NativeSelect'
import { useClipboard } from '@/hooks/useClipboard'
import { t } from '@/i18n'
import { cn } from '@/lib/utils'
import type { GroupPlatform } from '@/types'
import { parseCodexCatalogModels } from '@/utils/codexCatalogConfig'
import {
  buildKeyConfigFiles,
  CODEX_MODEL_CATALOG_CONFIG_PATH,
  codexModelCatalogLocalPath,
  type CodexAuthMode,
  type FileConfig
} from './keyConfigs'

interface Tab {
  id: string
  label: string
}

const SHELL_TABS: Tab[] = [
  { id: 'unix', label: 'macOS / Linux' },
  { id: 'cmd', label: 'Windows CMD' },
  { id: 'powershell', label: 'PowerShell' }
]
const OPENAI_TABS: Tab[] = [
  { id: 'unix', label: 'macOS / Linux' },
  { id: 'windows', label: 'Windows' }
]

function clientTabsFor(
  platform: GroupPlatform | null,
  claudeCodeOnly: boolean,
  allowMessagesDispatch: boolean
): Tab[] {
  const k = (id: string) => t(`keys.useKeyModal.cliTabs.${id}`)
  if (!platform) return []
  if (claudeCodeOnly) return [{ id: 'claude', label: k('claudeCode') }]
  const claude = { id: 'claude', label: k('claudeCode') }
  const codex = { id: 'codex', label: k('codexCli') }
  const opencode = { id: 'opencode', label: k('opencode') }
  switch (platform) {
    case 'openai':
      return [
        codex,
        { id: 'codex-ws', label: k('codexCliWs') },
        ...(allowMessagesDispatch ? [claude] : []),
        opencode
      ]
    case 'gemini':
      return [{ id: 'gemini', label: k('geminiCli') }, codex, opencode]
    case 'antigravity':
      return [claude, { id: 'gemini', label: k('geminiCli') }, codex, opencode]
    case 'grok':
      return [{ id: 'grok', label: k('grokCli') }, claude, codex, opencode]
    case 'typesafe':
      return [{ id: 'systemone', label: k('systemOne') }]
    default:
      return [claude, codex, opencode]
  }
}

function defaultClient(platform: GroupPlatform | null, claudeCodeOnly: boolean): string {
  if (claudeCodeOnly) return 'claude'
  switch (platform) {
    case 'openai':
      return 'codex'
    case 'grok':
      return 'grok'
    case 'gemini':
      return 'gemini'
    case 'typesafe':
      return 'systemone'
    default:
      return 'claude'
  }
}

const ROUTED_CODEX_EXCLUDED = ['openai', 'grok', 'deepseek', 'minimax', 'composite']

function describe(
  platform: GroupPlatform | null,
  client: string,
  tab: string
): { description: string; note: string } {
  const routedCodex = client === 'codex' && !ROUTED_CODEX_EXCLUDED.includes(platform ?? '')
  const k = (key: string) => t(`keys.useKeyModal.${key}`)
  if (routedCodex) return { description: k('routedCodex.description'), note: k('routedCodex.note') }
  switch (platform) {
    case 'openai':
      return client === 'claude'
        ? { description: k('description'), note: k('note') }
        : {
            description: k('openai.description'),
            note: tab === 'windows' ? k('openai.noteWindows') : k('openai.note')
          }
    case 'gemini':
      return { description: k('gemini.description'), note: k('gemini.note') }
    case 'antigravity':
      return {
        description: k('antigravity.description'),
        note: client === 'claude' ? k('antigravity.claudeNote') : k('antigravity.geminiNote')
      }
    case 'grok': {
      if (client === 'claude') return { description: k('grok.claudeDescription'), note: k('grok.claudeNote') }
      if (client === 'codex') {
        return {
          description: k('grok.codexDescription'),
          note: tab === 'windows' ? k('grok.codexNoteWindows') : k('grok.codexNote')
        }
      }
      const win = client === 'grok' && (tab === 'cmd' || tab === 'powershell' || tab === 'windows')
      return { description: k('grok.description'), note: win ? k('grok.noteWindows') : k('grok.note') }
    }
    case 'deepseek':
    case 'minimax':
    case 'composite': {
      const codex = client === 'codex'
      return {
        description: codex ? k(`${platform}.codexDescription`) : k(`${platform}.description`),
        note: codex ? k(`${platform}.codexNote`) : k('note')
      }
    }
    case 'typesafe':
      return { description: k('typesafe.description'), note: k('typesafe.note') }
    default:
      return { description: k('description'), note: k('note') }
  }
}

function TabBar({
  tabs,
  value,
  onChange,
  label
}: {
  tabs: Tab[]
  value: string
  onChange: (id: string) => void
  label: string
}) {
  return (
    <div className="overflow-x-auto border-b">
      <div role="tablist" aria-label={label} className="-mb-px flex min-w-max gap-4">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={value === tab.id}
            onClick={() => onChange(tab.id)}
            className={cn(
              'whitespace-nowrap border-b-2 px-1 py-2.5 text-sm font-medium transition-colors',
              value === tab.id
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function CodeBlock({ file }: { file: FileConfig }) {
  const { copied, copy } = useClipboard(2000)
  return (
    <div>
      {file.hint ? (
        <p className="mb-1.5 flex items-start gap-1 text-xs text-warning">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {file.hint}
        </p>
      ) : null}
      <div className="overflow-hidden rounded-lg border bg-[oklch(0.2_0.01_260)] text-[oklch(0.95_0_0)]">
        <div className="flex items-center justify-between border-b border-white/10 px-3 py-1.5">
          <span className="min-w-0 truncate font-mono text-xs text-white/60">{file.path}</span>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 text-white/80 hover:bg-white/10 hover:text-white"
            onClick={() => void copy(file.content, { toast: false })}
          >
            {copied ? <Check className="text-success" aria-hidden /> : <Copy aria-hidden />}
            {copied ? t('keys.useKeyModal.copied') : t('keys.useKeyModal.copy')}
          </Button>
        </div>
        <pre className="overflow-x-auto p-4 font-mono text-[13px] leading-relaxed">
          <code>{file.content}</code>
        </pre>
      </div>
    </div>
  )
}

export interface UseKeyDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  apiKey: string
  baseUrl: string
  platform: GroupPlatform | null
  claudeCodeOnly?: boolean
  allowMessagesDispatch?: boolean
}

function UseKeyBody({
  apiKey,
  baseUrl,
  platform,
  claudeCodeOnly = false,
  allowMessagesDispatch = false
}: Omit<UseKeyDialogProps, 'open' | 'onOpenChange'>) {
  const [client, setClient] = React.useState(() => defaultClient(platform, claudeCodeOnly))
  const [shell, setShell] = React.useState('unix')
  const [authMode, setAuthMode] = React.useState<CodexAuthMode>('api-key')
  const [catalogMode, setCatalogMode] = React.useState<'remote' | 'file'>('remote')
  const [manifest, setManifest] = React.useState({
    state: 'idle' as 'idle' | 'loading' | 'ready' | 'error',
    content: '',
    count: 0,
    bytes: 0
  })
  const controller = React.useRef<AbortController | null>(null)
  const requestId = React.useRef(0)

  const tabs = clientTabsFor(platform, claudeCodeOnly, allowMessagesDispatch)
  const showCatalog = client === 'codex' || (platform === 'openai' && client === 'codex-ws')
  const showAuthMode = platform === 'openai' && (client === 'codex' || client === 'codex-ws')
  const showShell = client !== 'opencode'
  const shellTabs =
    client === 'codex' || client === 'codex-ws' || client === 'grok' ? OPENAI_TABS : SHELL_TABS
  const oversized = manifest.bytes > 1024 * 1024
  const effectiveCatalogMode = oversized ? 'file' : catalogMode

  const slugs = React.useMemo(
    () => parseCodexCatalogModels(manifest.content).map((m) => m.slug),
    [manifest.content]
  )
  const files = React.useMemo(
    () =>
      buildKeyConfigFiles({
        platform,
        apiKey,
        baseUrl,
        activeClientTab: client,
        activeTab: shell,
        codexAuthMode: authMode,
        codexModelCatalogMode: effectiveCatalogMode,
        codexLocalCatalogToml:
          effectiveCatalogMode === 'file'
            ? `model_catalog_json = "${CODEX_MODEL_CATALOG_CONFIG_PATH}"\n`
            : '',
        codexCatalogModelSlugs: slugs,
        codexModelManifestContent: manifest.content
      }),
    [platform, apiKey, baseUrl, client, shell, authMode, effectiveCatalogMode, slugs, manifest.content]
  )
  const { description, note } = describe(platform, client, shell)

  React.useEffect(() => () => controller.current?.abort(), [])

  const loadManifest = async () => {
    if (!apiKey) return
    controller.current?.abort()
    const c = new AbortController()
    controller.current = c
    const id = ++requestId.current
    setManifest((m) => ({ ...m, state: 'loading' }))
    try {
      const r = await fetchCodexModelsManifest(baseUrl, apiKey, c.signal)
      if (id !== requestId.current) return
      setManifest({ state: 'ready', content: r.content, count: r.modelCount, bytes: r.responseBytes })
    } catch (error) {
      if (id !== requestId.current || (error as { name?: string })?.name === 'AbortError') return
      setManifest((m) => ({ ...m, state: 'error' }))
    }
  }

  const selectClient = (id: string) => {
    setClient(id)
    setShell('unix')
  }

  if (!platform) {
    return (
      <div className="flex items-start gap-3 rounded-lg border border-warning/40 bg-warning/10 p-4">
        <AlertTriangle className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden />
        <div>
          <p className="text-sm font-medium">{t('keys.useKeyModal.noGroupTitle')}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t('keys.useKeyModal.noGroupDescription')}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{description}</p>
      {tabs.length > 0 ? <TabBar tabs={tabs} value={client} onChange={selectClient} label="Client" /> : null}

      {showAuthMode ? (
        <div className="rounded-lg border p-3">
          <p className="text-sm font-medium">{t('keys.useKeyModal.openai.authModeTitle')}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t('keys.useKeyModal.openai.authModeDescription')}
          </p>
          <div
            role="radiogroup"
            aria-label={t('keys.useKeyModal.openai.authModeTitle')}
            className="mt-2 grid grid-cols-2 gap-1 rounded-md bg-muted p-1"
          >
            {(['legacy', 'api-key'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                role="radio"
                data-testid={`codex-auth-mode-${mode}`}
                aria-checked={authMode === mode}
                onClick={() => setAuthMode(mode)}
                className={cn(
                  'rounded px-3 py-1.5 text-sm font-medium transition-colors',
                  authMode === mode ? 'bg-card shadow-xs' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {mode === 'legacy'
                  ? t('keys.useKeyModal.openai.authModeLegacy')
                  : t('keys.useKeyModal.openai.authModeApiKey')}
              </button>
            ))}
          </div>
          {authMode === 'api-key' ? (
            <p
              data-testid="codex-api-key-restart-notice"
              className="mt-3 flex items-start gap-2 border-l-2 border-warning bg-warning/10 px-3 py-2 text-xs leading-5"
            >
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden />
              {t('keys.useKeyModal.openai.authModeApiKeyRestartNotice')}
            </p>
          ) : null}
        </div>
      ) : null}

      {showShell ? <TabBar tabs={shellTabs} value={shell} onChange={setShell} label="Tabs" /> : null}

      <div className="space-y-4">
        {files.map((file, i) => (
          <CodeBlock key={`${file.path}-${i}`} file={file} />
        ))}
      </div>

      {showCatalog ? (
        <section data-testid="codex-model-catalog" className="rounded-lg border bg-muted/40">
          <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <h3 className="text-sm font-medium">{t('keys.useKeyModal.codexModelCatalog.title')}</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                {t('keys.useKeyModal.codexModelCatalog.description')}
              </p>
              <p className="mt-1 truncate font-mono text-xs">
                {effectiveCatalogMode === 'remote'
                  ? buildCodexModelCatalogUrl(baseUrl)
                  : codexModelCatalogLocalPath(shell === 'windows')}
              </p>
              <NativeSelect
                className="mt-2"
                value={effectiveCatalogMode}
                data-testid="codex-model-catalog-mode"
                aria-label={t('keys.useKeyModal.codexModelCatalog.mode')}
                onChange={(e) => setCatalogMode(e.target.value as 'remote' | 'file')}
              >
                <option value="remote" disabled={oversized}>
                  {t('keys.useKeyModal.codexModelCatalog.remote')}
                </option>
                <option value="file">{t('keys.useKeyModal.codexModelCatalog.local')}</option>
              </NativeSelect>
              {oversized ? (
                <p className="mt-2 text-xs text-warning">
                  {t('keys.useKeyModal.codexModelCatalog.oversized')}
                </p>
              ) : null}
            </div>
            {manifest.state === 'ready' ? (
              <Button
                type="button"
                size="sm"
                onClick={() =>
                  saveAs(
                    new Blob([manifest.content], { type: 'application/json;charset=utf-8' }),
                    'codex-models.json'
                  )
                }
              >
                <Download aria-hidden />
                {t('keys.useKeyModal.codexModelCatalog.download')}
              </Button>
            ) : (
              <Button
                type="button"
                size="sm"
                data-testid="codex-model-catalog-fetch"
                disabled={manifest.state === 'loading' || !apiKey}
                onClick={() => void loadManifest()}
              >
                {manifest.state === 'loading' ? (
                  <Loader2 className="animate-spin" aria-hidden />
                ) : (
                  <RefreshCw aria-hidden />
                )}
                {manifest.state === 'error'
                  ? t('keys.useKeyModal.codexModelCatalog.retry')
                  : t('keys.useKeyModal.codexModelCatalog.fetch')}
              </Button>
            )}
          </div>
          {manifest.state === 'ready' ? (
            <p className="border-t px-4 py-2 text-xs text-success">
              {t('keys.useKeyModal.codexModelCatalog.modelsCount', { count: manifest.count })}
            </p>
          ) : manifest.state === 'error' ? (
            <p className="border-t px-4 py-2 text-xs text-destructive">
              {t('keys.useKeyModal.codexModelCatalog.errorDescription')}
            </p>
          ) : null}
        </section>
      ) : null}

      {client !== 'opencode' ? (
        <div className="flex items-start gap-3 rounded-lg border border-info/30 bg-info/10 p-3">
          <Info className="mt-0.5 size-4 shrink-0 text-info" aria-hidden />
          <p className="text-sm">{note}</p>
        </div>
      ) : null}
    </div>
  )
}

export function UseKeyDialog({ open, onOpenChange, ...body }: UseKeyDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t('keys.useKeyModal.title')}</DialogTitle>
          <DialogDescription className="sr-only">{t('keys.useKeyModal.description')}</DialogDescription>
        </DialogHeader>
        {/* 以 key 重置内部状态（平台 / 密钥变化时回到默认客户端） */}
        {open ? (
          <UseKeyBody key={`${body.platform}|${body.claudeCodeOnly}|${body.apiKey}`} {...body} />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
