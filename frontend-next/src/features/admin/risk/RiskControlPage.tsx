/** /admin/risk-control：内容审核（概览 / 运行态 / 审计记录 / 设置对话框 / 密钥测试 / 风险哈希）。 */
import * as React from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { ImagePlus, RefreshCw, Settings, ShieldAlert, X } from 'lucide-react'
import { adminAPI } from '@/api/admin'
import type {
  ContentModerationAPIKeyStatus,
  ContentModerationConfig,
  ContentModerationLog,
  ContentModerationRuntimeStatus,
  ContentModerationTestAuditResult,
  ModerationEngine
} from '@/api/admin/riskControl'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { DataTable } from '@/components/DataTable'
import { FormField } from '@/components/FormField'
import { NativeSelect } from '@/components/NativeSelect'
import { PageHeader } from '@/components/PageHeader'
import { StatCard } from '@/components/StatCard'
import { StatusBadge } from '@/components/StatusBadge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input, Textarea } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AdminFormDialog } from '@/features/admin/common/AdminFormDialog'
import { FilterBar, FilterSelect } from '@/features/admin/common/FilterBar'
import { notifyError, notifySuccess } from '@/features/admin/common/notify'
import { useTableState } from '@/features/admin/common/useTableState'
import { t } from '@/i18n'
import { useLocale } from '@/i18n/react'
import { useAppStore } from '@/stores/app'
import { formatDateTime } from '@/utils/format'
import {
  blockedKeywordMax,
  buildSavePayload,
  captureEngineDraft,
  clampPercent,
  configToForm,
  normalizeDateTimeLocal,
  parseApiKeys,
  parseBlockedKeywords,
  riskThresholdCategories,
  riskThresholdDefaults,
  type ConfigForm,
  type EngineDraft
} from './riskModel'

const MAX_TEST_IMAGES = 1
const MAX_TEST_IMAGE_BYTES = 8 * 1024 * 1024
const MAX_VISIBLE_KEY_ROWS = 3
const STATUS_REFRESH_MS = 15_000
const nf = (n: number) => new Intl.NumberFormat().format(n)

const keyTone = (s: ContentModerationAPIKeyStatus['status']) =>
  s === 'ok' ? 'success' : s === 'error' ? 'error' : s === 'frozen' ? 'warning' : 'neutral'
const keyLabel = (s: ContentModerationAPIKeyStatus['status']) =>
  t(
    s === 'ok'
      ? 'admin.riskControl.apiKeyStatusOk'
      : s === 'error'
        ? 'admin.riskControl.apiKeyStatusError'
        : s === 'frozen'
          ? 'admin.riskControl.apiKeyStatusFrozen'
          : 'admin.riskControl.apiKeyStatusUnknown'
  )

function ApiKeyRow({
  row,
  pendingDelete,
  onToggleDelete
}: {
  row: ContentModerationAPIKeyStatus
  pendingDelete: boolean
  onToggleDelete: () => void
}) {
  return (
    <li
      className={`flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-xs ${pendingDelete ? 'opacity-50' : ''}`}
    >
      <span className="font-mono">{row.masked}</span>
      <StatusBadge status={keyTone(row.status)}>{keyLabel(row.status)}</StatusBadge>
      <Badge variant="secondary">
        {row.configured ? t('admin.riskControl.apiKeyConfigured') : t('admin.riskControl.apiKeyTemporary')}
      </Badge>
      {pendingDelete ? <Badge variant="secondary">{t('admin.riskControl.apiKeyPendingDelete')}</Badge> : null}
      <span className="text-muted-foreground">
        {row.last_tested
          ? `${t('admin.riskControl.apiKeyLatency', { ms: row.last_latency_ms })} · ${t('admin.riskControl.apiKeyHTTPStatus', { status: row.last_http_status })}`
          : t('admin.riskControl.apiKeyNotTested')}
        {row.failure_count
          ? ` · ${t('admin.riskControl.apiKeyFailureCount', { count: row.failure_count })}`
          : ''}
        {row.frozen_until
          ? ` · ${t('admin.riskControl.apiKeyFrozenUntil', { time: formatDateTime(row.frozen_until) })}`
          : ''}
      </span>
      {row.last_error ? <span className="w-full break-words text-destructive">{row.last_error}</span> : null}
      {row.configured && row.key_hash ? (
        <Button type="button" size="sm" variant="ghost" className="ml-auto h-6" onClick={onToggleDelete}>
          {pendingDelete ? t('admin.riskControl.undoDeleteApiKey') : t('admin.riskControl.deleteApiKey')}
        </Button>
      ) : null}
    </li>
  )
}

/** 外层：加载服务端配置；内层以配置为初始值持有表单状态（避免在 effect 中同步 setState）。 */
export function RiskControlPage() {
  const configQ = useQuery({
    queryKey: ['admin', 'risk', 'config'],
    queryFn: () => adminAPI.riskControl.getConfig(),
    staleTime: Infinity,
    refetchOnWindowFocus: false
  })
  React.useEffect(() => {
    if (configQ.error) notifyError(configQ.error, t('admin.riskControl.loadFailed'))
  }, [configQ.error])
  if (!configQ.data) {
    return (
      <div>
        <PageHeader title={t('admin.riskControl.title')} description={t('admin.riskControl.description')} />
        {configQ.error ? (
          <Button variant="outline" onClick={() => void configQ.refetch()}>
            {t('admin.riskControl.refresh')}
          </Button>
        ) : (
          <Skeleton className="h-24" />
        )}
      </div>
    )
  }
  return <RiskControlInner initial={configQ.data} />
}

function RiskControlInner({ initial }: { initial: ContentModerationConfig }) {
  const locale = useLocale()
  const app = useAppStore
  const qc = useQueryClient()
  const table = useTableState()
  const defaultMsg = t('admin.riskControl.defaultBlockMessage')

  const [init] = React.useState(() => configToForm(initial, defaultMsg))
  const [form, setFormState] = React.useState<ConfigForm>(init.form)
  const setForm = (patch: Partial<ConfigForm>) => setFormState((f) => ({ ...f, ...patch }))
  const [drafts, setDrafts] = React.useState<Partial<Record<ModerationEngine, EngineDraft>>>(init.drafts)
  const [savedEngine, setSavedEngine] = React.useState<ModerationEngine>(init.savedEngine)
  const [saving, setSaving] = React.useState(false)
  const [settingsOpen, setSettingsOpen] = React.useState(false)
  const [tab, setTab] = React.useState('basic')
  const [groupSearch, setGroupSearch] = React.useState('')
  const [testedKeys, setTestedKeys] = React.useState<ContentModerationAPIKeyStatus[]>([])
  const [keysExpanded, setKeysExpanded] = React.useState(false)
  const [testing, setTesting] = React.useState(false)
  const [testPrompt, setTestPrompt] = React.useState('')
  const [testImages, setTestImages] = React.useState<string[]>([])
  const [testResult, setTestResult] = React.useState<ContentModerationTestAuditResult | null>(null)
  const [hashInput, setHashInput] = React.useState('')
  const [hashBusy, setHashBusy] = React.useState(false)
  const [clearHashes, setClearHashes] = React.useState(false)
  const [unbanning, setUnbanning] = React.useState<number | null>(null)
  const [detail, setDetail] = React.useState<ContentModerationLog | null>(null)
  const [filters, setFilters] = React.useState({
    result: '',
    group_id: 0,
    endpoint: '',
    search: '',
    from: '',
    to: ''
  })
  const [applied, setApplied] = React.useState(filters)

  const groupsQ = useQuery({ queryKey: ['admin', 'risk', 'groups'], queryFn: () => adminAPI.groups.getAll() })
  const proxiesQ = useQuery({
    queryKey: ['admin', 'risk', 'proxies'],
    queryFn: () => adminAPI.proxies.getAll()
  })
  const groups = groupsQ.data ?? []
  const proxies = proxiesQ.data ?? []

  const applyConfig = (c: ContentModerationConfig) => {
    const r = configToForm(c, defaultMsg)
    setFormState(r.form)
    setDrafts(r.drafts)
    setSavedEngine(r.savedEngine)
    setTestedKeys([])
    setKeysExpanded(false)
  }

  // 运行态：15 秒轮询（react-query 在页面不可见时自动暂停）
  const statusQ = useQuery({
    queryKey: ['admin', 'risk', 'status'],
    queryFn: () => adminAPI.riskControl.getStatus(),
    refetchInterval: STATUS_REFRESH_MS
  })
  const status: ContentModerationRuntimeStatus | null = statusQ.data ?? null
  const statusLoading = statusQ.isFetching
  const loadStatus = async (silent = true) => {
    const r = await statusQ.refetch()
    if (r.error && !silent) notifyError(r.error, t('admin.riskControl.statusFailed'))
  }

  const logsParams = {
    page: table.page,
    page_size: table.pageSize,
    result: applied.result || undefined,
    group_id: applied.group_id || undefined,
    endpoint: applied.endpoint || undefined,
    search: applied.search || undefined,
    from: normalizeDateTimeLocal(applied.from),
    to: normalizeDateTimeLocal(applied.to)
  }
  const logsQ = useQuery({
    queryKey: ['admin', 'risk', 'logs', logsParams],
    queryFn: () => adminAPI.riskControl.listLogs(logsParams),
    placeholderData: (p) => p
  })
  React.useEffect(() => {
    if (logsQ.error) notifyError(logsQ.error, t('admin.riskControl.logsFailed'))
  }, [logsQ.error])

  const modeLabel = (m: string) =>
    t(
      m === 'pre_block'
        ? 'admin.riskControl.modePreBlock'
        : m === 'observe'
          ? 'admin.riskControl.modeObserve'
          : 'admin.riskControl.modeOff'
    )

  const switchEngine = (engine: string) => {
    if ((engine !== 'openai' && engine !== 'typesafe') || testing || saving || engine === form.engine) return
    const stash = { ...drafts, [form.engine]: captureEngineDraft(form) }
    setDrafts(stash)
    const next = stash[engine]
    setFormState((f) => ({ ...f, engine, ...(next ? structuredClone(next) : {}) }))
    setTestedKeys([])
    setTestResult(null)
  }

  const save = async () => {
    // 提交前剔除已不存在的待删除哈希（运行态刷新后密钥列表可能变化）
    const known = new Set(
      ((status?.engine ?? 'openai') === form.engine && status?.api_key_statuses?.length
        ? status.api_key_statuses
        : form.api_key_statuses
      )
        .map((r) => r.key_hash)
        .filter(Boolean)
    )
    const pruned = known.size
      ? { ...form, pendingDeletes: form.pendingDeletes.filter((h) => known.has(h)) }
      : form
    const built = buildSavePayload(pruned, drafts, defaultMsg)
    if (!built.ok) {
      app.getState().showError(t(`admin.riskControl.${built.error}`))
      return
    }
    setSaving(true)
    try {
      const updated = await adminAPI.riskControl.updateConfig(built.payload)
      applyConfig(updated)
      qc.setQueryData(['admin', 'risk', 'config'], updated)
      setSettingsOpen(false)
      notifySuccess(t('admin.riskControl.saved'))
      await Promise.all([loadStatus(true), logsQ.refetch()])
    } catch (e) {
      notifyError(e, t('admin.riskControl.saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  const savedRows =
    (status?.engine ?? 'openai') === form.engine && status?.api_key_statuses?.length
      ? status.api_key_statuses
      : form.api_key_statuses
  const apiKeyRows = [...(Array.isArray(savedRows) ? savedRows : []), ...testedKeys]
  const visibleRows = keysExpanded ? apiKeyRows : apiKeyRows.slice(0, MAX_VISIBLE_KEY_ROWS)
  const hasAuditInput = testPrompt.trim() !== '' || testImages.length > 0

  const testKeys = async (useInput: boolean) => {
    const keys = useInput ? parseApiKeys(form.api_keys_text) : []
    if (useInput && keys.length === 0)
      return app.getState().showError(t('admin.riskControl.apiKeyTestNoInput'))
    setTesting(true)
    try {
      const r = await adminAPI.riskControl.testAPIKeys({
        engine: form.engine,
        thresholds: Object.fromEntries(
          riskThresholdCategories.map((c) => [c, Number((clampPercent(form.thresholds[c]) / 100).toFixed(4))])
        ),
        api_keys: keys,
        base_url: form.base_url,
        model: form.model,
        timeout_ms: Number(form.timeout_ms) || 3000,
        // 与保存语义一致：0 强制直连，>0 指定代理
        proxy_id: form.proxy_id ?? 0,
        prompt: testPrompt,
        images: testImages
      })
      setTestResult(r.audit_result ?? null)
      if (useInput) setTestedKeys(r.items.map((i) => ({ ...i, configured: false })))
      else {
        setFormState((f) => {
          if (!hasAuditInput || f.api_key_statuses.length === 0) return { ...f, api_key_statuses: r.items }
          const upd = new Map(r.items.map((i) => [i.key_hash, i]))
          return { ...f, api_key_statuses: f.api_key_statuses.map((i) => upd.get(i.key_hash) ?? i) }
        })
        setTestedKeys([])
        await loadStatus(true)
      }
      if (r.items.length === 0 || r.items.some((i) => i.status === 'error' || i.status === 'frozen'))
        app.getState().showError(t('admin.riskControl.apiKeyTestFailed'))
      else notifySuccess(t('admin.riskControl.apiKeyTestDone', { count: r.items.length }))
    } catch (e) {
      notifyError(e, t('admin.riskControl.apiKeyTestFailed'))
    } finally {
      setTesting(false)
    }
  }

  const addImages = async (files: FileList | null) => {
    if (!files) return
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) continue
      if (testImages.length >= MAX_TEST_IMAGES) {
        app.getState().showError(t('admin.riskControl.auditTestImageLimit', { count: MAX_TEST_IMAGES }))
        break
      }
      if (file.size > MAX_TEST_IMAGE_BYTES) {
        app.getState().showError(t('admin.riskControl.auditTestImageTooLarge'))
        continue
      }
      try {
        const url = await new Promise<string>((resolve, reject) => {
          const r = new FileReader()
          r.onload = () => resolve(String(r.result))
          r.onerror = () => reject(r.error)
          r.readAsDataURL(file)
        })
        setTestImages((s) => (s.length >= MAX_TEST_IMAGES ? s : [...s, url]))
      } catch {
        app.getState().showError(t('admin.riskControl.auditTestImageReadFailed'))
      }
    }
  }

  const unban = async (row: ContentModerationLog) => {
    if (!row.user_id || unbanning !== null) return
    setUnbanning(row.user_id)
    try {
      await adminAPI.riskControl.unbanUser(row.user_id)
      notifySuccess(t('admin.riskControl.unbanSuccess'))
      void logsQ.refetch()
    } catch (e) {
      notifyError(e, t('admin.riskControl.unbanFailed'))
    } finally {
      setUnbanning(null)
    }
  }

  const hashValid = /^[a-fA-F0-9]{64}$/.test(hashInput.trim())
  const deleteHash = async () => {
    if (!hashValid || hashBusy) return
    setHashBusy(true)
    try {
      const r = await adminAPI.riskControl.deleteFlaggedHash(hashInput)
      setHashInput('')
      await loadStatus(true)
      notifySuccess(
        r.deleted ? t('admin.riskControl.flaggedHashDeleted') : t('admin.riskControl.flaggedHashNotFound')
      )
    } catch (e) {
      notifyError(e, t('admin.riskControl.flaggedHashDeleteFailed'))
    } finally {
      setHashBusy(false)
    }
  }
  const doClearHashes = async () => {
    setClearHashes(false)
    setHashBusy(true)
    try {
      const r = await adminAPI.riskControl.clearFlaggedHashes()
      await loadStatus(true)
      notifySuccess(t('admin.riskControl.flaggedHashesCleared', { count: r.deleted }))
    } catch (e) {
      notifyError(e, t('admin.riskControl.flaggedHashesClearFailed'))
    } finally {
      setHashBusy(false)
    }
  }

  const columns = React.useMemo<ColumnDef<ContentModerationLog, unknown>[]>(
    () => [
      {
        id: 'time',
        header: t('admin.riskControl.table.time'),
        cell: ({ row }) => (
          <span className="text-xs whitespace-nowrap">{formatDateTime(row.original.created_at)}</span>
        )
      },
      {
        id: 'group',
        header: t('admin.riskControl.table.group'),
        cell: ({ row }) => <span className="text-xs">{row.original.group_name || '—'}</span>
      },
      {
        id: 'user',
        header: t('admin.riskControl.table.user'),
        cell: ({ row }) => (
          <div className="max-w-[200px] text-xs">
            <div className="truncate">{row.original.user_email || '—'}</div>
            {row.original.user_status === 'disabled' ? (
              <Badge variant="secondary">{t('admin.riskControl.autoBanned')}</Badge>
            ) : null}
          </div>
        )
      },
      {
        id: 'key',
        header: t('admin.riskControl.table.apiKey'),
        cell: ({ row }) => <span className="text-xs">{row.original.api_key_name || '—'}</span>
      },
      {
        id: 'endpoint',
        header: t('admin.riskControl.table.endpoint'),
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.endpoint}</span>
      },
      {
        id: 'result',
        header: t('admin.riskControl.table.result'),
        cell: ({ row }) => {
          const r = row.original
          const tone = r.error
            ? 'error'
            : r.action === 'block' || r.action === 'keyword_block'
              ? 'error'
              : r.flagged
                ? 'warning'
                : 'success'
          const text = r.error
            ? t('admin.riskControl.result.error')
            : r.action === 'block'
              ? t('admin.riskControl.action.block')
              : r.action === 'keyword_block'
                ? t('admin.riskControl.action.keywordBlock')
                : r.flagged
                  ? t('admin.riskControl.result.hit')
                  : t('admin.riskControl.result.pass')
          return <StatusBadge status={tone}>{text}</StatusBadge>
        }
      },
      {
        id: 'highest',
        header: t('admin.riskControl.table.highest'),
        cell: ({ row }) => (
          <div className="text-xs">
            {row.original.matched_keyword ? (
              <span>
                {t('admin.riskControl.matchedKeyword')}: {row.original.matched_keyword}
              </span>
            ) : (
              <>
                {row.original.highest_category || '—'}{' '}
                <span className="text-muted-foreground">
                  {(row.original.highest_score * 100).toFixed(1)}%
                </span>
              </>
            )}
            <div className="text-muted-foreground">
              {t('admin.riskControl.violationCount', { count: row.original.violation_count })}
            </div>
          </div>
        )
      },
      {
        id: 'latency',
        header: t('admin.riskControl.table.latency'),
        cell: ({ row }) => (
          <span className="text-xs whitespace-nowrap">
            {row.original.upstream_latency_ms ?? '—'} ms
            {row.original.queue_delay_ms != null
              ? ` · ${t('admin.riskControl.queueDelay', { ms: row.original.queue_delay_ms })}`
              : ''}
          </span>
        )
      },
      {
        id: 'input',
        header: t('admin.riskControl.table.input'),
        cell: ({ row }) => (
          <button
            type="button"
            className="line-clamp-2 max-w-[260px] text-left text-xs hover:underline"
            onClick={() => setDetail(row.original)}
          >
            {row.original.input_excerpt || row.original.error || '—'}
          </button>
        )
      },
      {
        id: 'actions',
        header: t('common.actions'),
        cell: ({ row }) =>
          row.original.auto_banned || row.original.user_status === 'disabled' ? (
            <Button
              size="sm"
              variant="outline"
              loading={unbanning === row.original.user_id}
              onClick={() => void unban(row.original)}
            >
              {t('admin.riskControl.unbanUser')}
            </Button>
          ) : null
      }
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [locale, unbanning]
  )

  const runtimeMode = status?.mode ?? form.mode
  const filteredGroups = groups.filter((g) => {
    const k = groupSearch.trim().toLowerCase()
    return !k || g.name.toLowerCase().includes(k) || String(g.platform).toLowerCase().includes(k)
  })
  const keywordCount = parseBlockedKeywords(form.blocked_keywords_text).length
  const queueUsage = Math.min(100, Math.max(0, status?.queue_usage_percent ?? 0))
  const riskSwitchOff = status ? !status.risk_control_enabled : false
  const num = (k: keyof ConfigForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ [k]: Number(e.target.value) } as Partial<ConfigForm>)
  const switchRow = (label: string, hint: string | undefined, checked: boolean, on: (v: boolean) => void) => (
    <div className="flex items-start justify-between gap-4 rounded-md border p-3">
      <div>
        <div className="text-sm font-medium">{label}</div>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </div>
      <Switch checked={checked} onCheckedChange={on} aria-label={label} />
    </div>
  )

  return (
    <div>
      <PageHeader
        title={t('admin.riskControl.title')}
        description={t('admin.riskControl.description')}
        actions={
          <>
            <Button
              variant="outline"
              aria-label={t('admin.riskControl.refresh')}
              onClick={() => {
                void logsQ.refetch()
                void loadStatus(false)
              }}
            >
              <RefreshCw
                className={logsQ.isFetching || statusLoading ? 'animate-spin' : undefined}
                aria-hidden
              />
            </Button>
            <Button
              onClick={() => {
                setTab('basic')
                setSettingsOpen(true)
              }}
            >
              <Settings aria-hidden />
              {t('admin.riskControl.openSettings')}
            </Button>
          </>
        }
      />
      {riskSwitchOff ? (
        <div
          role="status"
          className="mb-4 flex items-center gap-2 rounded-md border border-warning/40 bg-warning/10 px-4 py-3 text-sm"
        >
          <ShieldAlert className="size-4" aria-hidden />
          {t('admin.riskControl.riskSwitchOff')}
        </div>
      ) : null}

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label={t('admin.riskControl.overview.status')}
          value={
            form.enabled ? t('admin.riskControl.overview.enabled') : t('admin.riskControl.overview.disabled')
          }
          hint={modeLabel(form.mode)}
        />
        <StatCard
          label={t('admin.riskControl.overview.apiKey')}
          value={
            form.api_key_configured
              ? t('admin.riskControl.apiKeyCount', { count: form.api_key_count })
              : t('admin.riskControl.notConfigured')
          }
          hint={form.model || '-'}
        />
        <StatCard
          label={t('admin.riskControl.overview.groupScope')}
          value={form.all_groups ? t('admin.riskControl.allGroups') : String(form.group_ids.length)}
          hint={
            form.model_filter_type === 'include'
              ? t('admin.riskControl.modelFilterIncludeSummary', { count: form.model_filter_models.length })
              : form.model_filter_type === 'exclude'
                ? t('admin.riskControl.modelFilterExcludeSummary', {
                    count: form.model_filter_models.length
                  })
                : t('admin.riskControl.modelFilterAllSummary')
          }
        />
        <StatCard
          label={t('admin.riskControl.overview.logs')}
          value={nf(logsQ.data?.total ?? 0)}
          hint={t('admin.riskControl.overview.currentFilter')}
        />
      </div>

      {status ? (
        <Card className="mb-6 p-5">
          {runtimeMode === 'pre_block' ? (
            <>
              <h2 className="text-base font-semibold">{t('admin.riskControl.preBlockSyncStatus')}</h2>
              <p className="mb-3 text-sm text-muted-foreground">{t('admin.riskControl.preBlockSyncHint')}</p>
              <dl className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
                {(
                  [
                    ['preBlockActive', status.pre_block_active],
                    ['preBlockChecked', status.pre_block_checked],
                    ['preBlockAllowed', status.pre_block_allowed],
                    ['preBlockBlocked', status.pre_block_blocked],
                    ['preBlockErrors', status.pre_block_errors],
                    ['preBlockAvgLatency', `${nf(status.pre_block_avg_latency_ms)} ms`]
                  ] as [string, number | string][]
                ).map(([k, v]) => (
                  <div
                    key={k}
                    className="rounded-md border px-3 py-2"
                    title={t(`admin.riskControl.${k}Hint`)}
                  >
                    <dt className="text-xs text-muted-foreground">{t(`admin.riskControl.${k}`)}</dt>
                    <dd className="text-lg font-semibold tabular-nums">
                      {typeof v === 'number' ? nf(v) : v}
                    </dd>
                  </div>
                ))}
              </dl>
              <h3 className="mt-4 text-sm font-medium">{t('admin.riskControl.preBlockAPIKeyLoad')}</h3>
              <p className="text-xs text-muted-foreground">
                {t('admin.riskControl.preBlockAPIKeyLoadSummary', {
                  active: nf(status.pre_block_api_key_active),
                  available: nf(status.pre_block_api_key_available_count),
                  total: nf(status.pre_block_api_key_total_calls),
                  workerActive: nf(status.active_workers),
                  workerTotal: nf(status.worker_count)
                })}
              </p>
              {status.pre_block_api_key_loads?.length ? (
                <ul className="mt-2 grid gap-2">
                  {[...status.pre_block_api_key_loads]
                    .sort((a, b) => a.index - b.index)
                    .map((l) => {
                      const max = Math.max(1, ...status.pre_block_api_key_loads.map((x) => x.total || 0))
                      return (
                        <li key={l.key_hash || l.index} className="text-xs">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono">{l.masked}</span>
                            <StatusBadge status={keyTone(l.status)}>{keyLabel(l.status)}</StatusBadge>
                            <span className="text-muted-foreground">
                              {t('admin.riskControl.preBlockKeyActiveShort')} {l.active} ·{' '}
                              {t('admin.riskControl.preBlockKeyTotalShort')} {l.total} ·{' '}
                              {t('admin.riskControl.preBlockKeyAvgShort')} {l.avg_latency_ms} ms
                            </span>
                          </div>
                          <div className="mt-1 h-1.5 overflow-hidden rounded bg-muted">
                            <div
                              className="h-full bg-primary"
                              style={{ width: `${Math.min(100, ((l.total || 0) / max) * 100).toFixed(1)}%` }}
                            />
                          </div>
                        </li>
                      )
                    })}
                </ul>
              ) : (
                <p className="mt-2 text-xs text-muted-foreground">
                  {t('admin.riskControl.preBlockAPIKeyLoadEmpty')}
                </p>
              )}
            </>
          ) : null}
          {runtimeMode === 'observe' ? (
            <>
              <h2 className="text-base font-semibold">{t('admin.riskControl.workerStatus')}</h2>
              <p className="mb-3 text-sm text-muted-foreground">{t('admin.riskControl.workerStatusHint')}</p>
              <p className="text-sm">
                {t('admin.riskControl.workerPool')}:{' '}
                {t('admin.riskControl.workerPoolMeta', {
                  active: status.active_workers,
                  idle: status.idle_workers,
                  total: status.worker_count
                })}
              </p>
              <div className="my-3">
                <div className="mb-1 flex justify-between text-xs text-muted-foreground">
                  <span>{t('admin.riskControl.queueUsage')}</span>
                  <span>
                    {status.queue_length} / {status.queue_size} ({queueUsage.toFixed(1)}%)
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded bg-muted">
                  <div className="h-full bg-primary" style={{ width: `${queueUsage}%` }} />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                {t('admin.riskControl.processed')}: {nf(status.processed)} ·{' '}
                {t('admin.riskControl.droppedErrors')}: {nf(status.dropped)} / {nf(status.errors)}
              </p>
            </>
          ) : null}
          <p className="mt-3 text-xs text-muted-foreground">
            {t('admin.riskControl.autoRefresh')}
            {status.last_cleanup_at
              ? ` · ${t('admin.riskControl.lastCleanup', { time: formatDateTime(status.last_cleanup_at) })} · ${t('admin.riskControl.cleanupStats', { hit: status.last_cleanup_deleted_hit, nonHit: status.last_cleanup_deleted_non_hit })}`
              : ''}
          </p>
        </Card>
      ) : null}

      <h2 className="text-base font-semibold">{t('admin.riskControl.records')}</h2>
      <p className="mb-3 text-sm text-muted-foreground">{t('admin.riskControl.recordsHint')}</p>
      <FilterBar
        onReset={() => {
          const empty = { result: '', group_id: 0, endpoint: '', search: '', from: '', to: '' }
          setFilters(empty)
          setApplied(empty)
          table.setPage(1)
        }}
        actions={
          <Button
            onClick={() => {
              setApplied(filters)
              table.setPage(1)
            }}
          >
            {t('common.search')}
          </Button>
        }
      >
        <Input
          className="w-56"
          aria-label={t('admin.riskControl.filters.search')}
          placeholder={t('admin.riskControl.filters.search')}
          value={filters.search}
          onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
          onKeyDown={(e) => e.key === 'Enter' && (setApplied(filters), table.setPage(1))}
        />
        <FilterSelect
          label={t('admin.riskControl.table.result')}
          value={filters.result}
          onChange={(v) => setFilters((f) => ({ ...f, result: v }))}
          options={['', 'hit', 'blocked', 'pass', 'error'].map((v) => ({
            value: v,
            label: t(`admin.riskControl.result.${v || 'all'}`)
          }))}
        />
        <FilterSelect
          label={t('admin.riskControl.table.group')}
          value={String(filters.group_id)}
          onChange={(v) => setFilters((f) => ({ ...f, group_id: Number(v) }))}
          options={[
            { value: '0', label: t('admin.riskControl.filters.allGroups') },
            ...groups.map((g) => ({ value: String(g.id), label: `${g.name} (${g.platform})` }))
          ]}
          className="w-52"
        />
        <FilterSelect
          label={t('admin.riskControl.table.endpoint')}
          value={filters.endpoint}
          onChange={(v) => setFilters((f) => ({ ...f, endpoint: v }))}
          options={[
            { value: '', label: t('admin.riskControl.filters.allEndpoints') },
            ...[
              '/v1/messages',
              '/v1/responses',
              '/v1/chat/completions',
              '/v1beta/models',
              '/v1/images/generations',
              '/v1/images/edits'
            ].map((v) => ({ value: v, label: v }))
          ]}
          className="w-52"
        />
        <Input
          type="datetime-local"
          className="w-48"
          aria-label={t('admin.riskControl.filters.from')}
          value={filters.from}
          onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))}
        />
        <Input
          type="datetime-local"
          className="w-48"
          aria-label={t('admin.riskControl.filters.to')}
          value={filters.to}
          onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))}
        />
      </FilterBar>
      <DataTable
        columns={columns}
        data={logsQ.data?.items ?? []}
        loading={logsQ.isLoading}
        getRowId={(r) => String(r.id)}
        pagination={table.pagination(logsQ.data?.total ?? 0)}
        emptyTitle={t('admin.riskControl.emptyLogs')}
      />

      {/* 输入摘要详情 */}
      <AdminFormDialog
        open={detail !== null}
        onOpenChange={(o) => !o && setDetail(null)}
        title={t('admin.riskControl.inputDetailTitle')}
        size="lg"
      >
        {detail ? (
          <div className="grid gap-3 text-sm">
            {detail.engine_meta ? (
              <p className="text-xs text-muted-foreground">
                {t('admin.riskControl.auditSource')}: {detail.engine_meta.engine} / {detail.engine_meta.model}{' '}
                · {t('admin.riskControl.skippedImages', { count: detail.engine_meta.skipped_images })}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                {t('admin.riskControl.auditSource')}: {t('admin.riskControl.legacyAuditSource')}
              </p>
            )}
            <h4 className="text-xs font-semibold text-muted-foreground uppercase">
              {t('admin.riskControl.inputDetailContent')}
            </h4>
            <pre className="max-h-72 overflow-auto rounded-md bg-muted/40 p-3 text-xs break-words whitespace-pre-wrap">
              {detail.input_excerpt || detail.error || '-'}
            </pre>
            {Object.keys(detail.category_scores || {}).length ? (
              <ul className="grid gap-1 text-xs sm:grid-cols-2">
                {Object.entries(detail.category_scores)
                  .sort((a, b) => b[1] - a[1])
                  .map(([c, s]) => (
                    <li key={c} className="flex justify-between rounded border px-2 py-1">
                      <span>{c}</span>
                      <span
                        className={
                          s >= (detail.threshold_snapshot?.[c] ?? 1) ? 'font-semibold text-destructive' : ''
                        }
                      >
                        {(s * 100).toFixed(1)}%
                      </span>
                    </li>
                  ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </AdminFormDialog>

      {/* 设置 */}
      <AdminFormDialog
        open={settingsOpen}
        onOpenChange={(o) => !saving && setSettingsOpen(o)}
        title={t('admin.riskControl.settingsTitle')}
        size="xl"
        onSubmit={save}
        submitting={saving}
        submitText={t('admin.riskControl.saveConfig')}
      >
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="flex h-auto flex-wrap">
            {(
              ['basic', 'scope', 'runtime', 'response', 'riskThresholds', 'keywords', 'retention'] as const
            ).map((k) => (
              <TabsTrigger key={k} value={k}>
                {t(`admin.riskControl.tabs.${k}`)}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="basic" className="grid gap-4">
            {switchRow(
              t('admin.riskControl.enabled'),
              t('admin.riskControl.enabledHint'),
              form.enabled,
              (v) => setForm({ enabled: v })
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label={t('admin.riskControl.mode')}>
                <NativeSelect
                  value={form.mode}
                  onChange={(e) => setForm({ mode: e.target.value as ConfigForm['mode'] })}
                >
                  {(['pre_block', 'observe', 'off'] as const).map((m) => (
                    <option key={m} value={m}>
                      {modeLabel(m)}
                    </option>
                  ))}
                </NativeSelect>
              </FormField>
              <FormField
                label={t('admin.riskControl.engine')}
                description={
                  form.engine !== savedEngine
                    ? t('admin.riskControl.activeEngine', {
                        engine: savedEngine === 'typesafe' ? 'TypeSafe AI' : 'OpenAI'
                      })
                    : undefined
                }
              >
                <NativeSelect
                  value={form.engine}
                  disabled={testing || saving}
                  onChange={(e) => switchEngine(e.target.value)}
                >
                  <option value="openai">OpenAI</option>
                  <option value="typesafe">TypeSafe AI</option>
                </NativeSelect>
              </FormField>
            </div>
            {form.engine === 'typesafe' ? (
              <p className="rounded-md bg-warning/10 p-3 text-xs">{t('admin.riskControl.typeSafeNotice')}</p>
            ) : null}
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label={t('admin.riskControl.baseUrl')}>
                <Input value={form.base_url} onChange={(e) => setForm({ base_url: e.target.value })} />
              </FormField>
              <FormField label={t('admin.riskControl.model')}>
                <Input value={form.model} onChange={(e) => setForm({ model: e.target.value })} />
              </FormField>
              <FormField label={t('admin.riskControl.timeoutMs')}>
                <Input type="number" min={1} value={form.timeout_ms} onChange={num('timeout_ms')} />
              </FormField>
              <FormField label={t('admin.riskControl.retryCount')}>
                <Input type="number" min={0} value={form.retry_count} onChange={num('retry_count')} />
              </FormField>
              <FormField
                label={t('admin.riskControl.proxy')}
                description={t('admin.riskControl.proxyHint')}
                className="sm:col-span-2"
              >
                <NativeSelect
                  value={form.proxy_id ?? ''}
                  onChange={(e) => setForm({ proxy_id: e.target.value ? Number(e.target.value) : null })}
                >
                  <option value="">—</option>
                  {proxies.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.protocol}://{p.host}:{p.port})
                    </option>
                  ))}
                </NativeSelect>
              </FormField>
            </div>

            <section className="grid gap-3 rounded-md border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">{t('admin.riskControl.apiKeys')}</h3>
                <span className="text-xs text-muted-foreground">
                  {form.api_key_configured
                    ? t('admin.riskControl.storedApiKeyCount', {
                        count: Math.max(0, form.api_key_count - form.pendingDeletes.length)
                      })
                    : t('admin.riskControl.notConfigured')}
                  {form.pendingDeletes.length
                    ? ` · ${t('admin.riskControl.apiKeyPendingDeleteCount', { count: form.pendingDeletes.length })}`
                    : ''}
                </span>
              </div>
              <div className="flex gap-4 text-sm">
                {(['append', 'replace'] as const).map((m) => (
                  <label key={m} className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="rk-mode"
                      checked={form.api_keys_mode === m}
                      onChange={() => setForm({ api_keys_mode: m })}
                    />
                    {t(
                      m === 'append'
                        ? 'admin.riskControl.apiKeysModeAppend'
                        : 'admin.riskControl.apiKeysModeReplace'
                    )}
                  </label>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                {t(
                  form.api_keys_mode === 'replace'
                    ? 'admin.riskControl.apiKeysModeReplaceHint'
                    : 'admin.riskControl.apiKeysModeAppendHint'
                )}
              </p>
              <Textarea
                rows={4}
                autoComplete="off"
                spellCheck={false}
                className="font-mono text-xs"
                aria-label={t('admin.riskControl.apiKeys')}
                placeholder={t(
                  form.api_keys_mode === 'replace'
                    ? 'admin.riskControl.apiKeysPlaceholderReplace'
                    : 'admin.riskControl.apiKeysPlaceholder'
                )}
                value={form.api_keys_text}
                onChange={(e) => setForm({ api_keys_text: e.target.value })}
              />
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  {t('admin.riskControl.inputApiKeyCount', {
                    count: parseApiKeys(form.api_keys_text).length
                  })}
                </span>
                <label className="ml-auto flex items-center gap-2 text-xs">
                  <Checkbox
                    checked={form.clear_api_key}
                    onCheckedChange={(v) => setForm({ clear_api_key: v === true })}
                  />
                  {t('admin.riskControl.clearApiKey')}
                </label>
              </div>
              {form.clear_api_key ? (
                <p className="text-xs text-destructive">{t('admin.riskControl.apiKeyWillClear')}</p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={testing}
                  onClick={() => void testKeys(true)}
                >
                  {testing ? t('admin.riskControl.testingApiKeys') : t('admin.riskControl.testInputApiKeys')}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={testing || !form.api_key_configured}
                  onClick={() => void testKeys(false)}
                >
                  {testing
                    ? t('admin.riskControl.testingApiKeys')
                    : hasAuditInput
                      ? t('admin.riskControl.testContentWithStoredApiKey')
                      : t('admin.riskControl.testStoredApiKeys')}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">{t('admin.riskControl.apiKeyFreezeRule')}</p>
              {apiKeyRows.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  {t('admin.riskControl.apiKeyHealthEmpty')} — {t('admin.riskControl.apiKeyHealthEmptyHint')}
                </p>
              ) : (
                <>
                  <ul className="grid gap-2">
                    {visibleRows.map((r, i) => (
                      <ApiKeyRow
                        key={`${r.key_hash}-${i}`}
                        row={r}
                        pendingDelete={
                          r.configured && !!r.key_hash && form.pendingDeletes.includes(r.key_hash)
                        }
                        onToggleDelete={() =>
                          setForm({
                            pendingDeletes: form.pendingDeletes.includes(r.key_hash)
                              ? form.pendingDeletes.filter((h) => h !== r.key_hash)
                              : [...form.pendingDeletes, r.key_hash]
                          })
                        }
                      />
                    ))}
                  </ul>
                  {apiKeyRows.length > MAX_VISIBLE_KEY_ROWS ? (
                    <Button
                      type="button"
                      variant="link"
                      size="sm"
                      className="justify-self-start"
                      onClick={() => setKeysExpanded((v) => !v)}
                    >
                      {keysExpanded
                        ? t('admin.riskControl.collapseApiKeyRows')
                        : `${t('admin.riskControl.expandApiKeyRows')} (${t('admin.riskControl.apiKeyRowsCollapsed', { count: apiKeyRows.length - visibleRows.length })})`}
                    </Button>
                  ) : null}
                </>
              )}
            </section>

            <section className="grid gap-3 rounded-md border p-4">
              <h3 className="text-sm font-semibold">{t('admin.riskControl.auditTestInput')}</h3>
              <p className="text-xs text-muted-foreground">{t('admin.riskControl.auditTestInputHint')}</p>
              <Textarea
                rows={3}
                aria-label={t('admin.riskControl.auditTestInput')}
                placeholder={t('admin.riskControl.auditTestPromptPlaceholder')}
                value={testPrompt}
                onChange={(e) => setTestPrompt(e.target.value)}
              />
              <div className="flex flex-wrap items-center gap-2">
                <label className="inline-flex cursor-pointer items-center gap-1 text-sm">
                  <input
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    onChange={(e) => {
                      void addImages(e.target.files)
                      e.target.value = ''
                    }}
                  />
                  <span className="inline-flex h-8 items-center gap-1.5 rounded-md border bg-card px-3 text-[13px]">
                    <ImagePlus className="size-4" aria-hidden />
                    {t('admin.riskControl.addAuditTestImage')}
                  </span>
                </label>
                <span className="text-xs text-muted-foreground">
                  {t('admin.riskControl.auditTestImagesHint')}
                </span>
                {testPrompt || testImages.length || testResult ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setTestPrompt('')
                      setTestImages([])
                      setTestResult(null)
                    }}
                  >
                    {t('admin.riskControl.clearAuditTest')}
                  </Button>
                ) : null}
              </div>
              {testImages.length ? (
                <div className="flex gap-2">
                  {testImages.map((src, i) => (
                    <div key={i} className="relative">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={src} alt="" className="h-20 rounded border" />
                      <button
                        type="button"
                        aria-label={t('common.remove')}
                        className="absolute -top-2 -right-2 rounded-full bg-destructive p-0.5 text-destructive-foreground"
                        onClick={() => setTestImages((s) => s.filter((_, j) => j !== i))}
                      >
                        <X className="size-3" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
              {testResult ? (
                <div className="rounded-md bg-muted/40 p-3 text-xs">
                  <div className="mb-2 flex items-center gap-2">
                    <b>{t('admin.riskControl.auditTestResult')}</b>
                    <StatusBadge status={testResult.flagged ? 'error' : 'success'}>
                      {testResult.flagged
                        ? t('admin.riskControl.auditTestFlagged')
                        : t('admin.riskControl.auditTestPassed')}
                    </StatusBadge>
                  </div>
                  <p>
                    {t('admin.riskControl.auditTestHighest', {
                      category: testResult.highest_category || '-',
                      score: (testResult.highest_score * 100).toFixed(1) + '%'
                    })}{' '}
                    · {t('admin.riskControl.auditTestComposite')}:{' '}
                    {(testResult.composite_score * 100).toFixed(1)}%
                  </p>
                  <ul className="mt-2 grid gap-1 sm:grid-cols-2">
                    {Object.entries(testResult.category_scores || {})
                      .sort((a, b) => b[1] - a[1])
                      .map(([c, s]) => {
                        const th = testResult.thresholds?.[c] ?? 1
                        return (
                          <li key={c} className="flex justify-between rounded border px-2 py-1">
                            <span>{c}</span>
                            <span className={s >= th ? 'font-semibold text-destructive' : ''}>
                              {(s * 100).toFixed(1)}% / {(th * 100).toFixed(0)}%
                            </span>
                          </li>
                        )
                      })}
                  </ul>
                </div>
              ) : null}
            </section>
          </TabsContent>

          <TabsContent value="scope" className="grid gap-4">
            {switchRow(
              t('admin.riskControl.groupScope'),
              t('admin.riskControl.groupScopeHint'),
              form.all_groups,
              (v) => setForm({ all_groups: v })
            )}
            {!form.all_groups ? (
              <div>
                <h4 className="mb-1 text-sm font-medium">
                  {t('admin.riskControl.selectedGroups')} ({form.group_ids.length})
                </h4>
                <Input
                  aria-label={t('admin.riskControl.searchGroups')}
                  placeholder={t('admin.riskControl.searchGroups')}
                  value={groupSearch}
                  onChange={(e) => setGroupSearch(e.target.value)}
                />
                <div className="mt-2 max-h-56 overflow-y-auto rounded-md border p-2">
                  {filteredGroups.length === 0 ? (
                    <p className="p-2 text-sm text-muted-foreground">{t('admin.riskControl.noGroups')}</p>
                  ) : null}
                  {filteredGroups.map((g) => (
                    <label key={g.id} className="flex items-center gap-2 py-1 text-sm">
                      <Checkbox
                        checked={form.group_ids.includes(g.id)}
                        onCheckedChange={(v) =>
                          setForm({
                            group_ids:
                              v === true
                                ? [...form.group_ids, g.id]
                                : form.group_ids.filter((x) => x !== g.id)
                          })
                        }
                      />
                      {g.name} <span className="text-xs text-muted-foreground">{g.platform}</span>
                    </label>
                  ))}
                </div>
              </div>
            ) : null}
            <section className="grid gap-3 rounded-md border p-4">
              <h3 className="text-sm font-semibold">{t('admin.riskControl.modelFilter')}</h3>
              <p className="text-xs text-muted-foreground">{t('admin.riskControl.modelFilterHint')}</p>
              {(['all', 'include', 'exclude'] as const).map((k) => (
                <label key={k} className="flex items-start gap-2 text-sm">
                  <input
                    type="radio"
                    name="rk-mf"
                    className="mt-1"
                    checked={form.model_filter_type === k}
                    onChange={() =>
                      setForm({
                        model_filter_type: k,
                        model_filter_models: k === 'all' ? [] : form.model_filter_models
                      })
                    }
                  />
                  <span>
                    <b>
                      {t(
                        `admin.riskControl.modelFilter${k === 'all' ? 'All' : k === 'include' ? 'Include' : 'Exclude'}`
                      )}
                    </b>
                    <span className="block text-xs text-muted-foreground">
                      {t(
                        `admin.riskControl.modelFilter${k === 'all' ? 'All' : k === 'include' ? 'Include' : 'Exclude'}Desc`
                      )}
                    </span>
                  </span>
                </label>
              ))}
              {form.model_filter_type !== 'all' ? (
                <FormField
                  label={t('admin.riskControl.modelFilterModels')}
                  description={t('admin.riskControl.modelFilterModelCount', {
                    count: form.model_filter_models.length
                  })}
                >
                  <Textarea
                    rows={5}
                    className="font-mono text-xs"
                    value={form.model_filter_models.join('\n')}
                    onChange={(e) => setForm({ model_filter_models: e.target.value.split(/\r?\n/) })}
                    onBlur={() =>
                      setForm({
                        model_filter_models: Array.from(
                          new Set(form.model_filter_models.map((m) => m.trim()).filter(Boolean))
                        )
                      })
                    }
                  />
                </FormField>
              ) : null}
            </section>
          </TabsContent>

          <TabsContent value="runtime" className="grid gap-4 sm:grid-cols-2">
            <FormField label={t('admin.riskControl.sampleRate')}>
              <Input type="number" min={0} max={100} value={form.sample_rate} onChange={num('sample_rate')} />
            </FormField>
            <FormField label={t('admin.riskControl.workerCount')}>
              <Input type="number" min={1} value={form.worker_count} onChange={num('worker_count')} />
            </FormField>
            <FormField label={t('admin.riskControl.queueSize')}>
              <Input type="number" min={1} value={form.queue_size} onChange={num('queue_size')} />
            </FormField>
            <div className="sm:col-span-2">
              {switchRow(
                t('admin.riskControl.recordNonHits'),
                t('admin.riskControl.recordNonHitsHint'),
                form.record_non_hits,
                (v) => setForm({ record_non_hits: v })
              )}
            </div>
            <div className="grid gap-3 sm:col-span-2">
              {switchRow(
                t('admin.riskControl.preHashCheck'),
                t('admin.riskControl.preHashCheckHint'),
                form.pre_hash_check_enabled,
                (v) => setForm({ pre_hash_check_enabled: v })
              )}
              <div className="grid gap-2 rounded-md border p-3">
                <p className="text-sm">
                  {t('admin.riskControl.flaggedHashCount', { count: status?.flagged_hash_count ?? 0 })}
                </p>
                <p className="text-xs text-muted-foreground">{t('admin.riskControl.flaggedHashHint')}</p>
                <div className="flex flex-wrap gap-2">
                  <Input
                    className="min-w-64 flex-1 font-mono text-xs"
                    aria-label={t('admin.riskControl.flaggedHashPlaceholder')}
                    placeholder={t('admin.riskControl.flaggedHashPlaceholder')}
                    value={hashInput}
                    onChange={(e) => setHashInput(e.target.value)}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    disabled={!hashValid}
                    loading={hashBusy}
                    onClick={() => void deleteHash()}
                  >
                    {t('admin.riskControl.deleteFlaggedHash')}
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    disabled={hashBusy}
                    onClick={() => setClearHashes(true)}
                  >
                    {t('admin.riskControl.clearFlaggedHashes')}
                  </Button>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="response" className="grid gap-4 sm:grid-cols-2">
            <FormField label={t('admin.riskControl.blockStatus')}>
              <Input
                type="number"
                min={100}
                max={599}
                value={form.block_status}
                onChange={num('block_status')}
              />
            </FormField>
            <div />
            <FormField label={t('admin.riskControl.blockMessage')} className="sm:col-span-2">
              <Textarea
                rows={3}
                value={form.block_message}
                onChange={(e) => setForm({ block_message: e.target.value })}
              />
            </FormField>
            <div className="grid gap-3 sm:col-span-2">
              {switchRow(
                t('admin.riskControl.emailOnHit'),
                t('admin.riskControl.emailOnHitHint'),
                form.email_on_hit,
                (v) => setForm({ email_on_hit: v })
              )}
              {switchRow(
                t('admin.riskControl.autoBan'),
                t('admin.riskControl.autoBanHint'),
                form.auto_ban_enabled,
                (v) => setForm({ auto_ban_enabled: v })
              )}
              {switchRow(
                t('admin.riskControl.cyberPolicyExcludeBan'),
                t('admin.riskControl.cyberPolicyExcludeBanHint'),
                form.cyber_policy_exclude_from_ban_count,
                (v) => setForm({ cyber_policy_exclude_from_ban_count: v })
              )}
            </div>
            <FormField label={t('admin.riskControl.banThreshold')}>
              <Input type="number" min={1} value={form.ban_threshold} onChange={num('ban_threshold')} />
            </FormField>
            <FormField label={t('admin.riskControl.violationWindowHours')}>
              <Input
                type="number"
                min={1}
                value={form.violation_window_hours}
                onChange={num('violation_window_hours')}
              />
            </FormField>
          </TabsContent>

          <TabsContent value="riskThresholds" className="grid gap-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold">{t('admin.riskControl.riskThresholds')}</h3>
                <p className="text-xs text-muted-foreground">{t('admin.riskControl.riskThresholdsHint')}</p>
                {form.engine === 'typesafe' ? (
                  <p className="text-xs text-warning">{t('admin.riskControl.typeSafeThresholds')}</p>
                ) : null}
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setForm({ thresholds: { ...riskThresholdDefaults } })}
              >
                {t('admin.riskControl.riskThresholdReset')}
              </Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {riskThresholdCategories.map((c) => (
                <label key={c} className="grid gap-1 rounded-md border p-3 text-sm">
                  <span className="flex justify-between">
                    <b>{c}</b>
                    <span className="text-xs text-muted-foreground">
                      {t('admin.riskControl.riskThresholdDefault', { value: riskThresholdDefaults[c] })}
                    </span>
                  </span>
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min={0}
                      max={100}
                      className="flex-1 accent-primary"
                      aria-label={`${c} ${t('admin.riskControl.riskThresholdPercent')}`}
                      value={form.thresholds[c] ?? riskThresholdDefaults[c]}
                      onChange={(e) =>
                        setForm({ thresholds: { ...form.thresholds, [c]: clampPercent(e.target.value) } })
                      }
                    />
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      className="w-20"
                      aria-label={c}
                      value={form.thresholds[c] ?? riskThresholdDefaults[c]}
                      onChange={(e) =>
                        setForm({ thresholds: { ...form.thresholds, [c]: clampPercent(e.target.value) } })
                      }
                    />
                  </div>
                </label>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="keywords" className="grid gap-4">
            <FormField label={t('admin.riskControl.keywordBlockingMode')}>
              <NativeSelect
                value={form.keyword_blocking_mode}
                onChange={(e) =>
                  setForm({ keyword_blocking_mode: e.target.value as ConfigForm['keyword_blocking_mode'] })
                }
              >
                {(['keyword_and_api', 'keyword_only', 'api_only'] as const).map((m) => (
                  <option key={m} value={m}>
                    {t(
                      `admin.riskControl.keywordMode${m === 'keyword_and_api' ? 'KeywordAndApi' : m === 'keyword_only' ? 'KeywordOnly' : 'ApiOnly'}`
                    )}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
            <p
              className={`rounded-md p-3 text-xs ${form.keyword_blocking_mode !== 'api_only' && form.mode !== 'pre_block' ? 'bg-warning/10' : 'bg-muted/40'}`}
            >
              {form.keyword_blocking_mode === 'api_only'
                ? t('admin.riskControl.keywordModeApiOnlyNotice')
                : form.mode !== 'pre_block'
                  ? t('admin.riskControl.blockedKeywordsModeWarning', { mode: modeLabel(form.mode) })
                  : form.keyword_blocking_mode === 'keyword_only'
                    ? t('admin.riskControl.keywordModeKeywordOnlyNotice')
                    : t('admin.riskControl.blockedKeywordsPreBlockHint')}
            </p>
            <FormField
              label={t('admin.riskControl.blockedKeywords')}
              description={`${t('admin.riskControl.blockedKeywordCount', { count: keywordCount })} · ${t('admin.riskControl.blockedKeywordsLimit', { max: blockedKeywordMax })}`}
            >
              <Textarea
                rows={10}
                className="font-mono text-xs"
                placeholder={t('admin.riskControl.blockedKeywordsPlaceholder')}
                value={form.blocked_keywords_text}
                onChange={(e) => setForm({ blocked_keywords_text: e.target.value })}
              />
            </FormField>
          </TabsContent>

          <TabsContent value="retention" className="grid gap-4 sm:grid-cols-2">
            <FormField label={t('admin.riskControl.hitRetentionDays')}>
              <Input
                type="number"
                min={1}
                value={form.hit_retention_days}
                onChange={num('hit_retention_days')}
              />
            </FormField>
            <FormField label={t('admin.riskControl.nonHitRetentionDays')}>
              <Input
                type="number"
                min={1}
                max={3}
                value={form.non_hit_retention_days}
                onChange={num('non_hit_retention_days')}
              />
            </FormField>
          </TabsContent>
        </Tabs>
      </AdminFormDialog>

      <ConfirmDialog
        open={clearHashes}
        onOpenChange={setClearHashes}
        title={t('admin.riskControl.clearFlaggedHashes')}
        description={t('admin.riskControl.clearFlaggedHashesConfirm')}
        destructive
        onConfirm={() => void doClearHashes()}
      />
    </div>
  )
}
