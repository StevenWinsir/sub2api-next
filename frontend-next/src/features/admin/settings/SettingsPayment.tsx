/** 系统设置·支付：服务商实例管理（列表 / 启停 / 退款开关 / 增改删 / 回调与限额）。 */
import * as React from 'react'
import { ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react'
import { adminAPI } from '@/api/admin'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { NativeSelect } from '@/components/NativeSelect'
import { StatusBadge } from '@/components/StatusBadge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { AdminFormDialog } from '@/features/admin/common/AdminFormDialog'
import { notifySuccess } from '@/features/admin/common/notify'
import { normalizeVisibleMethod } from '@/features/payment/paymentFlow'
import {
  PAYMENT_MODE_POPUP,
  PAYMENT_MODE_QRCODE,
  PAYMENT_MODE_REDIRECT,
  PROVIDER_CALLBACK_PATHS,
  PROVIDER_CONFIG_FIELDS,
  PROVIDER_SUPPORTED_TYPES,
  WEBHOOK_PATHS,
  extractBaseUrl,
  parseEasyPayCustomMethods,
  serializeEasyPayCustomMethods,
  type EasyPayCustomMethod
} from '@/features/payment/providerConfig'
import { t } from '@/i18n'
import type { ProviderInstance } from '@/types/payment'
import { extractI18nErrorMessage } from '@/utils/apiError'
import { useAppStore } from '@/stores/app'
import { AddButton, LabeledField, SwitchRow } from './settingsUi'

const S = (k: string, p?: Record<string, unknown>) => t(`admin.settings.payment.${k}`, p)
const U = (k: string, p?: Record<string, unknown>) => t(`adminUi.settings.${k}`, p)
export const PROVIDER_KEYS = ['easypay', 'alipay', 'wxpay', 'stripe', 'airwallex'] as const
const providerLabel = (k: string) => S(`provider${k[0].toUpperCase()}${k.slice(1)}`)

export const defaultPaymentMode = (key: string): string => (key === 'easypay' ? PAYMENT_MODE_QRCODE : '')
export const supportsPaymentMode = (key: string): boolean => key === 'easypay' || key === 'alipay'
export function isValidPaymentMode(key: string, mode: string): boolean {
  if (key === 'easypay') return mode === PAYMENT_MODE_QRCODE || mode === PAYMENT_MODE_POPUP
  if (key === 'alipay') return mode === '' || mode === PAYMENT_MODE_REDIRECT
  return mode === ''
}

type Candidate = Pick<ProviderInstance, 'id' | 'provider_key' | 'supported_types' | 'enabled' | 'name'>
/** 该实例启用后在用户侧占用的可见支付方式（alipay / wxpay）。 */
export function getProviderVisibleMethods(p: Candidate): Array<'alipay' | 'wxpay'> {
  if (!p.enabled) return []
  const types = Array.isArray(p.supported_types) ? p.supported_types : []
  const methods = new Set<'alipay' | 'wxpay'>()
  const add = (ty: string) => {
    const m = normalizeVisibleMethod(ty)
    if (m === 'alipay' || m === 'wxpay') methods.add(m)
  }
  if (p.provider_key === 'alipay') {
    if (types.length === 0) methods.add('alipay')
    else types.forEach((ty) => normalizeVisibleMethod(ty) === 'alipay' && methods.add('alipay'))
  } else if (p.provider_key === 'wxpay') {
    if (types.length === 0) methods.add('wxpay')
    else types.forEach((ty) => normalizeVisibleMethod(ty) === 'wxpay' && methods.add('wxpay'))
  } else if (p.provider_key === 'easypay') types.forEach(add)
  return Array.from(methods)
}

export function findProviderEnablementConflict(
  candidate: Candidate,
  providers: ProviderInstance[]
): { method: 'alipay' | 'wxpay'; conflicting: ProviderInstance } | null {
  const claimed = getProviderVisibleMethods(candidate)
  if (claimed.length === 0) return null
  for (const other of providers) {
    if (other.id === candidate.id || !other.enabled) continue
    const m = claimed.find((x) => getProviderVisibleMethods(other).includes(x))
    if (m) return { method: m, conflicting: other }
  }
  return null
}

type Limits = Record<string, Record<string, number>>
export function serializeLimits(limits: Limits): string {
  const result: Limits = {}
  for (const [pt, fields] of Object.entries(limits)) {
    const clean: Record<string, number> = {}
    for (const [k, v] of Object.entries(fields)) if (v > 0) clean[k] = v
    if (Object.keys(clean).length > 0) result[pt] = clean
  }
  return Object.keys(result).length > 0 ? JSON.stringify(result) : ''
}

function validateCustomMethods(list: EasyPayCustomMethod[]): string | null {
  const seen = new Set<string>()
  for (const m of list) {
    if (!(m.type || m.upstreamType || m.displayName)) continue
    if (!m.type || !m.upstreamType) return S('validationEasyPayCustomMethodRequired')
    if (!/^[a-z0-9_-]+$/.test(m.type)) return S('validationEasyPayCustomMethodTypeInvalid')
    if (!/^[a-z0-9_.-]+$/.test(m.upstreamType)) return S('validationEasyPayCustomMethodUpstreamTypeInvalid')
    if ((PROVIDER_SUPPORTED_TYPES.easypay || []).includes(m.type))
      return S('validationEasyPayCustomMethodReserved')
    if (m.type.startsWith('alipay') || m.type.startsWith('wxpay'))
      return S('validationEasyPayCustomMethodPrefixReserved')
    if (seen.has(m.type)) return S('validationEasyPayCustomMethodDuplicate')
    seen.add(m.type)
  }
  return null
}

function ProviderDialog({
  editing,
  enabledKeys,
  saving,
  onClose,
  onSave
}: {
  editing: ProviderInstance | null
  enabledKeys: string[]
  saving: boolean
  onClose: () => void
  onSave: (payload: Partial<ProviderInstance>) => void
}) {
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const initKey = editing?.provider_key ?? (enabledKeys[0] || 'easypay')
  const [name, setName] = React.useState(editing?.name ?? '')
  const [key, setKey] = React.useState(initKey)
  const [types, setTypes] = React.useState<string[]>(
    editing
      ? Array.isArray(editing.supported_types)
        ? [...editing.supported_types]
        : []
      : [...(PROVIDER_SUPPORTED_TYPES[initKey] || [])]
  )
  const [enabled, setEnabled] = React.useState(editing?.enabled ?? true)
  const [mode, setMode] = React.useState(
    editing
      ? isValidPaymentMode(editing.provider_key, editing.payment_mode || '')
        ? editing.payment_mode || ''
        : defaultPaymentMode(editing.provider_key)
      : defaultPaymentMode(initKey)
  )
  const [refund, setRefund] = React.useState(editing?.refund_enabled ?? false)
  const [userRefund, setUserRefund] = React.useState(editing?.allow_user_refund ?? false)
  const applyDefaults = (k: string, base: Record<string, string>) => {
    const next = { ...base }
    for (const f of PROVIDER_CONFIG_FIELDS[k] || [])
      if (f.defaultValue && !next[f.key]) next[f.key] = f.defaultValue
    return next
  }
  const [config, setConfig] = React.useState<Record<string, string>>(() => {
    const base: Record<string, string> = {}
    if (editing?.config)
      for (const [k, v] of Object.entries(editing.config))
        if (
          k !== 'notifyUrl' &&
          k !== 'returnUrl' &&
          !(k === 'customMethods' && editing.provider_key === 'easypay')
        )
          base[k] = v
    return applyDefaults(initKey, base)
  })
  const paths = PROVIDER_CALLBACK_PATHS[key]
  const [notifyBase, setNotifyBase] = React.useState(() =>
    paths?.notifyUrl && editing?.config?.notifyUrl
      ? extractBaseUrl(editing.config.notifyUrl, paths.notifyUrl)
      : ''
  )
  const [returnBase, setReturnBase] = React.useState(() =>
    paths?.returnUrl && editing?.config?.returnUrl
      ? extractBaseUrl(editing.config.returnUrl, paths.returnUrl)
      : ''
  )
  const [custom, setCustom] = React.useState<EasyPayCustomMethod[]>(() =>
    editing?.provider_key === 'easypay' ? parseEasyPayCustomMethods(editing.config?.customMethods) : []
  )
  const [limits, setLimits] = React.useState<Limits>(() => {
    try {
      return editing?.limits ? (JSON.parse(editing.limits) as Limits) : {}
    } catch {
      return {}
    }
  })
  const [limitsOpen, setLimitsOpen] = React.useState(Object.keys(limits).length > 0)
  const [error, setError] = React.useState('')

  const onKeyChange = (k: string) => {
    setKey(k)
    setTypes([...(PROVIDER_SUPPORTED_TYPES[k] || [])])
    setMode(defaultPaymentMode(k))
    setConfig(applyDefaults(k, {}))
    setNotifyBase('')
    setReturnBase('')
    setLimits({})
    setCustom([])
  }
  const normalizedCustom = custom
    .map((m) => ({
      type: m.type.trim().toLowerCase(),
      upstreamType: m.upstreamType.trim().toLowerCase(),
      displayName: m.displayName.trim()
    }))
    .filter((m) => m.type || m.upstreamType || m.displayName)
  const baseTypes = PROVIDER_SUPPORTED_TYPES[key] || []
  const availableTypes = [
    ...baseTypes,
    ...(key === 'easypay'
      ? normalizedCustom.map((m) => m.type).filter((x) => x && !baseTypes.includes(x))
      : [])
  ]
  const limitable = key === 'stripe' ? ['stripe'] : types.filter((x) => x !== 'easypay')
  const fields = PROVIDER_CONFIG_FIELDS[key] || []

  const submit = () => {
    if (!name.trim()) return setError(S('validationNameRequired'))
    if (key === 'easypay') {
      const v = validateCustomMethods(normalizedCustom)
      if (v) return setError(v)
    }
    for (const f of fields) {
      if (f.optional) continue
      if (editing && f.sensitive) continue // 编辑时敏感字段留空 = 保留已存值
      if (!(config[f.key] || '').trim())
        return setError(S('validationFieldRequired', { field: f.label || S(`field_${f.key}`) }))
    }
    if (types.length === 0) return setError(S('validationTypesRequired'))
    const clearable = new Set(fields.filter((f) => f.clearable).map((f) => f.key))
    const filtered: Record<string, string> = {}
    for (const [k, v] of Object.entries(config)) {
      if (!v || !v.trim()) {
        if (clearable.has(k)) filtered[k] = ''
        continue
      }
      filtered[k] = v
    }
    if (key === 'easypay') filtered.customMethods = serializeEasyPayCustomMethods(normalizedCustom)
    if (paths) {
      const nb = (notifyBase.trim() || origin).replace(/\/+$/, '')
      const rb = (returnBase.trim() || origin).replace(/\/+$/, '')
      if (paths.notifyUrl) filtered.notifyUrl = nb + paths.notifyUrl
      if (paths.returnUrl) filtered.returnUrl = rb + paths.returnUrl
    }
    setError('')
    onSave({
      provider_key: key,
      name,
      supported_types: types,
      enabled,
      payment_mode: supportsPaymentMode(key) ? mode : '',
      refund_enabled: refund,
      allow_user_refund: refund ? userRefund : false,
      config: filtered,
      limits: serializeLimits(limits)
    })
  }
  const setLimit = (pt: string, field: string, raw: string) => {
    const n = Number(raw)
    setLimits((l) => {
      const cur = { ...(l[pt] ?? {}) }
      if (raw === '' || !(n > 0)) delete cur[field]
      else cur[field] = n
      return { ...l, [pt]: cur }
    })
  }
  const webhook =
    (key === 'stripe' || key === 'airwallex') && WEBHOOK_PATHS[key] ? origin + WEBHOOK_PATHS[key] : ''

  return (
    <AdminFormDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={editing ? S('editProvider') : S('createProvider')}
      size="xl"
      onSubmit={submit}
      submitting={saving}
    >
      <div className="grid gap-4">
        {error ? (
          <p role="alert" className="rounded-md bg-destructive/10 p-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <LabeledField label={S('providerName')}>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </LabeledField>
          <LabeledField label={S('providerKey')}>
            <NativeSelect value={key} disabled={!!editing} onChange={(e) => onKeyChange(e.target.value)}>
              {PROVIDER_KEYS.filter((k) => !!editing || enabledKeys.includes(k)).map((k) => (
                <option key={k} value={k}>
                  {providerLabel(k)}
                </option>
              ))}
            </NativeSelect>
          </LabeledField>
        </div>
        <div className="grid gap-1">
          <b className="text-sm">{S('supportedTypes')}</b>
          <div className="flex flex-wrap gap-4">
            {availableTypes.map((ty) => (
              <label key={ty} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={types.includes(ty)}
                  onCheckedChange={(v) =>
                    setTypes((c) => (v === true ? [...c, ty] : c.filter((x) => x !== ty)))
                  }
                />
                {normalizedCustom.find((m) => m.type === ty)?.displayName || t(`payment.methods.${ty}`)}
              </label>
            ))}
          </div>
        </div>
        {supportsPaymentMode(key) ? (
          <LabeledField label={S('paymentMode')}>
            <NativeSelect value={mode} onChange={(e) => setMode(e.target.value)}>
              {key === 'alipay'
                ? [
                    <option key="q" value="">
                      {S('modeQRCode')}
                    </option>,
                    <option key="r" value={PAYMENT_MODE_REDIRECT}>
                      {S('modeRedirect')}
                    </option>
                  ]
                : [
                    <option key="q" value={PAYMENT_MODE_QRCODE}>
                      {S('modeQRCode')}
                    </option>,
                    <option key="p" value={PAYMENT_MODE_POPUP}>
                      {S('modePopup')}
                    </option>
                  ]}
            </NativeSelect>
          </LabeledField>
        ) : null}
        <div className="grid gap-3 rounded-md border p-3">
          <b className="text-sm">{S('providerConfig')}</b>
          <div className="grid gap-3 sm:grid-cols-2">
            {fields.map((f) => (
              <LabeledField
                key={f.key}
                label={f.label || S(`field_${f.key}`)}
                hint={
                  f.sensitive && editing ? U('payment.keepSecretHint') : f.hintKey ? t(f.hintKey) : undefined
                }
              >
                {f.options ? (
                  <NativeSelect
                    value={config[f.key] ?? ''}
                    onChange={(e) => setConfig({ ...config, [f.key]: e.target.value })}
                  >
                    {f.options.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </NativeSelect>
                ) : (
                  <Input
                    type={f.sensitive ? 'password' : 'text'}
                    autoComplete={f.sensitive ? 'new-password' : 'off'}
                    className="font-mono text-[13px]"
                    value={config[f.key] ?? ''}
                    onChange={(e) => setConfig({ ...config, [f.key]: e.target.value })}
                  />
                )}
              </LabeledField>
            ))}
          </div>
          {paths ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {paths.notifyUrl ? (
                <LabeledField
                  label={`${S('field_notifyUrl')} (${S('callbackBaseUrl')})`}
                  hint={`${notifyBase.trim() || origin}${paths.notifyUrl}`}
                >
                  <Input
                    placeholder={origin}
                    value={notifyBase}
                    onChange={(e) => setNotifyBase(e.target.value)}
                  />
                </LabeledField>
              ) : null}
              {paths.returnUrl ? (
                <LabeledField
                  label={`${S('field_returnUrl')} (${S('callbackBaseUrl')})`}
                  hint={`${returnBase.trim() || origin}${paths.returnUrl}`}
                >
                  <Input
                    placeholder={origin}
                    value={returnBase}
                    onChange={(e) => setReturnBase(e.target.value)}
                  />
                </LabeledField>
              ) : null}
            </div>
          ) : null}
          {webhook ? (
            <p className="text-xs text-muted-foreground">
              Webhook: <code className="break-all">{webhook}</code>
            </p>
          ) : null}
          {key === 'easypay' ? (
            <div className="grid gap-2">
              <b className="text-xs">{S('easypayCustomMethods')}</b>
              {custom.map((m, i) => (
                <div key={i} className="flex flex-wrap items-center gap-2">
                  <Input
                    className="w-36 font-mono text-[13px]"
                    aria-label={S('customMethodType')}
                    placeholder={S('customMethodType')}
                    value={m.type}
                    onChange={(e) =>
                      setCustom(custom.map((x, j) => (j === i ? { ...x, type: e.target.value } : x)))
                    }
                  />
                  <Input
                    className="w-40 font-mono text-[13px]"
                    aria-label={S('customMethodUpstreamType')}
                    placeholder={S('customMethodUpstreamType')}
                    value={m.upstreamType}
                    onChange={(e) =>
                      setCustom(custom.map((x, j) => (j === i ? { ...x, upstreamType: e.target.value } : x)))
                    }
                  />
                  <Input
                    className="w-40"
                    aria-label={S('customMethodDisplayName')}
                    placeholder={S('customMethodDisplayName')}
                    value={m.displayName}
                    onChange={(e) =>
                      setCustom(custom.map((x, j) => (j === i ? { ...x, displayName: e.target.value } : x)))
                    }
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={t('common.remove')}
                    onClick={() => setCustom(custom.filter((_, j) => j !== i))}
                  >
                    <Trash2 aria-hidden />
                  </Button>
                </div>
              ))}
              <AddButton
                onClick={() => setCustom([...custom, { type: '', upstreamType: '', displayName: '' }])}
              >
                <Plus aria-hidden />
                {t('common.add')}
              </AddButton>
            </div>
          ) : null}
        </div>
        <div className="grid gap-2 rounded-md border p-3">
          <button
            type="button"
            className="flex items-center justify-between text-left text-sm font-semibold"
            onClick={() => setLimitsOpen((o) => !o)}
            aria-expanded={limitsOpen}
          >
            {S('limitsTitle')}{' '}
            {limitsOpen ? (
              <ChevronUp className="size-4" aria-hidden />
            ) : (
              <ChevronDown className="size-4" aria-hidden />
            )}
          </button>
          {limitsOpen ? (
            <>
              <p className="text-xs text-muted-foreground">{S('limitsHint')}</p>
              {limitable.map((pt) => {
                const l = limits[pt] ?? {}
                const any = (l.singleMin ?? 0) > 0 || (l.singleMax ?? 0) > 0 || (l.dailyLimit ?? 0) > 0
                const ph = any ? S('limitsNoLimit') : S('limitsUseGlobal')
                return (
                  <div key={pt} className="grid gap-2 sm:grid-cols-4 sm:items-end">
                    <b className="text-sm">{pt}</b>
                    {(['singleMin', 'singleMax', 'dailyLimit'] as const).map((f) => (
                      <LabeledField
                        key={f}
                        label={S(
                          f === 'singleMin'
                            ? 'limitSingleMin'
                            : f === 'singleMax'
                              ? 'limitSingleMax'
                              : 'limitDaily'
                        )}
                      >
                        <Input
                          type="number"
                          min={0}
                          step="0.01"
                          placeholder={ph}
                          value={l[f] && l[f] > 0 ? String(l[f]) : ''}
                          onChange={(e) => setLimit(pt, f, e.target.value)}
                        />
                      </LabeledField>
                    ))}
                  </div>
                )
              })}
            </>
          ) : null}
        </div>
        <div className="grid gap-2">
          <SwitchRow label={t('common.enabled')} checked={enabled} onChange={setEnabled} />
          <SwitchRow
            label={S('refundEnabled')}
            checked={refund}
            onChange={(v) => {
              setRefund(v)
              if (!v) setUserRefund(false)
            }}
          />
          {refund ? (
            <SwitchRow label={S('allowUserRefund')} checked={userRefund} onChange={setUserRefund} />
          ) : null}
        </div>
      </div>
    </AdminFormDialog>
  )
}

export function PaymentProvidersBlock({
  enabledKeys,
  onChanged
}: {
  enabledKeys: string[]
  onChanged: () => void
}) {
  const [list, setList] = React.useState<ProviderInstance[]>([])
  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)
  const [dialog, setDialog] = React.useState<{ editing: ProviderInstance | null } | null>(null)
  const [removing, setRemoving] = React.useState<ProviderInstance | null>(null)
  const err = (e: unknown) =>
    useAppStore.getState().showError(extractI18nErrorMessage(e, t, 'payment.errors', t('common.error')))
  const load = React.useCallback(async () => {
    try {
      const r = await adminAPI.payment.getProviders()
      setList(((r.data ?? []) as ProviderInstance[]).slice().sort((a, b) => a.sort_order - b.sort_order))
    } catch (e) {
      err(e)
    } finally {
      setLoading(false)
    }
  }, [])
  React.useEffect(() => {
    const id = window.setTimeout(() => void load(), 0)
    return () => window.clearTimeout(id)
  }, [load])

  const conflictToast = (c: NonNullable<ReturnType<typeof findProviderEnablementConflict>>) =>
    useAppStore.getState().showError(
      U('payment.enablementConflict', {
        method: t(`payment.methods.${c.method}`),
        name: c.conflicting.name
      })
    )

  const toggle = async (p: ProviderInstance, field: 'enabled' | 'refund_enabled' | 'allow_user_refund') => {
    const next = !p[field]
    if (field === 'enabled' && next) {
      const c = findProviderEnablementConflict(
        {
          id: p.id,
          provider_key: p.provider_key,
          supported_types: p.supported_types,
          enabled: true,
          name: p.name
        },
        list
      )
      if (c) return conflictToast(c)
    }
    const payload: Record<string, boolean> = { [field]: next }
    if (field === 'refund_enabled' && !next) payload.allow_user_refund = false
    try {
      await adminAPI.payment.updateProvider(p.id, payload)
      await load()
    } catch (e) {
      err(e)
    }
  }
  const move = async (i: number, d: -1 | 1) => {
    const j = i + d
    if (j < 0 || j >= list.length) return
    const a = list[i]
    const b = list[j]
    try {
      await Promise.all([
        adminAPI.payment.updateProvider(a.id, { sort_order: b.sort_order } as Partial<ProviderInstance>),
        adminAPI.payment.updateProvider(b.id, { sort_order: a.sort_order } as Partial<ProviderInstance>)
      ])
      await load()
    } catch (e) {
      err(e)
      await load()
    }
  }
  const save = async (payload: Partial<ProviderInstance>) => {
    const editing = dialog?.editing ?? null
    const candidate: Candidate = {
      id: editing?.id ?? 0,
      provider_key: payload.provider_key ?? editing?.provider_key ?? '',
      supported_types: payload.supported_types ?? editing?.supported_types ?? [],
      enabled: payload.enabled ?? editing?.enabled ?? false,
      name: payload.name ?? editing?.name ?? ''
    }
    const c = findProviderEnablementConflict(candidate, list)
    if (c) return conflictToast(c)
    setSaving(true)
    try {
      if (editing) await adminAPI.payment.updateProvider(editing.id, payload)
      else await adminAPI.payment.createProvider(payload)
      setDialog(null)
      await load()
      notifySuccess(t('common.saved'))
      onChanged()
    } catch (e) {
      err(e)
    } finally {
      setSaving(false)
    }
  }
  if (loading) return <Skeleton className="h-24" />
  return (
    <div className="grid gap-3">
      {enabledKeys.length === 0 ? (
        <p className="rounded-md bg-warning/10 p-3 text-sm">{S('enableTypesFirst')}</p>
      ) : null}
      {list.length === 0 ? <p className="text-sm text-muted-foreground">{S('noProviders')}</p> : null}
      <ul className="grid gap-2">
        {list.map((p, i) => (
          <li key={p.id} className="flex flex-wrap items-center gap-3 rounded-md border p-3 text-sm">
            <Switch
              checked={p.enabled}
              aria-label={t('common.enabled')}
              onCheckedChange={() => void toggle(p, 'enabled')}
            />
            <div className="min-w-0 flex-1">
              <div className="font-medium">
                {p.name} <Badge variant="secondary">{providerLabel(p.provider_key)}</Badge>
              </div>
              <div className="text-xs text-muted-foreground">
                {(p.supported_types ?? []).map((ty) => t(`payment.methods.${ty}`)).join(' · ')}
                {!enabledKeys.includes(p.provider_key) ? ` · ${S('typeDisabled')}` : ''}
              </div>
            </div>
            <label className="flex items-center gap-1.5 text-xs">
              <Switch
                checked={p.refund_enabled}
                onCheckedChange={() => void toggle(p, 'refund_enabled')}
                aria-label={S('refundEnabled')}
              />
              {S('refundEnabled')}
            </label>
            {p.refund_enabled ? (
              <label className="flex items-center gap-1.5 text-xs">
                <Switch
                  checked={p.allow_user_refund}
                  onCheckedChange={() => void toggle(p, 'allow_user_refund')}
                  aria-label={S('allowUserRefund')}
                />
                {S('allowUserRefund')}
              </label>
            ) : null}
            <StatusBadge status={p.enabled ? 'success' : 'neutral'}>
              {p.enabled ? t('common.enabled') : t('common.disabled')}
            </StatusBadge>
            <Button
              size="icon"
              variant="ghost"
              className="size-8"
              aria-label={U('payment.moveUp')}
              disabled={i === 0}
              onClick={() => void move(i, -1)}
            >
              <ChevronUp aria-hidden />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="size-8"
              aria-label={U('payment.moveDown')}
              disabled={i === list.length - 1}
              onClick={() => void move(i, 1)}
            >
              <ChevronDown aria-hidden />
            </Button>
            <Button size="sm" variant="outline" onClick={() => setDialog({ editing: p })}>
              {t('common.edit')}
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="size-8"
              aria-label={t('common.delete')}
              onClick={() => setRemoving(p)}
            >
              <Trash2 aria-hidden />
            </Button>
          </li>
        ))}
      </ul>
      <AddButton
        onClick={() =>
          enabledKeys.length === 0
            ? useAppStore.getState().showError(S('enableTypesFirst'))
            : setDialog({ editing: null })
        }
      >
        <Plus aria-hidden />
        {S('createProvider')}
      </AddButton>
      {dialog ? (
        <ProviderDialog
          editing={dialog.editing}
          enabledKeys={enabledKeys}
          saving={saving}
          onClose={() => setDialog(null)}
          onSave={(p) => void save(p)}
        />
      ) : null}
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={t('common.delete')}
        description={removing ? S('deleteProviderConfirm', { name: removing.name }) : ''}
        destructive
        onConfirm={async () => {
          const p = removing
          setRemoving(null)
          if (!p) return
          try {
            await adminAPI.payment.deleteProvider(p.id)
            notifySuccess(t('common.deleted'))
            await load()
            onChanged()
          } catch (e) {
            err(e)
          }
        }}
      />
    </div>
  )
}

/** 启用的服务商类型被取消时：关闭其下所有已启用实例。 */
export async function disableProvidersByType(type: string): Promise<void> {
  try {
    const r = await adminAPI.payment.getProviders()
    const matching = ((r.data ?? []) as ProviderInstance[]).filter(
      (p) => p.provider_key === type && p.enabled
    )
    for (const p of matching) {
      try {
        await adminAPI.payment.updateProvider(p.id, { enabled: false })
      } catch {
        /* 单个失败不阻断 */
      }
    }
  } catch {
    /* 非关键 */
  }
}
