/** 系统设置·网关：独立保存的小型配置卡（各自 GET/PUT）、Beta 策略、OpenAI Fast 策略、联网搜索。 */
import * as React from 'react'
import { Eye, EyeOff, Plus, Trash2 } from 'lucide-react'
import { adminAPI } from '@/api/admin'
import type {
  BetaPolicyRule,
  RectifierSettings,
  WebSearchEmulationConfig,
  WebSearchProviderConfig,
  WebSearchTestResult
} from '@/api/admin/settings'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { NativeSelect } from '@/components/NativeSelect'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { notifyError, notifySuccess } from '@/features/admin/common/notify'
import { copyText } from '@/hooks/useClipboard'
import { t } from '@/i18n'
import type { Proxy } from '@/types'
import { AddButton, FieldControl, LabeledField, SwitchRow, TagInput } from './settingsUi'
import { parseUserIdList, type OpenAIFastRule, type SettingsAux } from './settingsModel'
import type { FieldSpec } from './settingsSpec'

const S = (k: string, p?: Record<string, unknown>) => t(`admin.settings.${k}`, p)

interface SvcField {
  name: string
  kind: FieldSpec['kind']
  label: string
  hint?: string
  options?: { value: string; label: string }[]
}

/** 独立保存的小型配置卡：GET 填充、PUT 保存。加载失败静默回退到默认值（与 Vue 版一致）。 */
export function ServiceCard<T extends object>({
  defaults,
  load,
  save,
  fields,
  savedKey,
  failedKey,
  normalize,
  extra
}: {
  defaults: T
  load: () => Promise<T>
  save: (v: T) => Promise<T>
  fields: SvcField[]
  savedKey: string
  failedKey: string
  normalize?: (v: T) => T
  extra?: (v: T, set: (p: Partial<T>) => void) => React.ReactNode
}) {
  const [value, setValue] = React.useState<T>(defaults)
  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)
  React.useEffect(() => {
    let alive = true
    // 让出一个微任务，避免在 effect 中同步 setState
    Promise.resolve()
      .then(() => load())
      .then((v) => alive && setValue(normalize ? normalize({ ...defaults, ...v }) : { ...defaults, ...v }))
      .catch(() => undefined)
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const set = (p: Partial<T>) => setValue((v) => ({ ...v, ...p }))
  const doSave = async () => {
    setSaving(true)
    try {
      const updated = await save(value)
      setValue(normalize ? normalize({ ...value, ...updated }) : { ...value, ...updated })
      notifySuccess(t(savedKey))
    } catch (e) {
      notifyError(e, t(failedKey))
    } finally {
      setSaving(false)
    }
  }
  if (loading) return <Skeleton className="h-24" />
  const rec = value as Record<string, unknown>
  return (
    <div className="grid gap-4">
      {fields.map((f) => (
        <FieldControl
          key={f.name}
          spec={{ name: f.name, kind: f.kind, label: f.label, hint: f.hint, options: f.options }}
          value={rec[f.name]}
          onChange={(v) => set({ [f.name]: v } as Partial<T>)}
        />
      ))}
      {extra?.(value, set)}
      <Button className="justify-self-start" loading={saving} onClick={() => void doSave()}>
        {t('common.save')}
      </Button>
    </div>
  )
}

const sf = (
  name: string,
  kind: FieldSpec['kind'],
  group: string,
  label: string,
  hint?: string,
  options?: SvcField['options']
): SvcField => ({
  name,
  kind,
  label: `admin.settings.${group}.${label}`,
  hint: hint ? `admin.settings.${group}.${hint}` : undefined,
  options
})

export function OverloadCooldownCard() {
  return (
    <ServiceCard
      defaults={{ enabled: true, cooldown_minutes: 10 }}
      load={() => adminAPI.settings.getOverloadCooldownSettings()}
      save={(v) => adminAPI.settings.updateOverloadCooldownSettings(v)}
      savedKey="admin.settings.overloadCooldown.saved"
      failedKey="admin.settings.overloadCooldown.saveFailed"
      fields={[
        sf('enabled', 'bool', 'overloadCooldown', 'enabled', 'enabledHint'),
        sf('cooldown_minutes', 'number', 'overloadCooldown', 'cooldownMinutes', 'cooldownMinutesHint')
      ]}
    />
  )
}
export function RateLimit429Card() {
  return (
    <ServiceCard
      defaults={{ enabled: true, cooldown_seconds: 5 }}
      load={() => adminAPI.settings.getRateLimit429CooldownSettings()}
      save={(v) => adminAPI.settings.updateRateLimit429CooldownSettings(v)}
      savedKey="admin.settings.rateLimit429Cooldown.saved"
      failedKey="admin.settings.rateLimit429Cooldown.saveFailed"
      fields={[
        sf('enabled', 'bool', 'rateLimit429Cooldown', 'enabled', 'enabledHint'),
        sf('cooldown_seconds', 'number', 'rateLimit429Cooldown', 'cooldownSeconds', 'cooldownSecondsHint')
      ]}
    />
  )
}
export function PanelRateLimitCard() {
  return (
    <ServiceCard
      defaults={{ enabled: true, user_rpm: 240, heavy_rpm: 60, exempt_admin: true, public_ip_rpm: 300 }}
      load={() => adminAPI.settings.getPanelRateLimitSettings()}
      save={(v) => adminAPI.settings.updatePanelRateLimitSettings(v)}
      savedKey="admin.settings.panelRateLimit.saved"
      failedKey="admin.settings.panelRateLimit.saveFailed"
      fields={[
        sf('enabled', 'bool', 'panelRateLimit', 'enabled', 'enabledHint'),
        sf('user_rpm', 'number', 'panelRateLimit', 'userRpm', 'userRpmHint'),
        sf('heavy_rpm', 'number', 'panelRateLimit', 'heavyRpm', 'heavyRpmHint'),
        sf('public_ip_rpm', 'number', 'panelRateLimit', 'publicIpRpm', 'publicIpRpmHint'),
        sf('exempt_admin', 'bool', 'panelRateLimit', 'exemptAdmin', 'exemptAdminHint')
      ]}
    />
  )
}
export function StreamTimeoutCard() {
  return (
    <ServiceCard
      defaults={{
        enabled: true,
        action: 'temp_unsched' as 'temp_unsched' | 'error' | 'none',
        temp_unsched_minutes: 5,
        threshold_count: 3,
        threshold_window_minutes: 10
      }}
      load={() => adminAPI.settings.getStreamTimeoutSettings()}
      save={(v) => adminAPI.settings.updateStreamTimeoutSettings(v)}
      savedKey="admin.settings.streamTimeout.saved"
      failedKey="admin.settings.streamTimeout.saveFailed"
      fields={[
        sf('enabled', 'bool', 'streamTimeout', 'enabled', 'enabledHint'),
        sf('action', 'select', 'streamTimeout', 'action', 'actionHint', [
          { value: 'temp_unsched', label: 'admin.settings.streamTimeout.actionTempUnsched' },
          { value: 'error', label: 'admin.settings.streamTimeout.actionError' },
          { value: 'none', label: 'admin.settings.streamTimeout.actionNone' }
        ]),
        sf('temp_unsched_minutes', 'number', 'streamTimeout', 'tempUnschedMinutes', 'tempUnschedMinutesHint'),
        sf('threshold_count', 'number', 'streamTimeout', 'thresholdCount', 'thresholdCountHint'),
        sf(
          'threshold_window_minutes',
          'number',
          'streamTimeout',
          'thresholdWindowMinutes',
          'thresholdWindowMinutesHint'
        )
      ]}
    />
  )
}
export function RectifierCard() {
  return (
    <ServiceCard<RectifierSettings>
      defaults={{
        enabled: true,
        thinking_signature_enabled: true,
        thinking_budget_enabled: true,
        apikey_signature_enabled: false,
        apikey_signature_patterns: []
      }}
      load={() => adminAPI.settings.getRectifierSettings()}
      save={(v) =>
        adminAPI.settings.updateRectifierSettings({
          ...v,
          apikey_signature_patterns: v.apikey_signature_patterns.filter((p) => p.trim() !== '')
        })
      }
      normalize={(v) => ({
        ...v,
        apikey_signature_patterns: Array.isArray(v.apikey_signature_patterns)
          ? v.apikey_signature_patterns
          : []
      })}
      savedKey="admin.settings.rectifier.saved"
      failedKey="admin.settings.rectifier.saveFailed"
      fields={[
        sf('enabled', 'bool', 'rectifier', 'enabled', 'enabledHint'),
        sf('thinking_signature_enabled', 'bool', 'rectifier', 'thinkingSignature', 'thinkingSignatureHint'),
        sf('thinking_budget_enabled', 'bool', 'rectifier', 'thinkingBudget', 'thinkingBudgetHint'),
        sf('apikey_signature_enabled', 'bool', 'rectifier', 'apikeySignature', 'apikeySignatureHint')
      ]}
      extra={(v, set) =>
        v.apikey_signature_enabled ? (
          <LabeledField label={S('rectifier.apikeyPatterns')} hint={S('rectifier.apikeyPatternsHint')}>
            <div className="grid gap-2">
              {v.apikey_signature_patterns.map((p, i) => (
                <div key={i} className="flex gap-2">
                  <Input
                    className="font-mono text-[13px]"
                    placeholder={S('rectifier.apikeyPatternPlaceholder')}
                    value={p}
                    onChange={(e) =>
                      set({
                        apikey_signature_patterns: v.apikey_signature_patterns.map((x, j) =>
                          j === i ? e.target.value : x
                        )
                      })
                    }
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={t('common.remove')}
                    onClick={() =>
                      set({
                        apikey_signature_patterns: v.apikey_signature_patterns.filter((_, j) => j !== i)
                      })
                    }
                  >
                    <Trash2 aria-hidden />
                  </Button>
                </div>
              ))}
              <AddButton
                onClick={() => set({ apikey_signature_patterns: [...v.apikey_signature_patterns, ''] })}
              >
                <Plus aria-hidden />
                {S('rectifier.addPattern')}
              </AddButton>
            </div>
          </LabeledField>
        ) : null
      }
    />
  )
}
export function BillingProbeCard() {
  return (
    <ServiceCard
      defaults={{ enabled: true, interval_minutes: 30 }}
      load={() => adminAPI.accounts.getUpstreamBillingProbeSettings()}
      save={(v) => adminAPI.accounts.updateUpstreamBillingProbeSettings(v)}
      savedKey="admin.settings.upstreamBillingProbe.saved"
      failedKey="admin.settings.upstreamBillingProbe.saveFailed"
      fields={[
        sf('enabled', 'bool', 'upstreamBillingProbe', 'enabled', 'enabledHint'),
        sf('interval_minutes', 'number', 'upstreamBillingProbe', 'intervalMinutes', 'intervalHint')
      ]}
    />
  )
}
export function OllamaUsageCard() {
  return (
    <ServiceCard
      defaults={{ enabled: false, interval_minutes: 60, debounce_minutes: 1 }}
      load={() => adminAPI.accounts.getOllamaCloudUsageSettings()}
      save={(v) => adminAPI.accounts.updateOllamaCloudUsageSettings(v)}
      savedKey="admin.settings.ollamaCloudUsage.saved"
      failedKey="admin.settings.ollamaCloudUsage.saveFailed"
      fields={[
        sf('enabled', 'bool', 'ollamaCloudUsage', 'enabled', 'enabledHint'),
        sf('interval_minutes', 'number', 'ollamaCloudUsage', 'intervalMinutes', 'intervalHint'),
        sf('debounce_minutes', 'number', 'ollamaCloudUsage', 'debounceMinutes', 'debounceHint')
      ]}
    />
  )
}
export function OpenCodeUsageCard() {
  return (
    <ServiceCard
      defaults={{ enabled: false, interval_minutes: 15, debounce_minutes: 1 }}
      load={() => adminAPI.accounts.getOpenCodeGoUsageSettings()}
      save={(v) => adminAPI.accounts.updateOpenCodeGoUsageSettings(v)}
      savedKey="admin.settings.opencodeGoUsage.saved"
      failedKey="admin.settings.opencodeGoUsage.saveFailed"
      fields={[
        sf('enabled', 'bool', 'opencodeGoUsage', 'enabled', 'enabledHint'),
        sf('interval_minutes', 'number', 'opencodeGoUsage', 'intervalMinutes', 'intervalHint'),
        sf('debounce_minutes', 'number', 'opencodeGoUsage', 'debounceMinutes', 'debounceHint')
      ]}
    />
  )
}

/* ------------------------------ Beta 策略 ------------------------------ */
export const BETA_ACTIONS = ['pass', 'filter', 'block'] as const
export const BETA_SCOPES = ['all', 'oauth', 'apikey', 'bedrock'] as const
const scopeKey = (s: string) =>
  s === 'apikey'
    ? 'scopeAPIKey'
    : s === 'oauth'
      ? 'scopeOAuth'
      : s === 'bedrock'
        ? 'scopeBedrock'
        : 'scopeAll'

/** 保存前清洗 Beta 规则：去空白白名单项；仅当存在白名单时才带回退动作（与 Vue 版一致）。 */
export function cleanBetaRules(rules: BetaPolicyRule[]): BetaPolicyRule[] {
  return rules.map((r) => {
    const wl = r.model_whitelist?.filter((p) => p.trim() !== '')
    const has = wl && wl.length > 0
    return {
      beta_token: r.beta_token,
      action: r.action,
      scope: r.scope,
      error_message: r.error_message,
      model_whitelist: has ? wl : undefined,
      fallback_action: has ? r.fallback_action || 'pass' : undefined,
      fallback_error_message: has && r.fallback_action === 'block' ? r.fallback_error_message : undefined
    }
  })
}

function PatternList({
  value,
  onChange,
  placeholder,
  addLabel
}: {
  value: string[]
  onChange: (v: string[]) => void
  placeholder: string
  addLabel: string
}) {
  return (
    <div className="grid gap-1.5">
      {value.map((p, i) => (
        <div key={i} className="flex gap-2">
          <Input
            className="font-mono text-[13px]"
            placeholder={placeholder}
            value={p}
            onChange={(e) => onChange(value.map((x, j) => (j === i ? e.target.value : x)))}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={t('common.remove')}
            onClick={() => onChange(value.filter((_, j) => j !== i))}
          >
            <Trash2 aria-hidden />
          </Button>
        </div>
      ))}
      <AddButton onClick={() => onChange([...value, ''])}>
        <Plus aria-hidden />
        {addLabel}
      </AddButton>
    </div>
  )
}

export function BetaPolicyCard() {
  const [rules, setRules] = React.useState<BetaPolicyRule[]>([])
  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)
  React.useEffect(() => {
    let alive = true
    Promise.resolve()
      .then(() => adminAPI.settings.getBetaPolicySettings())
      .then((s) => alive && setRules(s.rules))
      .catch(() => undefined)
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [])
  const upd = (i: number, p: Partial<BetaPolicyRule>) =>
    setRules((rs) => rs.map((r, j) => (j === i ? { ...r, ...p } : r)))
  const save = async () => {
    setSaving(true)
    try {
      const u = await adminAPI.settings.updateBetaPolicySettings({ rules: cleanBetaRules(rules) })
      setRules(u.rules)
      notifySuccess(S('betaPolicy.saved'))
    } catch (e) {
      notifyError(e, S('betaPolicy.saveFailed'))
    } finally {
      setSaving(false)
    }
  }
  if (loading) return <Skeleton className="h-24" />
  return (
    <div className="grid gap-4">
      {rules.map((r, i) => (
        <div key={i} className="grid gap-3 rounded-md border p-4">
          <div className="flex items-center justify-between gap-2">
            <code className="text-sm font-semibold">{r.beta_token}</code>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <LabeledField label={S('betaPolicy.action')}>
              <NativeSelect
                value={r.action}
                onChange={(e) => upd(i, { action: e.target.value as BetaPolicyRule['action'] })}
              >
                {BETA_ACTIONS.map((a) => (
                  <option key={a} value={a}>
                    {S(`betaPolicy.action${a[0].toUpperCase()}${a.slice(1)}`)}
                  </option>
                ))}
              </NativeSelect>
            </LabeledField>
            <LabeledField label={S('betaPolicy.scope')}>
              <NativeSelect
                value={r.scope}
                onChange={(e) => upd(i, { scope: e.target.value as BetaPolicyRule['scope'] })}
              >
                {BETA_SCOPES.map((s) => (
                  <option key={s} value={s}>
                    {S(`betaPolicy.${scopeKey(s)}`)}
                  </option>
                ))}
              </NativeSelect>
            </LabeledField>
          </div>
          {r.action === 'block' ? (
            <LabeledField label={S('betaPolicy.errorMessage')} hint={S('betaPolicy.errorMessageHint')}>
              <Input
                placeholder={S('betaPolicy.errorMessagePlaceholder')}
                value={r.error_message ?? ''}
                onChange={(e) => upd(i, { error_message: e.target.value })}
              />
            </LabeledField>
          ) : null}
          <LabeledField label={S('betaPolicy.modelWhitelist')} hint={S('betaPolicy.modelWhitelistHint')}>
            <PatternList
              value={r.model_whitelist ?? []}
              onChange={(v) => upd(i, { model_whitelist: v })}
              placeholder={S('betaPolicy.modelPatternPlaceholder')}
              addLabel={S('betaPolicy.addModelPattern')}
            />
          </LabeledField>
          {(r.model_whitelist ?? []).some((p) => p.trim()) ? (
            <LabeledField label={S('betaPolicy.fallbackAction')} hint={S('betaPolicy.fallbackActionHint')}>
              <NativeSelect
                value={r.fallback_action ?? 'pass'}
                onChange={(e) =>
                  upd(i, { fallback_action: e.target.value as BetaPolicyRule['fallback_action'] })
                }
              >
                {BETA_ACTIONS.map((a) => (
                  <option key={a} value={a}>
                    {S(`betaPolicy.action${a[0].toUpperCase()}${a.slice(1)}`)}
                  </option>
                ))}
              </NativeSelect>
            </LabeledField>
          ) : null}
          {(r.model_whitelist ?? []).some((p) => p.trim()) && r.fallback_action === 'block' ? (
            <Input
              placeholder={S('betaPolicy.fallbackErrorMessagePlaceholder')}
              value={r.fallback_error_message ?? ''}
              onChange={(e) => upd(i, { fallback_error_message: e.target.value })}
            />
          ) : null}
        </div>
      ))}
      <Button className="justify-self-start" loading={saving} onClick={() => void save()}>
        {t('common.save')}
      </Button>
    </div>
  )
}

/* ------------------------------ OpenAI Fast 策略（随主保存） ------------------------------ */
const FAST_TIERS = ['all', 'missing', 'priority', 'ultrafast', 'flex'] as const
const FAST_ACTIONS = ['pass', 'filter', 'force_priority', 'block'] as const
const tierKey = (x: string) => `tier${x[0].toUpperCase()}${x.slice(1)}`
const actionKey = (x: string) =>
  x === 'force_priority' ? 'actionForcePriority' : `action${x[0].toUpperCase()}${x.slice(1)}`

export function OpenAIFastPolicyBlock({
  aux,
  patchAux
}: {
  aux: SettingsAux
  patchAux: (p: Partial<SettingsAux>) => void
}) {
  const rules = aux.openaiFastRules
  const set = (r: OpenAIFastRule[]) => patchAux({ openaiFastRules: r })
  const upd = (i: number, p: Partial<OpenAIFastRule>) =>
    set(rules.map((r, j) => (j === i ? { ...r, ...p } : r)))
  if (!aux.openaiFastLoaded)
    return <p className="text-sm text-muted-foreground">{S('openaiFastPolicy.saveHint')}</p>
  return (
    <div className="grid gap-4">
      <p className="text-xs text-muted-foreground">{S('openaiFastPolicy.saveHint')}</p>
      {rules.length === 0 ? (
        <p className="text-sm text-muted-foreground">{S('openaiFastPolicy.empty')}</p>
      ) : null}
      {rules.map((r, i) => {
        const wl = r.model_whitelist ?? []
        return (
          <div key={i} className="grid gap-3 rounded-md border p-4">
            <div className="flex items-center justify-between">
              <b className="text-sm">{S('openaiFastPolicy.ruleHeader', { n: i + 1 })}</b>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => set(rules.filter((_, j) => j !== i))}
              >
                {S('openaiFastPolicy.removeRule')}
              </Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <LabeledField label={S('openaiFastPolicy.serviceTier')}>
                <NativeSelect
                  value={r.service_tier}
                  onChange={(e) => upd(i, { service_tier: e.target.value })}
                >
                  {FAST_TIERS.map((x) => (
                    <option key={x} value={x}>
                      {S(`openaiFastPolicy.${tierKey(x)}`)}
                    </option>
                  ))}
                </NativeSelect>
              </LabeledField>
              <LabeledField label={S('openaiFastPolicy.action')}>
                <NativeSelect value={r.action} onChange={(e) => upd(i, { action: e.target.value })}>
                  {FAST_ACTIONS.map((x) => (
                    <option key={x} value={x}>
                      {S(`openaiFastPolicy.${actionKey(x)}`)}
                    </option>
                  ))}
                </NativeSelect>
              </LabeledField>
              <LabeledField label={S('openaiFastPolicy.scope')}>
                <NativeSelect value={r.scope} onChange={(e) => upd(i, { scope: e.target.value })}>
                  {BETA_SCOPES.map((x) => (
                    <option key={x} value={x}>
                      {S(`openaiFastPolicy.${scopeKey(x)}`)}
                    </option>
                  ))}
                </NativeSelect>
              </LabeledField>
            </div>
            <LabeledField label={S('openaiFastPolicy.userIds')} hint={S('openaiFastPolicy.userIdsHint')}>
              <TagInput
                tags={(r.user_ids ?? []).map(String)}
                mono
                removeLabel={S('openaiFastPolicy.removeUser')}
                placeholder={S('openaiFastPolicy.userSearchPlaceholder')}
                onAdd={(raw) =>
                  upd(i, { user_ids: parseUserIdList(`${(r.user_ids ?? []).join(',')},${raw}`) })
                }
                onRemove={(tag) => upd(i, { user_ids: (r.user_ids ?? []).filter((x) => String(x) !== tag) })}
              />
            </LabeledField>
            {r.action === 'block' ? (
              <LabeledField
                label={S('openaiFastPolicy.errorMessage')}
                hint={S('openaiFastPolicy.errorMessageHint')}
              >
                <Input
                  placeholder={S('openaiFastPolicy.errorMessagePlaceholder')}
                  value={r.error_message ?? ''}
                  onChange={(e) => upd(i, { error_message: e.target.value })}
                />
              </LabeledField>
            ) : null}
            <LabeledField
              label={S('openaiFastPolicy.modelWhitelist')}
              hint={S('openaiFastPolicy.modelWhitelistHint')}
            >
              <PatternList
                value={wl}
                onChange={(v) => upd(i, { model_whitelist: v })}
                placeholder={S('openaiFastPolicy.modelPatternPlaceholder')}
                addLabel={S('openaiFastPolicy.addModelPattern')}
              />
            </LabeledField>
            {wl.some((p) => p.trim()) ? (
              <LabeledField
                label={S('openaiFastPolicy.fallbackAction')}
                hint={S('openaiFastPolicy.fallbackActionHint')}
              >
                <NativeSelect
                  value={r.fallback_action ?? 'pass'}
                  onChange={(e) => upd(i, { fallback_action: e.target.value })}
                >
                  {FAST_ACTIONS.map((x) => (
                    <option key={x} value={x}>
                      {S(`openaiFastPolicy.${actionKey(x)}`)}
                    </option>
                  ))}
                </NativeSelect>
              </LabeledField>
            ) : null}
            {wl.some((p) => p.trim()) && r.fallback_action === 'block' ? (
              <Input
                placeholder={S('openaiFastPolicy.fallbackErrorMessagePlaceholder')}
                value={r.fallback_error_message ?? ''}
                onChange={(e) => upd(i, { fallback_error_message: e.target.value })}
              />
            ) : null}
          </div>
        )
      })}
      <AddButton
        onClick={() =>
          set([
            ...rules,
            {
              service_tier: 'priority',
              action: 'filter',
              scope: 'all',
              user_ids: [],
              error_message: '',
              model_whitelist: [],
              fallback_action: 'pass',
              fallback_error_message: ''
            }
          ])
        }
      >
        <Plus aria-hidden />
        {S('openaiFastPolicy.addRule')}
      </AddButton>
    </div>
  )
}

/* ------------------------------ 联网搜索（随主保存） ------------------------------ */
export const DEFAULT_WEB_SEARCH_QUOTA_LIMIT = 1000
export const formatSubscribedAt = (ts: number | null): string => {
  if (!ts) return ''
  const d = new Date(ts * 1000)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}
export const parseSubscribedAt = (s: string): number | null =>
  s ? Math.floor(new Date(`${s}T00:00:00Z`).getTime() / 1000) : null

/** 提交前整理：额度 ≤0 / 空 → null；返回错误键表示校验失败。 */
export function prepareWebSearchPayload(
  c: WebSearchEmulationConfig
): { ok: true; config: WebSearchEmulationConfig } | { ok: false } {
  for (const p of c.providers) {
    const raw = p.quota_limit
    if (raw != null && Number(raw) !== 0 && Number(raw) < 1) return { ok: false }
  }
  return {
    ok: true,
    config: {
      enabled: c.enabled,
      providers: c.providers.map((p) => ({
        ...p,
        quota_limit: Number(p.quota_limit) > 0 ? Number(p.quota_limit) : null
      }))
    }
  }
}

export function WebSearchBlock({
  config,
  onChange,
  proxies
}: {
  config: WebSearchEmulationConfig
  onChange: (c: WebSearchEmulationConfig) => void
  proxies: Proxy[]
}) {
  const [visible, setVisible] = React.useState<Record<number, boolean>>({})
  const [query, setQuery] = React.useState('')
  const [testing, setTesting] = React.useState(false)
  const [result, setResult] = React.useState<WebSearchTestResult | null>(null)
  const [resetIdx, setResetIdx] = React.useState<number | null>(null)
  const upd = (i: number, p: Partial<WebSearchProviderConfig>) =>
    onChange({ ...config, providers: config.providers.map((x, j) => (j === i ? { ...x, ...p } : x)) })
  const runTest = async () => {
    setTesting(true)
    setResult(null)
    try {
      setResult(
        await adminAPI.settings.testWebSearchEmulation(
          query.trim() || S('webSearchEmulation.testDefaultQuery')
        )
      )
    } catch (e) {
      notifyError(e)
    } finally {
      setTesting(false)
    }
  }
  return (
    <div className="grid gap-4">
      <SwitchRow
        label={S('webSearchEmulation.enabled')}
        hint={S('webSearchEmulation.enabledHint')}
        checked={config.enabled}
        onChange={(v) => onChange({ ...config, enabled: v })}
      />
      {config.enabled ? (
        <>
          {config.providers.length === 0 ? (
            <p className="text-sm text-muted-foreground">{S('webSearchEmulation.noProviders')}</p>
          ) : null}
          {config.providers.map((p, i) => {
            const pct = p.quota_limit && p.quota_limit > 0 ? ((p.quota_used ?? 0) / p.quota_limit) * 100 : 0
            return (
              <div key={i} className="grid gap-3 rounded-md border p-4">
                <div className="flex items-center justify-between gap-2">
                  <NativeSelect
                    className="w-40"
                    aria-label={S('webSearchEmulation.providerType')}
                    value={p.type}
                    onChange={(e) => upd(i, { type: e.target.value as WebSearchProviderConfig['type'] })}
                  >
                    <option value="brave">Brave</option>
                    <option value="tavily">Tavily</option>
                  </NativeSelect>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      onChange({ ...config, providers: config.providers.filter((_, j) => j !== i) })
                    }
                  >
                    {S('webSearchEmulation.removeProvider')}
                  </Button>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <LabeledField
                    label={S('webSearchEmulation.apiKey')}
                    hint={
                      p.api_key_configured && !p.api_key
                        ? S('webSearchEmulation.apiKeyConfigured')
                        : undefined
                    }
                  >
                    <div className="flex gap-1">
                      <Input
                        type={visible[i] ? 'text' : 'password'}
                        autoComplete="off"
                        className="font-mono text-[13px]"
                        placeholder={S('webSearchEmulation.apiKeyPlaceholder')}
                        value={p.api_key}
                        onChange={(e) => upd(i, { api_key: e.target.value })}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        aria-label={
                          visible[i] ? S('webSearchEmulation.hideApiKey') : S('webSearchEmulation.showApiKey')
                        }
                        onClick={() => setVisible((v) => ({ ...v, [i]: !v[i] }))}
                      >
                        {visible[i] ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={async () => {
                          if (!p.api_key)
                            return notifyError(new Error(S('webSearchEmulation.apiKeyPlaceholder')))
                          if (await copyText(p.api_key)) notifySuccess(S('webSearchEmulation.copied'))
                        }}
                      >
                        {S('webSearchEmulation.copyApiKey')}
                      </Button>
                    </div>
                  </LabeledField>
                  <LabeledField label={S('webSearchEmulation.proxy')}>
                    <NativeSelect
                      value={p.proxy_id ?? ''}
                      onChange={(e) => upd(i, { proxy_id: e.target.value ? Number(e.target.value) : null })}
                    >
                      <option value="">—</option>
                      {proxies.map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.name}
                        </option>
                      ))}
                    </NativeSelect>
                  </LabeledField>
                  <LabeledField
                    label={S('webSearchEmulation.quotaLimit')}
                    hint={S('webSearchEmulation.quotaLimitHint')}
                  >
                    <Input
                      type="number"
                      min={0}
                      value={p.quota_limit ?? ''}
                      onChange={(e) =>
                        upd(i, { quota_limit: e.target.value === '' ? null : Number(e.target.value) })
                      }
                    />
                  </LabeledField>
                  <LabeledField
                    label={S('webSearchEmulation.subscribedAt')}
                    hint={S('webSearchEmulation.subscribedAtHint')}
                  >
                    <Input
                      type="date"
                      value={formatSubscribedAt(p.subscribed_at)}
                      onChange={(e) => upd(i, { subscribed_at: parseSubscribedAt(e.target.value) })}
                    />
                  </LabeledField>
                </div>
                {p.quota_limit && p.quota_limit > 0 ? (
                  <div className="text-xs">
                    <div className="mb-1 flex justify-between">
                      <span>{S('webSearchEmulation.quotaUsage')}</span>
                      <span>
                        {p.quota_used ?? 0} / {p.quota_limit}
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded bg-muted">
                      <div className="h-full bg-primary" style={{ width: `${Math.min(100, pct)}%` }} />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="mt-1 h-6 px-2"
                      onClick={() => setResetIdx(i)}
                    >
                      {S('webSearchEmulation.resetUsage')}
                    </Button>
                  </div>
                ) : null}
              </div>
            )
          })}
          <div className="flex flex-wrap gap-2">
            <AddButton
              onClick={() =>
                onChange({
                  ...config,
                  providers: [
                    ...config.providers,
                    {
                      type: 'brave',
                      api_key: '',
                      api_key_configured: false,
                      quota_limit: DEFAULT_WEB_SEARCH_QUOTA_LIMIT,
                      subscribed_at: null,
                      proxy_id: null,
                      expires_at: null
                    }
                  ]
                })
              }
            >
              <Plus aria-hidden />
              {S('webSearchEmulation.addProvider')}
            </AddButton>
          </div>
          <div className="grid gap-2 rounded-md border p-3">
            <div className="flex flex-wrap gap-2">
              <Input
                className="min-w-56 flex-1"
                aria-label={S('webSearchEmulation.test')}
                placeholder={S('webSearchEmulation.testDefaultQuery')}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <Button type="button" variant="outline" loading={testing} onClick={() => void runTest()}>
                {testing ? S('webSearchEmulation.testing') : S('webSearchEmulation.test')}
              </Button>
            </div>
            {result ? (
              <div className="grid gap-2 text-xs">
                <b>
                  {S('webSearchEmulation.testResultTitle')} · {S('webSearchEmulation.testResultProvider')}:{' '}
                  {result.provider}
                </b>
                {result.results.length === 0 ? (
                  <p>{S('webSearchEmulation.testNoResults')}</p>
                ) : (
                  result.results.map((r, i) => (
                    <div key={i} className="rounded border p-2">
                      <a
                        className="font-medium text-primary underline"
                        href={r.url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {r.title}
                      </a>
                      <p className="text-muted-foreground">{r.snippet}</p>
                    </div>
                  ))
                )}
              </div>
            ) : null}
          </div>
        </>
      ) : null}
      <ConfirmDialog
        open={resetIdx !== null}
        onOpenChange={(o) => !o && setResetIdx(null)}
        title={S('webSearchEmulation.resetUsage')}
        description={S('webSearchEmulation.resetUsageConfirm')}
        onConfirm={async () => {
          const i = resetIdx
          setResetIdx(null)
          if (i === null) return
          try {
            await adminAPI.settings.resetWebSearchUsage({ provider_type: config.providers[i].type })
            upd(i, { quota_used: 0 })
            notifySuccess(S('webSearchEmulation.resetUsageSuccess'))
          } catch (e) {
            notifyError(e)
          }
        }}
      />
    </div>
  )
}
