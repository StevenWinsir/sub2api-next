/** /admin/prompt-audit：提示词审计（运行态 / 审计节点池 / 策略 / 事件工作区 / 按条件删除）。 */
import * as React from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Eye, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { DataTable } from '@/components/DataTable'
import { FormField } from '@/components/FormField'
import { PageHeader } from '@/components/PageHeader'
import { StatusBadge } from '@/components/StatusBadge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AdminFormDialog } from '@/features/admin/common/AdminFormDialog'
import { FilterSelect } from '@/features/admin/common/FilterBar'
import { useTableState } from '@/features/admin/common/useTableState'
import { t, getLocale } from '@/i18n'
import { useLocale } from '@/i18n/react'
import { useAppStore } from '@/stores/app'
import { extractApiErrorCode, extractApiErrorMessage } from '@/utils/apiError'
import promptAuditAPI from './api'
import type {
  PromptAuditConfig,
  PromptAuditDraft,
  PromptAuditEndpointDraft,
  PromptAuditEvent,
  PromptAuditGroup,
  PromptAuditRuntime,
  PromptDeletePreview,
  PromptEventFilters,
  PromptEventPage,
  PromptProbeResult
} from './types'
import {
  DELETE_RANGE_PRESETS,
  SCANNER_CATALOG,
  buildUpdateRequest,
  cloneData,
  configToDraft,
  createDefaultEndpoint,
  draftFingerprint,
  emptyEventFilters,
  hasExplicitDeleteRange,
  resolveDeleteRangeFilters,
  type DeleteRangePreset
} from './viewModel'

const fmtDate = (v: string) =>
  new Intl.DateTimeFormat(getLocale(), { dateStyle: 'medium', timeStyle: 'medium' }).format(new Date(v))

function errMsg(error: unknown, fallbackKey: string): string {
  const code = extractApiErrorCode(error)
  if (code) {
    const key = `admin.promptAudit.errors.${code}`
    const translated = t(key)
    if (translated !== key) return translated
  }
  return extractApiErrorMessage(error, t(fallbackKey))
}

const riskTone = (r: string) =>
  r === 'critical' ? 'error' : r === 'high' ? 'error' : r === 'medium' ? 'warning' : 'success'
const decisionTone = (d: string) => (d === 'critical' ? 'error' : d === 'flag' ? 'warning' : 'success')
const scannerLabel = (id: string) =>
  SCANNER_CATALOG.some((s) => s.id === id) ? t(`admin.promptAudit.scanners.${id}`) : id
const isIn = (set: string[], v: string) => set.includes(v)

/* ------------------------------ 运行态 ------------------------------ */
function RuntimeOverview({
  runtime,
  loading,
  error,
  onRefresh
}: {
  runtime: PromptAuditRuntime | null
  loading: boolean
  error: string
  onRefresh: () => void
}) {
  const items = runtime
    ? [
        {
          l: t('admin.promptAudit.runtime.process'),
          v: t(`admin.promptAudit.status.${runtime.process_status}`)
        },
        { l: t('admin.promptAudit.runtime.mode'), v: t(`admin.promptAudit.mode.${runtime.effective_mode}`) },
        {
          l: t('admin.promptAudit.runtime.version'),
          v: `${runtime.active_config_version} / ${runtime.expected_config_version}`
        },
        {
          l: t('admin.promptAudit.runtime.workers'),
          v: `${runtime.worker_active} / ${runtime.worker_total}`
        },
        { l: t('admin.promptAudit.runtime.queue'), v: `${runtime.queue.active} / ${runtime.queue_capacity}` },
        {
          l: t('admin.promptAudit.runtime.dependencies'),
          v: `DB ${runtime.database_status} · Redis ${runtime.redis_status}`
        }
      ]
    : []
  const m = runtime?.guard_metrics
  const metrics = m
    ? [
        ['total', m.total],
        ['allowed', m.allowed],
        ['flagged', m.flagged],
        ['blocked', m.blocked],
        ['unavailable', m.unavailable],
        ['timeouts', m.timeouts],
        ['failovers', m.failovers]
      ].map(([k, v]) => ({ l: t(`admin.promptAudit.metrics.${k}`), v: String(v) }))
    : []
  if (m) metrics.push({ l: 'P95', v: m.latency_p95_ms != null ? `${m.latency_p95_ms} ms` : '—' })
  return (
    <section className="py-5">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">{t('admin.promptAudit.runtime.title')}</h2>
          <p className="text-sm text-muted-foreground">{t('admin.promptAudit.runtime.description')}</p>
        </div>
        <Button size="sm" variant="outline" loading={loading} onClick={onRefresh}>
          <RefreshCw aria-hidden />
          {t('admin.promptAudit.actions.refresh')}
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {!runtime && loading ? <Skeleton className="h-24" /> : null}
      {runtime ? (
        <>
          <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((i) => (
              <div key={i.l} className="rounded-md border bg-muted/30 px-3 py-2">
                <dt className="text-xs text-muted-foreground">{i.l}</dt>
                <dd className="text-sm font-medium">{i.v}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-xs text-muted-foreground">
            {t('admin.promptAudit.runtime.queueBreakdown', { ...runtime.queue })} ·{' '}
            {t('admin.promptAudit.runtime.deliveryTotals', {
              enqueued: runtime.enqueued_total,
              dropped: runtime.dropped_total,
              processed: runtime.processed_total,
              failed: runtime.failed_total
            })}
          </p>
          <h3 className="mt-4 mb-2 text-sm font-medium">{t('admin.promptAudit.runtime.guardMetrics')}</h3>
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
            {metrics.map((i) => (
              <div key={i.l} className="rounded-md border px-3 py-2">
                <dt className="text-xs text-muted-foreground">{i.l}</dt>
                <dd className="text-sm font-semibold tabular-nums">{i.v}</dd>
              </div>
            ))}
          </dl>
          {runtime.last_error_message ? (
            <p className="mt-3 text-xs text-destructive">
              {runtime.last_error_code}: {runtime.last_error_message}
            </p>
          ) : null}
        </>
      ) : null}
    </section>
  )
}

/* ------------------------------ 节点池 ------------------------------ */
function EndpointPool({
  endpoints,
  probeResults,
  probingIds,
  onChange,
  onProbe
}: {
  endpoints: PromptAuditEndpointDraft[]
  probeResults: Record<string, PromptProbeResult>
  probingIds: string[]
  onChange: (v: PromptAuditEndpointDraft[]) => void
  onProbe: (e: PromptAuditEndpointDraft) => void
}) {
  const [editing, setEditing] = React.useState<{ index: number; value: PromptAuditEndpointDraft } | null>(
    null
  )
  const [removing, setRemoving] = React.useState<PromptAuditEndpointDraft | null>(null)
  const credentialInvalid = (e: PromptAuditEndpointDraft) =>
    e.token_status === 'invalid' && !e.token.trim() && !e.clear_token
  const hasCredential = (e: PromptAuditEndpointDraft) =>
    Boolean(e.token.trim() || (e.has_token && !e.clear_token))
  const set = (patch: Partial<PromptAuditEndpointDraft>) =>
    setEditing((c) => (c ? { ...c, value: { ...c.value, ...patch } } : c))
  const save = () => {
    if (!editing) return
    const v = cloneData(editing.value)
    if (!v.id.trim() || !v.name.trim() || !v.base_url.trim()) return
    if (v.token.trim()) v.clear_token = false
    const next = endpoints.map(cloneData)
    if (editing.index < 0) next.push(v)
    else next.splice(editing.index, 1, v)
    onChange(next)
    setEditing(null)
  }
  return (
    <section className="border-t py-5">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">{t('admin.promptAudit.pool.title')}</h2>
          <p className="text-sm text-muted-foreground">{t('admin.promptAudit.pool.description')}</p>
        </div>
        <Button
          size="sm"
          onClick={() => setEditing({ index: -1, value: createDefaultEndpoint(endpoints.length + 1) })}
        >
          <Plus aria-hidden />
          {t('admin.promptAudit.pool.add')}
        </Button>
      </div>
      {endpoints.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('admin.promptAudit.pool.empty')}</p>
      ) : null}
      <ul className="grid gap-3">
        {endpoints.map((e, i) => {
          const probe = probeResults[e.id]
          const probing = probingIds.includes(e.id)
          return (
            <li key={e.id} className="rounded-md border p-3">
              <div className="flex flex-wrap items-center gap-3">
                <Switch
                  checked={e.enabled}
                  aria-label={t('admin.promptAudit.pool.toggleNode', { name: e.name })}
                  onCheckedChange={(v) =>
                    onChange(endpoints.map((x) => (x.id === e.id ? { ...x, enabled: v } : cloneData(x))))
                  }
                />
                <div className="min-w-0 flex-1">
                  <div className="font-medium">
                    <span className="text-muted-foreground">#{i + 1}</span> {e.name}
                  </div>
                  <div className="truncate font-mono text-xs text-muted-foreground">
                    {e.id} · {e.base_url}
                  </div>
                </div>
                <div className="text-xs text-muted-foreground">
                  {e.model} · {e.timeout_ms}ms / {e.input_limit}
                </div>
                <StatusBadge
                  status={credentialInvalid(e) ? 'error' : hasCredential(e) ? 'success' : 'neutral'}
                >
                  {credentialInvalid(e)
                    ? t('admin.promptAudit.pool.invalid')
                    : hasCredential(e)
                      ? t('admin.promptAudit.pool.configured')
                      : t('admin.promptAudit.pool.missing')}
                </StatusBadge>
                <Button size="sm" variant="outline" loading={probing} onClick={() => onProbe(e)}>
                  {probing ? t('admin.promptAudit.pool.probing') : t('admin.promptAudit.pool.probe')}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setEditing({ index: i, value: cloneData(e) })}
                >
                  {t('common.edit')}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={t('common.delete')}
                  onClick={() => setRemoving(e)}
                >
                  <Trash2 aria-hidden />
                </Button>
              </div>
              {probing ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  {t('admin.promptAudit.pool.probeProgress')}
                </p>
              ) : probe ? (
                <p className={`mt-2 text-xs ${probe.ok ? 'text-success' : 'text-destructive'}`}>
                  {probe.ok
                    ? t('admin.promptAudit.pool.probeResult', {
                        http: probe.http_status,
                        status: probe.status,
                        latency: probe.latency_ms
                      })
                    : `${probe.error_code || probe.status}: ${probe.message}`}
                </p>
              ) : null}
            </li>
          )
        })}
      </ul>

      <AdminFormDialog
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        title={
          editing && editing.index < 0 ? t('admin.promptAudit.pool.add') : t('admin.promptAudit.pool.edit')
        }
        size="lg"
        onSubmit={save}
        submitDisabled={
          !editing?.value.id.trim() || !editing?.value.name.trim() || !editing?.value.base_url.trim()
        }
      >
        {editing ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label={t('admin.promptAudit.pool.name')} required>
              <Input value={editing.value.name} onChange={(e) => set({ name: e.target.value })} />
            </FormField>
            <FormField label={t('admin.promptAudit.pool.id')} required>
              <Input
                value={editing.value.id}
                disabled={editing.index >= 0}
                onChange={(e) => set({ id: e.target.value })}
              />
            </FormField>
            <FormField label={t('admin.promptAudit.pool.baseUrl')} required className="sm:col-span-2">
              <Input value={editing.value.base_url} onChange={(e) => set({ base_url: e.target.value })} />
            </FormField>
            <FormField label={t('admin.promptAudit.pool.model')}>
              <Input value={editing.value.model} onChange={(e) => set({ model: e.target.value })} />
            </FormField>
            <FormField
              label={t('admin.promptAudit.pool.apiKey')}
              description={
                editing.value.token_status === 'invalid'
                  ? t('admin.promptAudit.pool.reenterSecret')
                  : editing.value.has_token
                    ? t('admin.promptAudit.pool.keepSecret')
                    : t('admin.promptAudit.pool.secretHint')
              }
            >
              <Input
                type="password"
                autoComplete="new-password"
                value={editing.value.token}
                onChange={(e) => set({ token: e.target.value })}
              />
            </FormField>
            <FormField label={t('admin.promptAudit.pool.timeout')}>
              <Input
                type="number"
                min={1}
                value={editing.value.timeout_ms}
                onChange={(e) => set({ timeout_ms: Number(e.target.value) })}
              />
            </FormField>
            <FormField label={t('admin.promptAudit.pool.inputLimit')}>
              <Input
                type="number"
                min={1}
                value={editing.value.input_limit}
                onChange={(e) => set({ input_limit: Number(e.target.value) })}
              />
            </FormField>
            {editing.value.has_token ? (
              <label className="flex items-center gap-2 text-sm sm:col-span-2">
                <Checkbox
                  checked={editing.value.clear_token}
                  onCheckedChange={(v) => set({ clear_token: v === true })}
                />
                {t('admin.promptAudit.pool.clearSecret')}
              </label>
            ) : null}
          </div>
        ) : null}
      </AdminFormDialog>
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={t('common.delete')}
        description={removing ? t('admin.promptAudit.pool.deleteConfirm', { name: removing.name }) : ''}
        destructive
        onConfirm={() => {
          if (removing) onChange(endpoints.filter((x) => x.id !== removing.id).map(cloneData))
          setRemoving(null)
        }}
      />
    </section>
  )
}

/* ------------------------------ 策略 ------------------------------ */
function PolicyPanel({
  draft,
  groups,
  onChange
}: {
  draft: PromptAuditDraft
  groups: PromptAuditGroup[]
  onChange: (v: PromptAuditDraft) => void
}) {
  const [q, setQ] = React.useState('')
  const patch = (p: Partial<PromptAuditDraft>) => onChange({ ...cloneData(draft), ...p })
  const filtered = groups.filter(
    (g) => !q.trim() || `${g.name} ${g.id} ${g.platform}`.toLowerCase().includes(q.trim().toLowerCase())
  )
  const known = new Set(groups.map((g) => g.id))
  const missing = draft.group_ids.filter((id) => !known.has(id))
  const toggleGroup = (id: number) => {
    const s = new Set(draft.group_ids)
    if (s.has(id)) s.delete(id)
    else s.add(id)
    patch({ group_ids: [...s].sort((a, b) => a - b) })
  }
  const toggleScanner = (id: string) => {
    const s = new Set(draft.scanners)
    if (s.has(id)) s.delete(id)
    else s.add(id)
    patch({ scanners: SCANNER_CATALOG.map((x) => x.id).filter((x) => s.has(x)) })
  }
  return (
    <section className="border-t py-5">
      <h2 className="text-base font-semibold">{t('admin.promptAudit.policy.title')}</h2>
      <p className="mb-4 text-sm text-muted-foreground">{t('admin.promptAudit.policy.description')}</p>
      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <h3 className="mb-2 text-sm font-medium">{t('admin.promptAudit.policy.scope')}</h3>
          <div className="mb-3 flex gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="pa-scope"
                checked={draft.all_groups}
                onChange={() => patch({ all_groups: true })}
              />
              {t('admin.promptAudit.policy.allGroups')}
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="pa-scope"
                checked={!draft.all_groups}
                onChange={() => patch({ all_groups: false })}
              />
              {t('admin.promptAudit.policy.selectedGroups')}
            </label>
          </div>
          {!draft.all_groups ? (
            <div>
              <Input
                aria-label={t('admin.promptAudit.policy.searchGroups')}
                placeholder={t('admin.promptAudit.policy.searchGroups')}
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
              <p className="my-1 text-xs text-muted-foreground">
                {t('admin.promptAudit.policy.selectedCount', { count: draft.group_ids.length })}
              </p>
              <div className="max-h-56 overflow-y-auto rounded-md border p-2">
                {filtered.length === 0 ? (
                  <p className="p-2 text-sm text-muted-foreground">
                    {t('admin.promptAudit.policy.noGroups')}
                  </p>
                ) : null}
                {filtered.map((g) => (
                  <label key={g.id} className="flex items-center gap-2 py-1 text-sm">
                    <Checkbox
                      checked={draft.group_ids.includes(g.id)}
                      onCheckedChange={() => toggleGroup(g.id)}
                    />
                    <span className="truncate">{g.name}</span>
                    <span className="text-xs text-muted-foreground">
                      #{g.id} · {g.platform}
                    </span>
                    {g.status !== 'active' ? <Badge variant="secondary">{g.status}</Badge> : null}
                  </label>
                ))}
              </div>
              {missing.length ? (
                <div className="mt-2 text-xs text-warning">
                  {t('admin.promptAudit.policy.missingGroups')}:{' '}
                  {missing.map((id) => (
                    <button key={id} type="button" className="mr-2 underline" onClick={() => toggleGroup(id)}>
                      #{id} ✕
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
        <div>
          <h3 className="mb-2 text-sm font-medium">{t('admin.promptAudit.policy.scanners')}</h3>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {SCANNER_CATALOG.map((s) => (
              <label
                key={s.id}
                className="flex items-center gap-2 text-sm"
                title={t(`admin.promptAudit.scannerDescriptions.${s.id}`)}
              >
                <Checkbox
                  checked={draft.scanners.includes(s.id)}
                  onCheckedChange={() => toggleScanner(s.id)}
                />
                {t(`admin.promptAudit.scanners.${s.id}`)}
              </label>
            ))}
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <FormField label={t('admin.promptAudit.policy.workerCount')}>
              <Input
                type="number"
                min={1}
                value={draft.worker_count}
                onChange={(e) => patch({ worker_count: Number(e.target.value) })}
              />
            </FormField>
            <FormField label={t('admin.promptAudit.policy.queueCapacity')}>
              <Input
                type="number"
                min={1}
                value={draft.queue_capacity}
                onChange={(e) => patch({ queue_capacity: Number(e.target.value) })}
              />
            </FormField>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            <b>{t('admin.promptAudit.policy.strategy')}:</b> {t('admin.promptAudit.policy.strategyHint')}
          </p>
        </div>
      </div>
    </section>
  )
}

/* ------------------------------ 事件详情 ------------------------------ */
function EventDetail({
  event,
  loading,
  onClose
}: {
  event: PromptAuditEvent | null
  loading: boolean
  onClose: () => void
}) {
  const DEC = ['pass', 'flag', 'critical']
  const ACT = ['Allow', 'Warn', 'Block']
  const RISK = ['low', 'medium', 'high', 'critical']
  const tr = (set: string[], ns: string, v: string) => (isIn(set, v) ? t(`admin.promptAudit.${ns}.${v}`) : v)
  const evidenceLabel = (v: string) => {
    const byId = SCANNER_CATALOG.find((s) => s.id === v) ?? SCANNER_CATALOG.find((s) => s.label === v)
    return byId ? t(`admin.promptAudit.scanners.${byId.id}`) : v
  }
  const guardReturn = (e: PromptAuditEvent) =>
    JSON.stringify(
      {
        decision: tr(DEC, 'decisions', e.decision),
        risk_level: tr(RISK, 'riskLevels', e.risk_level),
        action: tr(ACT, 'actions', e.action),
        categories: e.categories.map(scannerLabel),
        matched_scanners: e.matched_scanners.map(scannerLabel),
        scanner_scores: e.scanner_scores,
        scanner_evidence: Object.fromEntries(
          Object.entries(e.scanner_evidence || {}).map(([k, v]) => [k, evidenceLabel(v)])
        ),
        scanner_backend: e.scanner_backend,
        scanner_version: e.scanner_version,
        guard_endpoint_id: e.guard_endpoint_id,
        chunk_total: e.chunk_total,
        latency_ms: e.latency_ms
      },
      null,
      2
    )
  return (
    <AdminFormDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={t('admin.promptAudit.events.detailTitle')}
      size="xl"
    >
      {loading || !event ? (
        <Skeleton className="h-48" />
      ) : (
        <Tabs key={event.id} defaultValue="summary">
          <TabsList>
            {(['summary', 'risks', 'technical'] as const).map((k) => (
              <TabsTrigger key={k} value={k}>
                {t(`admin.promptAudit.events.tabs.${k}`)}
              </TabsTrigger>
            ))}
          </TabsList>
          <TabsContent value="summary" className="grid gap-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={decisionTone(event.decision)}>
                {tr(DEC, 'decisions', event.decision)} · {tr(ACT, 'actions', event.action)}
              </StatusBadge>
              <StatusBadge status={riskTone(event.risk_level)}>
                {tr(RISK, 'riskLevels', event.risk_level)}
              </StatusBadge>
              <span className="text-muted-foreground">{fmtDate(event.created_at)}</span>
            </div>
            <dl className="grid gap-2 sm:grid-cols-2">
              {[
                [
                  t('admin.promptAudit.events.user'),
                  `${event.snapshot.username} (#${event.snapshot.user_id})`
                ],
                [t('admin.promptAudit.events.email'), event.snapshot.user_email],
                [t('admin.promptAudit.events.apiKey'), event.snapshot.api_key_name],
                [t('admin.promptAudit.events.group'), event.snapshot.group_name],
                [
                  t('admin.promptAudit.events.categories'),
                  event.categories.length ? event.categories.map(scannerLabel).join(', ') : '—'
                ],
                [t('admin.promptAudit.events.model'), event.snapshot.model],
                [t('admin.promptAudit.events.stage'), event.snapshot.stage],
                [t('admin.promptAudit.events.requestId'), event.snapshot.request_id],
                [t('admin.promptAudit.events.promptHash'), event.snapshot.prompt_hash]
              ].map(([l, v]) => (
                <div key={l}>
                  <dt className="text-xs text-muted-foreground">{l}</dt>
                  <dd className="font-mono text-xs break-all">{v || '—'}</dd>
                </div>
              ))}
            </dl>
            <section>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase">
                {t('admin.promptAudit.events.promptFull')}
              </h4>
              <p className="mb-1 text-xs text-warning">{t('admin.promptAudit.events.promptFullHint')}</p>
              <pre className="max-h-72 overflow-auto rounded-md bg-muted/40 p-3 text-xs break-words whitespace-pre-wrap">
                {event.snapshot.full_prompt || event.snapshot.redacted_preview || '—'}
              </pre>
            </section>
            <section>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase">
                {t('admin.promptAudit.events.guardReturn')}
              </h4>
              <p className="mb-1 text-xs text-muted-foreground">
                {t('admin.promptAudit.events.guardReturnHint')}
              </p>
              <pre className="max-h-60 overflow-auto rounded-md bg-muted/40 p-3 font-mono text-xs">
                {guardReturn(event)}
              </pre>
            </section>
          </TabsContent>
          <TabsContent value="risks" className="grid gap-3 text-sm">
            {event.issue_summaries.length === 0 ? (
              <p className="text-muted-foreground">{t('admin.promptAudit.events.noRisks')}</p>
            ) : null}
            {event.issue_summaries.map((i, idx) => {
              const cat = i.category || i.scanner_id
              const dKey = `admin.promptAudit.scannerDescriptions.${cat}`
              const desc = t(dKey)
              return (
                <div key={`${cat}-${idx}`} className="rounded-md border p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <b>{scannerLabel(cat) || i.title}</b>
                    <StatusBadge status={riskTone(i.severity)}>
                      {isIn(RISK, i.severity)
                        ? t(`admin.promptAudit.riskLevels.${i.severity}`)
                        : i.severity_label || i.severity}
                    </StatusBadge>
                    <Badge variant="secondary">
                      {isIn(ACT, i.action)
                        ? t(`admin.promptAudit.actions.${i.action}`)
                        : i.action_label || i.action}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {t('admin.promptAudit.events.score')}: {i.score}
                    </span>
                  </div>
                  <p className="mt-1 text-muted-foreground">{desc === dKey ? i.description : desc}</p>
                  {i.evidence ? (
                    <p className="mt-2 text-xs">
                      <b>{t('admin.promptAudit.events.evidence')}:</b>{' '}
                      <span className="font-mono">{i.evidence}</span>
                    </p>
                  ) : null}
                </div>
              )
            })}
          </TabsContent>
          <TabsContent value="technical">
            <dl className="grid gap-2 text-sm sm:grid-cols-2">
              {[
                [
                  t('admin.promptAudit.events.technical.scanner'),
                  `${event.scanner_backend} ${event.scanner_version}`
                ],
                [
                  t('admin.promptAudit.events.technical.policy'),
                  `${event.policy_id} v${event.policy_version}`
                ],
                [t('admin.promptAudit.events.technical.guardEndpoint'), event.guard_endpoint_id],
                [t('admin.promptAudit.events.technical.config'), `v${event.config_version}`],
                [t('admin.promptAudit.events.technical.chunks'), String(event.chunk_total)],
                [t('admin.promptAudit.events.technical.latency'), `${event.latency_ms} ms`],
                [t('admin.promptAudit.events.technical.protocol'), event.snapshot.protocol],
                [t('admin.promptAudit.events.route'), `${event.snapshot.endpoint} / ${event.snapshot.model}`]
              ].map(([l, v]) => (
                <div key={l}>
                  <dt className="text-xs text-muted-foreground">{l}</dt>
                  <dd className="font-mono text-xs break-all">{v || '—'}</dd>
                </div>
              ))}
            </dl>
          </TabsContent>
        </Tabs>
      )}
    </AdminFormDialog>
  )
}

/* ------------------------------ 按条件删除 ------------------------------ */
function FilterDeleteDialog({
  initial,
  preview,
  previewing,
  deleting,
  onClose,
  onPreview,
  onConfirm,
  onCriteriaChange
}: {
  initial: PromptEventFilters
  preview: PromptDeletePreview | null
  previewing: boolean
  deleting: boolean
  onClose: () => void
  onPreview: (f: PromptEventFilters) => void
  onConfirm: (f: PromptEventFilters) => void
  onCriteriaChange: () => void
}) {
  const init = React.useMemo(() => cloneData(initial), [initial])
  const [preset, setPreset] = React.useState<DeleteRangePreset>(
    hasExplicitDeleteRange(init) ? 'custom' : '7d'
  )
  const [local, setLocal] = React.useState<PromptEventFilters>(init)
  const canPreview = preset !== 'custom' || hasExplicitDeleteRange(local)
  const confirmDisabled =
    !canPreview || previewing || deleting || (preview !== null && preview.matched_count === 0)
  const reason =
    previewing || deleting
      ? ''
      : !canPreview
        ? t('admin.promptAudit.events.filterDeleteConfirmInvalidRange')
        : preview && preview.matched_count === 0
          ? t('admin.promptAudit.events.filterDeleteConfirmNoMatches')
          : ''
  const set = (p: Partial<PromptEventFilters>) => {
    setLocal((l) => ({ ...l, ...p }))
    onCriteriaChange()
  }
  const resolved = () => resolveDeleteRangeFilters(local, preset)
  const dec = [
    ['', t('common.all')],
    ['pass', t('admin.promptAudit.decisions.pass')],
    ['flag', t('admin.promptAudit.decisions.flag')],
    ['critical', t('admin.promptAudit.decisions.critical')]
  ]
  const rsk = [
    ['', t('common.all')],
    ...['low', 'medium', 'high', 'critical'].map((r) => [r, t(`admin.promptAudit.riskLevels.${r}`)])
  ]
  return (
    <AdminFormDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={t('admin.promptAudit.events.filterDeleteDialogTitle')}
      description={t('admin.promptAudit.events.filterDeleteDialogDesc')}
      size="lg"
      destructive
      submitText={t('admin.promptAudit.events.confirmFilterDelete')}
      submitting={deleting}
      submitDisabled={confirmDisabled}
      onSubmit={() => onConfirm(resolved())}
      footerExtra={reason ? <span className="text-xs text-muted-foreground">{reason}</span> : null}
    >
      <FormField
        label={t('admin.promptAudit.events.filterTimeRange')}
        description={t('admin.promptAudit.events.filterTimeRangeHint')}
      >
        <FilterSelect
          className="w-64"
          label={t('admin.promptAudit.events.filterTimeRange')}
          value={preset}
          onChange={(v) => {
            setPreset(v as DeleteRangePreset)
            onCriteriaChange()
          }}
          options={DELETE_RANGE_PRESETS.map((p) => ({
            value: p.id,
            label: t(`admin.promptAudit.events.timePresets.${p.id}`)
          }))}
        />
      </FormField>
      {preset === 'custom' ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label={t('admin.promptAudit.events.startAt')}>
            <Input
              type="datetime-local"
              value={local.start_at}
              onChange={(e) => set({ start_at: e.target.value })}
            />
          </FormField>
          <FormField
            label={t('admin.promptAudit.events.endAt')}
            error={!canPreview ? t('admin.promptAudit.events.customRangeInvalid') : undefined}
          >
            <Input
              type="datetime-local"
              value={local.end_at}
              onChange={(e) => set({ end_at: e.target.value })}
            />
          </FormField>
        </div>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label={t('admin.promptAudit.events.decision')}>
          <FilterSelect
            className="w-full"
            label={t('admin.promptAudit.events.decision')}
            value={local.decision}
            onChange={(v) => set({ decision: v })}
            options={dec.map(([value, label]) => ({ value, label }))}
          />
        </FormField>
        <FormField label={t('admin.promptAudit.events.risk')}>
          <FilterSelect
            className="w-full"
            label={t('admin.promptAudit.events.risk')}
            value={local.risk_level}
            onChange={(v) => set({ risk_level: v })}
            options={rsk.map(([value, label]) => ({ value, label }))}
          />
        </FormField>
      </div>
      <details className="rounded-md border p-3">
        <summary className="cursor-pointer text-sm">{t('admin.promptAudit.events.moreConditions')}</summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {(['endpoint', 'keyword', 'group_id', 'user_id'] as const).map((k) => (
            <FormField
              key={k}
              label={t(
                k === 'endpoint'
                  ? 'admin.promptAudit.events.endpoint'
                  : k === 'keyword'
                    ? 'admin.promptAudit.events.keyword'
                    : k === 'group_id'
                      ? 'admin.promptAudit.events.groupId'
                      : 'admin.promptAudit.events.userId'
              )}
            >
              <Input
                value={local[k]}
                onChange={(e) => set({ [k]: e.target.value } as Partial<PromptEventFilters>)}
              />
            </FormField>
          ))}
        </div>
      </details>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!canPreview}
          loading={previewing}
          onClick={() => onPreview(resolved())}
        >
          {previewing
            ? t('admin.promptAudit.events.filterDeletePreviewing')
            : t('admin.promptAudit.events.filterDeletePreviewAction')}
        </Button>
        {!preview ? (
          <span className="text-xs text-muted-foreground">
            {t('admin.promptAudit.events.filterDeleteNeedPreview')}
          </span>
        ) : null}
      </div>
      {preview ? (
        <div className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">
          <p className="font-medium">
            {t('admin.promptAudit.events.filterDeleteCount', { count: preview.matched_count })}
          </p>
          <p className="text-xs text-muted-foreground">
            {t('admin.promptAudit.events.snapshotMax')}: {preview.snapshot_max_id} ·{' '}
            {t('admin.promptAudit.events.expiresAt')}: {fmtDate(preview.expires_at)}
          </p>
          <p className="mt-1 text-xs">{t('admin.promptAudit.events.filterDeleteWarning')}</p>
        </div>
      ) : null}
    </AdminFormDialog>
  )
}

/* ------------------------------ 事件工作区 ------------------------------ */
function EventWorkspace({
  data,
  filters,
  selected,
  loading,
  error,
  table,
  onFilters,
  onSearch,
  onSelect,
  onView,
  onDelete,
  onBatchDelete,
  onPreviewDelete
}: {
  data: PromptEventPage
  filters: PromptEventFilters
  selected: number[]
  loading: boolean
  error: string
  table: ReturnType<typeof useTableState>
  onFilters: (f: PromptEventFilters) => void
  onSearch: (f: PromptEventFilters) => void
  onSelect: (ids: number[]) => void
  onView: (id: number) => void
  onDelete: (id: number) => void
  onBatchDelete: () => void
  onPreviewDelete: () => void
}) {
  const locale = useLocale()
  const set = (p: Partial<PromptEventFilters>) => onFilters({ ...filters, ...p })
  const enter = (e: React.KeyboardEvent) => e.key === 'Enter' && onSearch(filters)
  const allSel = data.items.length > 0 && data.items.every((e) => selected.includes(e.id))
  const columns = React.useMemo(
    () => [
      {
        id: 'sel',
        header: () => (
          <Checkbox
            aria-label={t('admin.promptAudit.events.selectAll')}
            checked={allSel}
            onCheckedChange={(v) => onSelect(v === true ? data.items.map((e) => e.id) : [])}
          />
        ),
        cell: ({ row }: { row: { original: PromptAuditEvent } }) => (
          <Checkbox
            aria-label={t('admin.promptAudit.events.selectEvent', { id: row.original.id })}
            checked={selected.includes(row.original.id)}
            onCheckedChange={(v) =>
              onSelect(
                v === true ? [...selected, row.original.id] : selected.filter((x) => x !== row.original.id)
              )
            }
          />
        )
      },
      {
        id: 'time',
        header: t('admin.promptAudit.events.time'),
        cell: ({ row }: { row: { original: PromptAuditEvent } }) => (
          <span className="whitespace-nowrap text-xs">{fmtDate(row.original.created_at)}</span>
        )
      },
      {
        id: 'identity',
        header: t('admin.promptAudit.events.identity'),
        cell: ({ row }: { row: { original: PromptAuditEvent } }) => (
          <div className="max-w-[220px] min-w-0 text-xs">
            <div className="truncate font-medium">
              {row.original.snapshot.username || `#${row.original.snapshot.user_id}`}
            </div>
            <div className="truncate text-muted-foreground">{row.original.snapshot.user_email}</div>
            <div className="truncate text-muted-foreground">{row.original.snapshot.api_key_name}</div>
          </div>
        )
      },
      {
        id: 'group',
        header: t('admin.promptAudit.events.group'),
        cell: ({ row }: { row: { original: PromptAuditEvent } }) => (
          <span className="text-xs">{row.original.snapshot.group_name || '—'}</span>
        )
      },
      {
        id: 'route',
        header: t('admin.promptAudit.events.route'),
        cell: ({ row }: { row: { original: PromptAuditEvent } }) => (
          <div className="max-w-[200px] truncate font-mono text-xs">
            {row.original.snapshot.endpoint}
            <div className="text-muted-foreground">{row.original.snapshot.model}</div>
          </div>
        )
      },
      {
        id: 'result',
        header: t('admin.promptAudit.events.result'),
        cell: ({ row }: { row: { original: PromptAuditEvent } }) => (
          <div className="flex flex-col items-start gap-1">
            <StatusBadge status={decisionTone(row.original.decision)}>
              {isIn(['pass', 'flag', 'critical'], row.original.decision)
                ? t(`admin.promptAudit.decisions.${row.original.decision}`)
                : row.original.decision}
            </StatusBadge>
            <StatusBadge status={riskTone(row.original.risk_level)} dot={false}>
              {isIn(['low', 'medium', 'high', 'critical'], row.original.risk_level)
                ? t(`admin.promptAudit.riskLevels.${row.original.risk_level}`)
                : row.original.risk_level}
            </StatusBadge>
          </div>
        )
      },
      {
        id: 'preview',
        header: t('admin.promptAudit.events.preview'),
        cell: ({ row }: { row: { original: PromptAuditEvent } }) => (
          <div className="line-clamp-2 max-w-xs text-xs break-words">
            {row.original.snapshot.redacted_preview}
          </div>
        )
      },
      {
        id: 'actions',
        header: t('admin.promptAudit.common.actions'),
        cell: ({ row }: { row: { original: PromptAuditEvent } }) => (
          <div className="flex gap-1">
            <Button size="sm" variant="ghost" onClick={() => onView(row.original.id)}>
              <Eye aria-hidden />
              {t('common.view')}
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="size-8"
              aria-label={t('common.delete')}
              onClick={() => onDelete(row.original.id)}
            >
              <Trash2 aria-hidden />
            </Button>
          </div>
        )
      }
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [locale, data.items, selected, allSel]
  )
  const all = { value: '', label: t('common.all') }
  return (
    <section className="py-5">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">{t('admin.promptAudit.events.title')}</h2>
          <p className="text-sm text-muted-foreground">{t('admin.promptAudit.events.description')}</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="destructive" disabled={selected.length === 0} onClick={onBatchDelete}>
            <Trash2 aria-hidden />
            {t('admin.promptAudit.events.deleteSelected', { count: selected.length })}
          </Button>
          <Button size="sm" variant="outline" onClick={onPreviewDelete}>
            {t('admin.promptAudit.events.deleteByFilter')}
          </Button>
        </div>
      </div>
      <div className="mb-4 flex flex-wrap items-end gap-2">
        <FilterSelect
          label={t('admin.promptAudit.events.decision')}
          value={filters.decision}
          onChange={(v) => set({ decision: v })}
          options={[
            all,
            ...['pass', 'flag', 'critical'].map((d) => ({
              value: d,
              label: t(`admin.promptAudit.decisions.${d}`)
            }))
          ]}
        />
        <FilterSelect
          label={t('admin.promptAudit.events.risk')}
          value={filters.risk_level}
          onChange={(v) => set({ risk_level: v })}
          options={[
            all,
            ...['low', 'medium', 'high', 'critical'].map((d) => ({
              value: d,
              label: t(`admin.promptAudit.riskLevels.${d}`)
            }))
          ]}
        />
        {(
          ['endpoint', 'group_id', 'user_id', 'api_key_id', 'request_id', 'prompt_hash', 'keyword'] as const
        ).map((k) => (
          <Input
            key={k}
            className="w-36"
            aria-label={t(
              `admin.promptAudit.events.${k === 'endpoint' ? 'endpoint' : k === 'group_id' ? 'groupId' : k === 'user_id' ? 'userId' : k === 'api_key_id' ? 'apiKeyId' : k === 'request_id' ? 'requestId' : k === 'prompt_hash' ? 'promptHash' : 'keyword'}`
            )}
            placeholder={t(
              `admin.promptAudit.events.${k === 'endpoint' ? 'endpoint' : k === 'group_id' ? 'groupId' : k === 'user_id' ? 'userId' : k === 'api_key_id' ? 'apiKeyId' : k === 'request_id' ? 'requestId' : k === 'prompt_hash' ? 'promptHash' : 'keyword'}`
            )}
            value={filters[k]}
            onChange={(e) => set({ [k]: e.target.value } as Partial<PromptEventFilters>)}
            onKeyDown={enter}
          />
        ))}
        <Input
          type="datetime-local"
          className="w-48"
          aria-label={t('admin.promptAudit.events.startAt')}
          value={filters.start_at}
          onChange={(e) => set({ start_at: e.target.value })}
        />
        <Input
          type="datetime-local"
          className="w-48"
          aria-label={t('admin.promptAudit.events.endAt')}
          value={filters.end_at}
          onChange={(e) => set({ end_at: e.target.value })}
        />
        <Button onClick={() => onSearch(filters)}>{t('common.search')}</Button>
        <Button variant="ghost" onClick={() => onSearch(emptyEventFilters())}>
          {t('common.reset')}
        </Button>
      </div>
      {error ? (
        <p role="alert" className="mb-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <DataTable
        columns={columns}
        data={data.items}
        loading={loading}
        getRowId={(r) => String(r.id)}
        pagination={table.pagination(data.total)}
        emptyTitle={t('admin.promptAudit.events.empty')}
      />
    </section>
  )
}

/* ------------------------------ 页面 ------------------------------ */
export function PromptAuditPage() {
  useLocale()
  const app = useAppStore
  const qc = useQueryClient()
  const table = useTableState()
  const [tab, setTab] = React.useState<'events' | 'config'>('events')
  const [server, setServer] = React.useState<PromptAuditDraft | null>(null)
  const [draft, setDraft] = React.useState<PromptAuditDraft | null>(null)
  const [seenConfig, setSeenConfig] = React.useState<PromptAuditConfig | undefined>()
  const [filters, setFilters] = React.useState<PromptEventFilters>(emptyEventFilters())
  const [applied, setApplied] = React.useState<PromptEventFilters>(emptyEventFilters())
  const [sel, setSel] = React.useState<{ key: string; ids: number[] }>({ key: '', ids: [] })
  const [active, setActive] = React.useState<{ event: PromptAuditEvent | null; loading: boolean } | null>(
    null
  )
  const [probeResults, setProbeResults] = React.useState<Record<string, PromptProbeResult>>({})
  const [probing, setProbing] = React.useState<string[]>([])
  const [fdOpen, setFdOpen] = React.useState(false)
  const [preview, setPreview] = React.useState<{ p: PromptDeletePreview; f: PromptEventFilters } | null>(null)
  const [blockConfirm, setBlockConfirm] = React.useState(false)
  const [delReq, setDelReq] = React.useState<{ mode: '' | 'single' | 'batch'; ids: number[] }>({
    mode: '',
    ids: []
  })
  const [busy, setBusy] = React.useState({ saving: false, deleting: false, previewing: false })
  const ld = (k: keyof typeof busy, v: boolean) => setBusy((s) => ({ ...s, [k]: v }))
  const dirty = draftFingerprint(draft) !== draftFingerprint(server)

  const configQ = useQuery({
    queryKey: ['admin', 'prompt-audit', 'config'],
    queryFn: () => promptAuditAPI.getConfig(),
    staleTime: Infinity,
    refetchOnWindowFocus: false
  })
  // 服务端配置首次到达 / 重新拉取后同步草稿（渲染期派生，避免 effect 中同步 setState）
  if (configQ.data && configQ.data !== seenConfig) {
    setSeenConfig(configQ.data)
    setServer(configToDraft(configQ.data))
    setDraft(configToDraft(configQ.data))
  }
  const runtimeQ = useQuery({
    queryKey: ['admin', 'prompt-audit', 'runtime'],
    queryFn: () => promptAuditAPI.getRuntime()
  })
  const groupsQ = useQuery({
    queryKey: ['admin', 'prompt-audit', 'groups'],
    queryFn: () => promptAuditAPI.listGroups()
  })
  const eventsQ = useQuery({
    queryKey: ['admin', 'prompt-audit', 'events', applied, table.page, table.pageSize],
    queryFn: () => promptAuditAPI.listEvents(applied, table.page, table.pageSize),
    placeholderData: (p) => p
  })
  const runtime = runtimeQ.data ?? null
  const groups = groupsQ.data ?? []
  const events: PromptEventPage =
    eventsQ.data && Array.isArray(eventsQ.data.items)
      ? eventsQ.data
      : { items: [], total: 0, page: 1, page_size: 20, pages: 0 }
  const errors = {
    config: configQ.error ? errMsg(configQ.error, 'admin.promptAudit.errors.loadConfig') : '',
    runtime: runtimeQ.error ? errMsg(runtimeQ.error, 'admin.promptAudit.errors.loadRuntime') : '',
    groups: groupsQ.error ? errMsg(groupsQ.error, 'admin.promptAudit.errors.loadGroups') : '',
    events: eventsQ.error ? errMsg(eventsQ.error, 'admin.promptAudit.errors.loadEvents') : ''
  }
  const loading = {
    runtime: runtimeQ.isFetching,
    events: eventsQ.isLoading,
    ...busy
  }
  const selKey = `${table.page}-${table.pageSize}-${JSON.stringify(applied)}`
  const selected = sel.key === selKey ? sel.ids : []
  const setSelected = (ids: number[]) => setSel({ key: selKey, ids })
  const loadConfig = () => void configQ.refetch()
  const loadRuntime = async () => {
    await runtimeQ.refetch()
  }
  const loadEvents = async () => {
    await eventsQ.refetch()
  }

  const replace = (v: PromptAuditDraft) => setDraft(cloneData(v))
  const setEnabled = (v: boolean) =>
    draft && replace({ ...draft, enabled: v, blocking_enabled: v ? draft.blocking_enabled : false })
  const setBlocking = (v: boolean) => {
    if (!draft || !draft.enabled) return
    if (v && !draft.blocking_enabled) return setBlockConfirm(true)
    replace({ ...draft, blocking_enabled: v })
  }

  const save = async () => {
    if (!draft || !dirty) return
    ld('saving', true)
    try {
      const saved = await promptAuditAPI.updateConfig(buildUpdateRequest(draft))
      qc.setQueryData(['admin', 'prompt-audit', 'config'], saved)
      setServer(configToDraft(saved))
      setDraft(configToDraft(saved))
      app.getState().showSuccess(t('admin.promptAudit.messages.saved'))
      void loadRuntime()
    } catch (e) {
      const code = extractApiErrorCode(e)
      app
        .getState()
        .showError(
          errMsg(
            e,
            code === 'prompt_audit_config_conflict'
              ? 'admin.promptAudit.errors.prompt_audit_config_conflict'
              : 'admin.promptAudit.errors.saveConfig'
          )
        )
    } finally {
      ld('saving', false)
    }
  }

  const probe = async (e: PromptAuditEndpointDraft) => {
    if (probing.includes(e.id)) return
    setProbing((p) => [...p, e.id])
    try {
      const r = await promptAuditAPI.probeEndpoint(e)
      setProbeResults((s) => ({ ...s, [e.id]: r }))
      if (r.ok) app.getState().showSuccess(t('admin.promptAudit.messages.probeSucceeded'))
      else app.getState().showError(`${r.error_code || r.status}: ${r.message}`)
    } catch (err) {
      app.getState().showError(errMsg(err, 'admin.promptAudit.errors.probe'))
    } finally {
      setProbing((p) => p.filter((x) => x !== e.id))
    }
  }

  const openEvent = async (id: number) => {
    setActive({ event: null, loading: true })
    try {
      setActive({ event: await promptAuditAPI.getEvent(id), loading: false })
    } catch (e) {
      app.getState().showError(errMsg(e, 'admin.promptAudit.errors.loadDetail'))
      setActive(null)
    }
  }

  const confirmIdDelete = async () => {
    const { mode, ids } = delReq
    setDelReq({ mode: '', ids: [] })
    if (!mode || ids.length === 0) return
    ld('deleting', true)
    try {
      const r =
        mode === 'single'
          ? await promptAuditAPI.deleteEvent(ids[0])
          : await promptAuditAPI.batchDeleteEvents(ids)
      app.getState().showSuccess(t('admin.promptAudit.messages.deleted', { count: r.deleted_events }))
      await Promise.allSettled([loadEvents(), loadRuntime()])
    } catch (e) {
      app.getState().showError(errMsg(e, 'admin.promptAudit.errors.delete'))
    } finally {
      ld('deleting', false)
    }
  }

  const runPreview = async (f: PromptEventFilters) => {
    ld('previewing', true)
    try {
      setPreview({ p: await promptAuditAPI.previewDelete(f), f: cloneData(f) })
    } catch (e) {
      setPreview(null)
      app.getState().showError(errMsg(e, 'admin.promptAudit.errors.previewDelete'))
    } finally {
      ld('previewing', false)
    }
  }
  const confirmFilterDelete = async (f?: PromptEventFilters) => {
    if (loading.deleting) return
    ld('deleting', true)
    try {
      let cur = preview
      // 一键路径：没有最新预览（或条件变更后被清除）时，就地换取确认令牌再删除
      if (!cur && f) cur = { p: await promptAuditAPI.previewDelete(f), f: cloneData(f) }
      if (!cur) return
      const r = await promptAuditAPI.deleteEventsByFilter(cur.f, cur.p)
      setFdOpen(false)
      setPreview(null)
      app.getState().showSuccess(t('admin.promptAudit.messages.deleted', { count: r.deleted_events }))
      await Promise.allSettled([loadEvents(), loadRuntime()])
    } catch (e) {
      setPreview(null)
      app.getState().showError(errMsg(e, 'admin.promptAudit.errors.deleteConfirmation'))
    } finally {
      ld('deleting', false)
    }
  }

  return (
    <div className={tab === 'config' && draft ? 'pb-24' : undefined}>
      <PageHeader
        title={t('admin.promptAudit.title')}
        description={t('admin.promptAudit.description')}
        actions={
          draft ? (
            <div className="text-right text-xs text-muted-foreground">
              <p>{t('admin.promptAudit.configVersion', { version: draft.config_version })}</p>
              {draft.updated_at ? <p>{fmtDate(draft.updated_at)}</p> : null}
            </div>
          ) : null
        }
      />
      {errors.config && !draft ? (
        <Card role="alert" className="border-destructive/40 p-5">
          <p className="text-sm text-destructive">{errors.config}</p>
          <Button size="sm" variant="outline" className="mt-3" onClick={() => void loadConfig()}>
            {t('admin.promptAudit.actions.retry')}
          </Button>
        </Card>
      ) : (
        <Tabs value={tab} onValueChange={(v) => setTab(v as 'events' | 'config')}>
          <TabsList>
            <TabsTrigger value="events">{t('admin.promptAudit.tabs.events')}</TabsTrigger>
            <TabsTrigger value="config">{t('admin.promptAudit.tabs.config')}</TabsTrigger>
          </TabsList>
          <Card className="mt-3 px-4 sm:px-6">
            <TabsContent value="events" className="mt-0">
              {draft?.enabled && !draft.store_pass_events ? (
                <div
                  role="status"
                  className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-warning/40 bg-warning/10 px-4 py-3 text-sm"
                >
                  <span>{t('admin.promptAudit.events.passEventsDisabled')}</span>
                  <Button size="sm" variant="outline" onClick={() => setTab('config')}>
                    {t('admin.promptAudit.events.openConfiguration')}
                  </Button>
                </div>
              ) : null}
              <EventWorkspace
                data={events}
                filters={filters}
                selected={selected}
                loading={loading.events}
                error={errors.events}
                table={table}
                onFilters={(f) => {
                  setFilters(cloneData(f))
                  setPreview(null)
                }}
                onSearch={(f) => {
                  setFilters(cloneData(f))
                  setApplied(cloneData(f))
                  table.setPage(1)
                  setPreview(null)
                }}
                onSelect={setSelected}
                onView={(id) => void openEvent(id)}
                onDelete={(id) => setDelReq({ mode: 'single', ids: [id] })}
                onBatchDelete={() => selected.length && setDelReq({ mode: 'batch', ids: [...selected] })}
                onPreviewDelete={() => {
                  setPreview(null)
                  setFdOpen(true)
                }}
              />
            </TabsContent>
            <TabsContent value="config" className="mt-0">
              <RuntimeOverview
                runtime={runtime}
                loading={loading.runtime}
                error={errors.runtime}
                onRefresh={() => void loadRuntime()}
              />
              {draft ? (
                <>
                  <EndpointPool
                    endpoints={draft.endpoints}
                    probeResults={probeResults}
                    probingIds={probing}
                    onChange={(v) => replace({ ...draft, endpoints: v })}
                    onProbe={(e) => void probe(e)}
                  />
                  {errors.groups ? (
                    <div role="alert" className="mb-3 rounded-md bg-warning/10 px-4 py-3 text-sm">
                      {errors.groups}
                    </div>
                  ) : null}
                  <PolicyPanel draft={draft} groups={groups} onChange={replace} />
                </>
              ) : (
                <Skeleton className="h-40" />
              )}
            </TabsContent>
          </Card>
        </Tabs>
      )}

      {draft && tab === 'config' ? (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-card/95 px-4 py-3 shadow-lg backdrop-blur lg:left-64">
          <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
              <label className="flex items-center gap-2">
                <Switch
                  checked={draft.enabled}
                  onCheckedChange={setEnabled}
                  aria-label={t('admin.promptAudit.saveBar.enabled')}
                />
                {t('admin.promptAudit.saveBar.enabled')}
              </label>
              <label className="flex items-center gap-2">
                <Switch
                  checked={draft.blocking_enabled}
                  disabled={!draft.enabled}
                  onCheckedChange={setBlocking}
                  aria-label={t('admin.promptAudit.saveBar.blocking')}
                />
                {t('admin.promptAudit.saveBar.blocking')}
              </label>
              <label className="flex items-center gap-2">
                <Switch
                  checked={draft.blocking_latest_turn_only}
                  disabled={!draft.enabled || !draft.blocking_enabled}
                  onCheckedChange={(v) => replace({ ...draft, blocking_latest_turn_only: v })}
                  aria-label={t('admin.promptAudit.saveBar.blockingLatestTurnOnly')}
                />
                {t('admin.promptAudit.saveBar.blockingLatestTurnOnly')}
              </label>
              <label className="flex items-center gap-2">
                <Switch
                  checked={draft.store_pass_events}
                  onCheckedChange={(v) => replace({ ...draft, store_pass_events: v })}
                  aria-label={t('admin.promptAudit.saveBar.storePass')}
                />
                {t('admin.promptAudit.saveBar.storePass')}
              </label>
            </div>
            <div className="flex items-center gap-3">
              <span className={`text-sm ${dirty ? 'text-warning' : 'text-muted-foreground'}`}>
                {dirty ? t('admin.promptAudit.saveBar.dirty') : t('admin.promptAudit.saveBar.synced')}
              </span>
              <Button
                variant="outline"
                disabled={!dirty || loading.saving}
                onClick={() => server && setDraft(cloneData(server))}
              >
                {t('common.reset')}
              </Button>
              <Button disabled={!dirty} loading={loading.saving} onClick={() => void save()}>
                {loading.saving ? t('common.saving') : t('common.save')}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={blockConfirm}
        onOpenChange={setBlockConfirm}
        title={t('admin.promptAudit.blockingConfirm.title')}
        description={t('admin.promptAudit.blockingConfirm.message')}
        confirmText={t('admin.promptAudit.blockingConfirm.confirm')}
        destructive
        onConfirm={() => {
          setBlockConfirm(false)
          if (draft) replace({ ...draft, blocking_enabled: true })
        }}
      />
      <ConfirmDialog
        open={delReq.mode !== ''}
        onOpenChange={(o) => !o && setDelReq({ mode: '', ids: [] })}
        title={t('admin.promptAudit.events.deleteConfirmTitle')}
        description={t('admin.promptAudit.events.deleteConfirmMessage', { count: delReq.ids.length })}
        confirmText={t('common.delete')}
        destructive
        onConfirm={() => void confirmIdDelete()}
      />
      {fdOpen ? (
        <FilterDeleteDialog
          initial={filters}
          preview={preview?.p ?? null}
          previewing={loading.previewing}
          deleting={loading.deleting}
          onClose={() => {
            setFdOpen(false)
            setPreview(null)
          }}
          onPreview={(f) => void runPreview(f)}
          onConfirm={(f) => void confirmFilterDelete(f)}
          onCriteriaChange={() => setPreview(null)}
        />
      ) : null}
      {active ? (
        <EventDetail event={active.event} loading={active.loading} onClose={() => setActive(null)} />
      ) : null}
    </div>
  )
}
