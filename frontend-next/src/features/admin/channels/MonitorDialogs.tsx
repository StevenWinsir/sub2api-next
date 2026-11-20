/** 渠道监控的对话框：新增 / 编辑、检测结果、历史趋势、请求模板管理。 */
import * as React from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { adminAPI } from '@/api/admin'
import type {
  APIMode,
  BodyOverrideMode,
  ChannelMonitor,
  CheckMode,
  CreateParams,
  Provider,
  RunNowResponse
} from '@/api/admin/channelMonitor'
import type { ChannelMonitorTemplate } from '@/api/admin/channelMonitorTemplate'
import { LazyTrendAreaChart } from '@/components/charts/LazyCharts'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { FormField } from '@/components/FormField'
import { NativeSelect } from '@/components/NativeSelect'
import { PasswordInput } from '@/components/PasswordInput'
import { StatusBadge } from '@/components/StatusBadge'
import { Button } from '@/components/ui/button'
import { Input, Textarea } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { AdminFormDialog } from '@/features/admin/common/AdminFormDialog'
import { numOrUndef, str } from '@/features/admin/common/fieldUtils'
import { notifySuccess } from '@/features/admin/common/notify'
import { useAdminAction } from '@/features/admin/common/useAdminAction'
import { t } from '@/i18n'
import { formatDateTime } from '@/utils/format'

export const PROVIDERS: Provider[] = [
  'openai',
  'anthropic',
  'gemini',
  'grok',
  'antigravity',
  'kimi',
  'zhipu',
  'deepseek',
  'minimax',
  'opencode_go'
]
const CHECK_MODES: CheckMode[] = ['probe', 'quota', 'quota_probe']
const BODY_MODES: BodyOverrideMode[] = ['off', 'merge', 'replace']

export const STATUS_TONE = {
  operational: 'success',
  degraded: 'warning',
  failed: 'error',
  error: 'error'
} as const

/** 解析 JSON 对象文本；空串返回 fallback；非对象返回 null 表示非法。 */
export function parseJsonObject<T extends Record<string, unknown>>(raw: string, fallback: T): T | null {
  if (!raw.trim()) return fallback
  try {
    const v: unknown = JSON.parse(raw)
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as T) : null
  } catch {
    return null
  }
}

export function MonitorFormDialog({
  monitor,
  onClose,
  onSaved
}: {
  monitor: ChannelMonitor | null
  onClose: () => void
  onSaved: () => void
}) {
  const { busy, run } = useAdminAction()
  const [name, setName] = React.useState(monitor?.name ?? '')
  const [provider, setProvider] = React.useState<Provider>(monitor?.provider ?? 'openai')
  const [apiMode, setApiMode] = React.useState<APIMode>(monitor?.api_mode ?? 'chat_completions')
  const [endpoint, setEndpoint] = React.useState(monitor?.endpoint ?? '')
  const [apiKey, setApiKey] = React.useState('')
  const [checkMode, setCheckMode] = React.useState<CheckMode>(monitor?.check_mode ?? 'probe')
  const [accountId, setAccountId] = React.useState(str(monitor?.account_id))
  const [primary, setPrimary] = React.useState(monitor?.primary_model ?? '')
  const [extra, setExtra] = React.useState((monitor?.extra_models ?? []).join('\n'))
  const [group, setGroup] = React.useState(monitor?.group_name ?? '')
  const [interval, setIntervalSeconds] = React.useState(str(monitor?.interval_seconds ?? 60))
  const [jitter, setJitter] = React.useState(str(monitor?.jitter_seconds ?? 0))
  const [enabled, setEnabled] = React.useState(monitor?.enabled ?? true)
  const [templateId, setTemplateId] = React.useState(str(monitor?.template_id))
  const [headers, setHeaders] = React.useState(JSON.stringify(monitor?.extra_headers ?? {}, null, 2))
  const [bodyMode, setBodyMode] = React.useState<BodyOverrideMode>(monitor?.body_override_mode ?? 'off')
  const [body, setBody] = React.useState(
    monitor?.body_override ? JSON.stringify(monitor.body_override, null, 2) : ''
  )
  const [error, setError] = React.useState('')
  const templates = useQuery({
    queryKey: ['admin', 'monitor-templates', provider],
    queryFn: () => adminAPI.channelMonitorTemplate.list({ provider })
  })
  const needsAccount = checkMode !== 'probe'

  const submit = async () => {
    if (!name.trim()) return setError(t('admin.channelMonitor.nameRequired'))
    if (!primary.trim() && checkMode !== 'quota')
      return setError(t('admin.channelMonitor.primaryModelRequired'))
    if (needsAccount && !numOrUndef(accountId))
      return setError(t('admin.channelMonitor.linkedAccountRequired'))
    const extraHeaders = parseJsonObject<Record<string, string>>(headers, {})
    if (!extraHeaders) return setError(t('admin.channelMonitor.advanced.headersParseError'))
    const bodyOverride = bodyMode === 'off' ? null : parseJsonObject<Record<string, unknown>>(body, {})
    if (bodyMode !== 'off' && !bodyOverride)
      return setError(t('admin.channelMonitor.advanced.bodyJsonObjectError'))
    setError('')
    const common: Partial<CreateParams> = {
      name: name.trim(),
      provider,
      ...(provider === 'openai' ? { api_mode: apiMode } : {}),
      endpoint: endpoint.trim(),
      check_mode: checkMode,
      primary_model: primary.trim(),
      extra_models: extra
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean),
      group_name: group.trim(),
      enabled,
      interval_seconds: numOrUndef(interval) ?? 60,
      jitter_seconds: numOrUndef(jitter) ?? 0,
      extra_headers: extraHeaders,
      body_override_mode: bodyMode,
      body_override: bodyOverride,
      account_id: needsAccount ? (numOrUndef(accountId) ?? null) : monitor?.account_id ? 0 : null
    }
    const ok = monitor
      ? await run(
          () =>
            adminAPI.channelMonitor.update(monitor.id, {
              ...common,
              ...(apiKey ? { api_key: apiKey } : { api_key: '' }),
              template_id: numOrUndef(templateId) ?? null,
              clear_template: !templateId && monitor.template_id !== null
            }),
          { success: t('admin.channelMonitor.updateSuccess') }
        )
      : await run(
          () =>
            adminAPI.channelMonitor.create({
              ...(common as CreateParams),
              api_key: apiKey,
              template_id: numOrUndef(templateId) ?? null
            }),
          { success: t('admin.channelMonitor.createSuccess') }
        )
    if (ok) onSaved()
  }

  return (
    <AdminFormDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={monitor ? t('admin.channelMonitor.editTitle') : t('admin.channelMonitor.createTitle')}
      onSubmit={submit}
      submitting={busy}
      size="xl"
    >
      {monitor?.api_key_decrypt_failed ? (
        <p className="rounded-md border border-warning/30 bg-warning/10 p-3 text-sm">
          {t('admin.channelMonitor.apiKeyDecryptFailed')}
        </p>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label={t('admin.channelMonitor.form.name')} required error={error}>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('admin.channelMonitor.form.namePlaceholder')}
          />
        </FormField>
        <FormField label={t('admin.channelMonitor.form.provider')}>
          <NativeSelect
            value={provider}
            disabled={!!monitor}
            onChange={(e) => {
              setProvider(e.target.value as Provider)
              setTemplateId('')
            }}
          >
            {PROVIDERS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        {provider === 'openai' ? (
          <FormField label={t('admin.channelMonitor.form.apiMode')}>
            <NativeSelect value={apiMode} onChange={(e) => setApiMode(e.target.value as APIMode)}>
              <option value="chat_completions">
                {t('admin.channelMonitor.form.apiModeChatCompletions')}
              </option>
              <option value="responses">{t('admin.channelMonitor.form.apiModeResponses')}</option>
            </NativeSelect>
          </FormField>
        ) : null}
        <FormField label={t('admin.channelMonitor.form.checkMode')}>
          <NativeSelect value={checkMode} onChange={(e) => setCheckMode(e.target.value as CheckMode)}>
            {CHECK_MODES.map((m) => (
              <option key={m} value={m}>
                {t(
                  `admin.channelMonitor.form.checkMode${m === 'probe' ? 'Probe' : m === 'quota' ? 'Quota' : 'QuotaProbe'}`
                )}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        {needsAccount ? (
          <FormField
            label={t('admin.channelMonitor.form.linkedAccount')}
            description={t('admin.channelMonitor.form.linkedAccountHint')}
          >
            <Input
              type="number"
              min={1}
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              placeholder={t('admin.channelMonitor.form.linkedAccountPlaceholder')}
            />
          </FormField>
        ) : null}
        <FormField label={t('admin.channelMonitor.form.endpoint')} className="sm:col-span-2">
          <Input
            value={endpoint}
            onChange={(e) => setEndpoint(e.target.value)}
            placeholder={t('admin.channelMonitor.form.endpointPlaceholder')}
          />
        </FormField>
        <FormField
          label={t('admin.channelMonitor.form.apiKey')}
          description={
            monitor
              ? `${monitor.api_key_masked} · ${t('admin.channelMonitor.form.apiKeyEditPlaceholder')}`
              : undefined
          }
          className="sm:col-span-2"
        >
          <PasswordInput
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            autoComplete="off"
            placeholder={t('admin.channelMonitor.form.apiKeyPlaceholder')}
          />
        </FormField>
        <FormField label={t('admin.channelMonitor.form.primaryModel')}>
          <Input
            value={primary}
            onChange={(e) => setPrimary(e.target.value)}
            placeholder={t('admin.channelMonitor.form.primaryModelPlaceholder')}
          />
        </FormField>
        <FormField label={t('admin.channelMonitor.form.groupName')}>
          <Input
            value={group}
            onChange={(e) => setGroup(e.target.value)}
            placeholder={t('admin.channelMonitor.form.groupNamePlaceholder')}
          />
        </FormField>
        <FormField label={t('admin.channelMonitor.form.extraModels')} className="sm:col-span-2">
          <Textarea
            rows={2}
            className="font-mono"
            value={extra}
            onChange={(e) => setExtra(e.target.value)}
            placeholder={t('admin.channelMonitor.form.extraModelsPlaceholder')}
          />
        </FormField>
        <FormField
          label={t('admin.channelMonitor.form.intervalSeconds')}
          description={t('admin.channelMonitor.form.intervalSecondsHint')}
        >
          <Input
            type="number"
            min={15}
            value={interval}
            onChange={(e) => setIntervalSeconds(e.target.value)}
          />
        </FormField>
        <FormField
          label={t('admin.channelMonitor.form.jitterSeconds')}
          description={t('admin.channelMonitor.form.jitterSecondsHint')}
        >
          <Input type="number" min={0} value={jitter} onChange={(e) => setJitter(e.target.value)} />
        </FormField>
        <FormField
          label={t('admin.channelMonitor.templateField.label')}
          description={t('admin.channelMonitor.templateField.applyHint')}
        >
          <NativeSelect value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
            <option value="">{t('admin.channelMonitor.templateField.none')}</option>
            {(templates.data?.items ?? []).map((tpl) => (
              <option key={tpl.id} value={tpl.id}>
                {tpl.name}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <label className="flex items-center gap-2 self-end pb-2 text-sm">
          <Switch checked={enabled} onCheckedChange={setEnabled} />
          {t('admin.channelMonitor.form.enabled')}
        </label>
        <FormField
          label={t('admin.channelMonitor.advanced.headers')}
          description={t('admin.channelMonitor.advanced.headersHint')}
          className="sm:col-span-2"
        >
          <Textarea
            rows={3}
            className="font-mono"
            value={headers}
            onChange={(e) => setHeaders(e.target.value)}
            spellCheck={false}
          />
        </FormField>
        <FormField label={t('admin.channelMonitor.advanced.bodyMode')}>
          <NativeSelect value={bodyMode} onChange={(e) => setBodyMode(e.target.value as BodyOverrideMode)}>
            {BODY_MODES.map((m) => (
              <option key={m} value={m}>
                {t(
                  `admin.channelMonitor.advanced.bodyMode${m === 'off' ? 'Off' : m === 'merge' ? 'Merge' : 'Replace'}`
                )}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        {bodyMode !== 'off' ? (
          <FormField label={t('admin.channelMonitor.advanced.bodyJson')} className="sm:col-span-2">
            <Textarea
              rows={5}
              className="font-mono"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              spellCheck={false}
            />
          </FormField>
        ) : null}
      </div>
    </AdminFormDialog>
  )
}

export function RunResultDialog({
  monitor,
  result,
  onClose
}: {
  monitor: ChannelMonitor
  result: RunNowResponse
  onClose: () => void
}) {
  return (
    <AdminFormDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={t('admin.channelMonitor.runResultTitle')}
      description={monitor.name}
    >
      <ul className="divide-y rounded-md border text-sm">
        {result.results.map((r) => (
          <li key={r.model} className="flex items-start justify-between gap-3 px-3 py-2">
            <div className="min-w-0">
              <p className="truncate font-mono text-xs">{r.model}</p>
              {r.message ? (
                <p className="max-w-80 truncate text-xs text-muted-foreground" title={r.message}>
                  {r.message}
                </p>
              ) : null}
            </div>
            <div className="text-right">
              <StatusBadge status={STATUS_TONE[r.status]}>{r.status}</StatusBadge>
              <p className="tabular text-xs text-muted-foreground">
                {r.latency_ms != null ? `${r.latency_ms} ms` : '—'}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </AdminFormDialog>
  )
}

export function HistoryDialog({ monitor, onClose }: { monitor: ChannelMonitor; onClose: () => void }) {
  const [model, setModel] = React.useState('')
  const q = useQuery({
    queryKey: ['admin', 'channel-monitor', monitor.id, 'history', model],
    queryFn: () => adminAPI.channelMonitor.listHistory(monitor.id, { model: model || undefined, limit: 100 })
  })
  const items = q.data?.items ?? []
  const series = [...items]
    .reverse()
    .map((h) => ({ time: formatDateTime(h.checked_at).slice(5, 16), latency: h.latency_ms ?? 0 }))
  const models = [monitor.primary_model, ...monitor.extra_models].filter(Boolean)
  return (
    <AdminFormDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={t('adminUi.monitor.history')}
      description={monitor.name}
      size="xl"
    >
      <div className="w-60">
        <NativeSelect
          value={model}
          aria-label={t('admin.channelMonitor.columns.primaryModel')}
          onChange={(e) => setModel(e.target.value)}
        >
          <option value="">{t('common.all')}</option>
          {models.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </NativeSelect>
      </div>
      {series.length > 0 ? (
        <LazyTrendAreaChart
          data={series}
          xKey="time"
          series={[{ key: 'latency', label: t('admin.channelMonitor.columns.latency') }]}
          height={200}
        />
      ) : null}
      <ul className="max-h-60 divide-y overflow-y-auto rounded-md border text-sm">
        {items.map((h) => (
          <li key={h.id} className="flex items-center justify-between gap-3 px-3 py-1.5">
            <span className="text-xs text-muted-foreground">{formatDateTime(h.checked_at)}</span>
            <span className="truncate font-mono text-xs">{h.model}</span>
            <span className="flex items-center gap-2">
              <span className="tabular text-xs">{h.latency_ms != null ? `${h.latency_ms} ms` : '—'}</span>
              <StatusBadge status={STATUS_TONE[h.status]}>{h.status}</StatusBadge>
            </span>
          </li>
        ))}
      </ul>
    </AdminFormDialog>
  )
}

function TemplateFormDialog({
  template,
  onClose,
  onSaved
}: {
  template: ChannelMonitorTemplate | null
  onClose: () => void
  onSaved: () => void
}) {
  const { busy, run } = useAdminAction()
  const [name, setName] = React.useState(template?.name ?? '')
  const [provider, setProvider] = React.useState<Provider>(template?.provider ?? 'openai')
  const [description, setDescription] = React.useState(template?.description ?? '')
  const [headers, setHeaders] = React.useState(JSON.stringify(template?.extra_headers ?? {}, null, 2))
  const [bodyMode, setBodyMode] = React.useState<BodyOverrideMode>(template?.body_override_mode ?? 'off')
  const [body, setBody] = React.useState(
    template?.body_override ? JSON.stringify(template.body_override, null, 2) : ''
  )
  const [error, setError] = React.useState('')
  const submit = async () => {
    if (!name.trim()) return setError(t('admin.channelMonitor.template.missingName'))
    const extraHeaders = parseJsonObject<Record<string, string>>(headers, {})
    const bodyOverride = bodyMode === 'off' ? null : parseJsonObject<Record<string, unknown>>(body, {})
    if (!extraHeaders || (bodyMode !== 'off' && !bodyOverride))
      return setError(t('admin.channelMonitor.advanced.bodyJsonObjectError'))
    setError('')
    const payload = {
      name: name.trim(),
      description,
      extra_headers: extraHeaders,
      body_override_mode: bodyMode,
      body_override: bodyOverride
    }
    const ok = template
      ? await run(() => adminAPI.channelMonitorTemplate.update(template.id, payload), {
          success: t('admin.channelMonitor.template.updateSuccess')
        })
      : await run(() => adminAPI.channelMonitorTemplate.create({ ...payload, provider }), {
          success: t('admin.channelMonitor.template.createSuccess')
        })
    if (ok !== undefined) onSaved()
  }
  return (
    <AdminFormDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={template ? t('common.edit') : t('admin.channelMonitor.template.createButton')}
      onSubmit={submit}
      submitting={busy}
    >
      <FormField label={t('admin.channelMonitor.form.name')} required error={error}>
        <Input value={name} onChange={(e) => setName(e.target.value)} />
      </FormField>
      <FormField label={t('admin.channelMonitor.form.provider')}>
        <NativeSelect
          value={provider}
          disabled={!!template}
          onChange={(e) => setProvider(e.target.value as Provider)}
        >
          {PROVIDERS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </NativeSelect>
      </FormField>
      <FormField label={t('admin.channelMonitor.form.groupName')}>
        <Input value={description} onChange={(e) => setDescription(e.target.value)} />
      </FormField>
      <FormField label={t('admin.channelMonitor.advanced.headers')}>
        <Textarea
          rows={3}
          className="font-mono"
          value={headers}
          onChange={(e) => setHeaders(e.target.value)}
          spellCheck={false}
        />
      </FormField>
      <FormField label={t('admin.channelMonitor.advanced.bodyMode')}>
        <NativeSelect value={bodyMode} onChange={(e) => setBodyMode(e.target.value as BodyOverrideMode)}>
          {BODY_MODES.map((m) => (
            <option key={m} value={m}>
              {t(
                `admin.channelMonitor.advanced.bodyMode${m === 'off' ? 'Off' : m === 'merge' ? 'Merge' : 'Replace'}`
              )}
            </option>
          ))}
        </NativeSelect>
      </FormField>
      {bodyMode !== 'off' ? (
        <FormField label={t('admin.channelMonitor.advanced.bodyJson')}>
          <Textarea
            rows={5}
            className="font-mono"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            spellCheck={false}
          />
        </FormField>
      ) : null}
    </AdminFormDialog>
  )
}

export function TemplateManagerDialog({
  onClose,
  onApplied
}: {
  onClose: () => void
  onApplied: () => void
}) {
  const qc = useQueryClient()
  const { busy, run } = useAdminAction()
  const [editing, setEditing] = React.useState<ChannelMonitorTemplate | null | 'new'>(null)
  const [deleting, setDeleting] = React.useState<ChannelMonitorTemplate | null>(null)
  const q = useQuery({
    queryKey: ['admin', 'monitor-templates', 'all'],
    queryFn: () => adminAPI.channelMonitorTemplate.list()
  })
  const refresh = () => qc.invalidateQueries({ queryKey: ['admin', 'monitor-templates'] })

  const apply = async (tpl: ChannelMonitorTemplate) => {
    const assoc = await run(() => adminAPI.channelMonitorTemplate.listAssociatedMonitors(tpl.id), {})
    if (!assoc) return
    const res = await run(
      () =>
        adminAPI.channelMonitorTemplate.apply(
          tpl.id,
          assoc.items.map((m) => m.id)
        ),
      {}
    )
    if (res) {
      notifySuccess(t('admin.channelMonitor.template.applySuccess', { n: res.affected }))
      onApplied()
    }
  }

  return (
    <>
      <AdminFormDialog
        open
        onOpenChange={(o) => !o && onClose()}
        title={t('admin.channelMonitor.template.managerTitle')}
        size="lg"
      >
        <div>
          <Button type="button" size="sm" onClick={() => setEditing('new')}>
            {t('admin.channelMonitor.template.createButton')}
          </Button>
        </div>
        {(q.data?.items ?? []).length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {t('admin.channelMonitor.template.emptyState')}
          </p>
        ) : (
          <ul className="divide-y rounded-md border text-sm">
            {(q.data?.items ?? []).map((tpl) => (
              <li key={tpl.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate font-medium">{tpl.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {tpl.provider} ·{' '}
                    {t('admin.channelMonitor.template.associatedCount', { n: tpl.associated_monitors })}
                  </p>
                </div>
                <div className="flex gap-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    loading={busy}
                    onClick={() => void apply(tpl)}
                  >
                    {t('admin.channelMonitor.template.applyButton')}
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(tpl)}>
                    {t('common.edit')}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="text-destructive"
                    onClick={() => setDeleting(tpl)}
                  >
                    {t('common.delete')}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </AdminFormDialog>
      {editing ? (
        <TemplateFormDialog
          template={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            void refresh()
          }}
        />
      ) : null}
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={t('common.delete')}
        description={t('admin.channelMonitor.template.deleteConfirm', { name: deleting?.name ?? '' })}
        destructive
        confirmText={t('common.delete')}
        loading={busy}
        onConfirm={async () => {
          if (!deleting) return
          const tpl = deleting
          const ok = await run(() => adminAPI.channelMonitorTemplate.del(tpl.id).then(() => true), {
            success: t('admin.channelMonitor.template.deleteSuccess')
          })
          if (ok) {
            setDeleting(null)
            void refresh()
          }
        }}
      />
    </>
  )
}
