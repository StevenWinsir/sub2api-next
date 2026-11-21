/** 创建 / 编辑密钥对话框。 */
import * as React from 'react'
import { keysAPI } from '@/api/keys'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { FormField } from '@/components/FormField'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Input, Textarea } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { NativeSelect } from '@/components/NativeSelect'
import { PlatformIcon } from '@/components/PlatformIcon'
import { t } from '@/i18n'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/stores/app'
import { useOnboardingStore } from '@/stores/onboarding'
import type { ApiKey, Group } from '@/types'
import { extractApiErrorMessage } from '@/utils/apiError'
import {
  KEY_GROUP_PROVIDERS,
  KEY_GROUP_PROVIDER_ICONS,
  getKeyGroupProvider,
  type KeyGroupProvider
} from '@/utils/keyGroupProviders'
import {
  buildSubmitPlan,
  buildUpdatePayload,
  customKeyErrorKey,
  EMPTY_KEY_FORM,
  formatDateTimeLocal,
  keyToForm,
  type KeyFormData
} from './keyForm'
import { GroupPicker } from './GroupPicker'

function Section({
  title,
  enabled,
  onToggle,
  hint,
  children
}: {
  title: string
  enabled: boolean
  onToggle: (v: boolean) => void
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-3 rounded-lg border p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">{title}</p>
          {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
        </div>
        <Switch checked={enabled} onCheckedChange={onToggle} aria-label={title} />
      </div>
      {enabled ? children : null}
    </div>
  )
}

const num = (v: string): number | null => (v === '' ? null : Number(v))

export interface KeyFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** 编辑时传入；为空表示创建。 */
  editing: ApiKey | null
  groups: Group[]
  userRates: Record<number, number>
  onSaved: () => void
}

function FormBody({
  editing,
  groups,
  userRates,
  onSaved,
  onClose
}: Omit<KeyFormDialogProps, 'open' | 'onOpenChange'> & { onClose: () => void }) {
  const isEdit = !!editing
  const showError = useAppStore((s) => s.showError)
  const showSuccess = useAppStore((s) => s.showSuccess)
  const [form, setForm] = React.useState<KeyFormData>(() => (editing ? keyToForm(editing) : EMPTY_KEY_FORM))
  const [submitting, setSubmitting] = React.useState(false)
  const [confirm, setConfirm] = React.useState<'quota' | 'rate' | null>(null)
  const [provider, setProvider] = React.useState<KeyGroupProvider>(() => {
    const first = KEY_GROUP_PROVIDERS.find((p) => groups.some((g) => getKeyGroupProvider(g.platform) === p))
    return first ?? 'anthropic'
  })
  const set = (patch: Partial<KeyFormData>) => setForm((f) => ({ ...f, ...patch }))

  const providerCounts = KEY_GROUP_PROVIDERS.map((value) => ({
    value,
    count: groups.filter((g) => getKeyGroupProvider(g.platform) === value).length
  }))
  const formGroups = isEdit ? groups : groups.filter((g) => getKeyGroupProvider(g.platform) === provider)
  const customErrKey = customKeyErrorKey(form)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (form.group_id === null) return showError(t('keys.groupRequired'))
    if (!isEdit && form.use_custom_key) {
      if (!form.custom_key) return showError(t('keys.customKeyRequired'))
      if (customErrKey) return showError(t(customErrKey))
    }
    const plan = buildSubmitPlan(form, isEdit)
    setSubmitting(true)
    try {
      if (isEdit && editing) {
        await keysAPI.update(editing.id, buildUpdatePayload(form, plan, editing))
        showSuccess(t('keys.keyUpdatedSuccess'))
      } else {
        await keysAPI.create(
          form.name,
          form.group_id,
          form.use_custom_key ? form.custom_key : undefined,
          plan.ipWhitelist,
          plan.ipBlacklist,
          plan.quota,
          plan.expiresInDays,
          plan.rateLimit
        )
        showSuccess(t('keys.keyCreatedSuccess'))
        // 仅在新手引导停在提交步骤且创建成功时推进
        const onboarding = useOnboardingStore.getState()
        if (onboarding.isCurrentStep('[data-tour="key-form-submit"]')) void onboarding.nextStep(500)
      }
      onClose()
      onSaved()
    } catch (error) {
      showError(extractApiErrorMessage(error, t('keys.failedToSave')))
    } finally {
      setSubmitting(false)
    }
  }

  const resetQuota = async () => {
    if (!editing) return
    setConfirm(null)
    try {
      const updated = await keysAPI.update(editing.id, { reset_quota: true })
      showSuccess(t('keys.quotaResetSuccess'))
      set({ status: updated.status === 'active' ? 'active' : 'inactive' })
      onSaved()
    } catch (error) {
      showError(extractApiErrorMessage(error, t('keys.failedToResetQuota')))
    }
  }

  const resetRate = async () => {
    if (!editing) return
    setConfirm(null)
    try {
      await keysAPI.update(editing.id, { reset_rate_limit_usage: true })
      showSuccess(t('keys.rateLimitResetSuccess'))
      onSaved()
    } catch (error) {
      showError(extractApiErrorMessage(error, t('keys.failedToResetRateLimit')))
    }
  }

  const setExpirationDays = (days: number) => {
    const d = new Date()
    d.setDate(d.getDate() + days)
    set({
      expiration_preset: String(days) as '7' | '30' | '90',
      expiration_date: formatDateTimeLocal(d.toISOString())
    })
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <FormField label={t('keys.nameLabel')} required>
        <Input
          value={form.name}
          required
          data-tour="key-form-name"
          placeholder={t('keys.namePlaceholder')}
          onChange={(e) => set({ name: e.target.value })}
        />
      </FormField>

      {!isEdit ? (
        <div className="space-y-2">
          <p className="text-sm font-medium">{t('keys.providerLabel')}</p>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t('keys.providerLabel')}>
            {providerCounts.map((p) => (
              <button
                key={p.value}
                type="button"
                role="radio"
                aria-checked={provider === p.value}
                disabled={p.count === 0}
                onClick={() => {
                  if (provider !== p.value) {
                    setProvider(p.value)
                    set({ group_id: null })
                  }
                }}
                className={cn(
                  'flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm transition-colors disabled:opacity-40',
                  provider === p.value ? 'border-primary bg-accent text-accent-foreground' : 'hover:bg-muted'
                )}
              >
                <span className="flex -space-x-1">
                  {KEY_GROUP_PROVIDER_ICONS[p.value].slice(0, 3).map((pl) => (
                    <PlatformIcon key={pl} platform={pl} size="sm" />
                  ))}
                </span>
                {t(`keys.providers.${p.value}`)}{' '}
                <span className="text-xs text-muted-foreground">({p.count})</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <FormField label={t('keys.groupLabel')} required>
        <GroupPicker
          groups={formGroups}
          value={form.group_id}
          onChange={(id) => set({ group_id: id })}
          userRates={userRates}
          data-tour="key-form-group"
        />
      </FormField>

      {isEdit ? (
        <FormField label={t('keys.statusLabel')}>
          <NativeSelect
            value={form.status}
            onChange={(e) => set({ status: e.target.value as 'active' | 'inactive' })}
          >
            <option value="active">{t('common.active')}</option>
            <option value="inactive">{t('common.inactive')}</option>
          </NativeSelect>
        </FormField>
      ) : (
        <Section
          title={t('keys.customKeyLabel')}
          enabled={form.use_custom_key}
          onToggle={(v) => set({ use_custom_key: v, custom_key: v ? form.custom_key : '' })}
        >
          <FormField
            label={t('keys.customKeyLabel')}
            error={customErrKey ? t(customErrKey) : undefined}
            description={t('keys.customKeyHint')}
          >
            <Input
              value={form.custom_key}
              autoComplete="off"
              className="font-mono"
              placeholder={t('keys.customKeyPlaceholder')}
              onChange={(e) => set({ custom_key: e.target.value })}
            />
          </FormField>
        </Section>
      )}

      <Section
        title={t('keys.ipRestriction')}
        enabled={form.enable_ip_restriction}
        onToggle={(v) => set({ enable_ip_restriction: v })}
      >
        <FormField label={t('keys.ipWhitelist')} description={t('keys.ipWhitelistHint')}>
          <Textarea
            rows={3}
            className="font-mono"
            value={form.ip_whitelist}
            placeholder={t('keys.ipWhitelistPlaceholder')}
            onChange={(e) => set({ ip_whitelist: e.target.value })}
          />
        </FormField>
        <FormField label={t('keys.ipBlacklist')} description={t('keys.ipBlacklistHint')}>
          <Textarea
            rows={3}
            className="font-mono"
            value={form.ip_blacklist}
            placeholder={t('keys.ipBlacklistPlaceholder')}
            onChange={(e) => set({ ip_blacklist: e.target.value })}
          />
        </FormField>
      </Section>

      <Section
        title={t('keys.quotaLimit')}
        enabled={form.enable_quota}
        onToggle={(v) => set({ enable_quota: v, quota: v ? form.quota : null })}
      >
        <FormField label={t('keys.quotaAmount')} description={t('keys.quotaAmountHint')}>
          <Input
            type="number"
            min={0}
            step="0.01"
            value={form.quota ?? ''}
            placeholder={t('keys.quotaAmountPlaceholder')}
            onChange={(e) => set({ quota: num(e.target.value) })}
          />
        </FormField>
        {isEdit && editing && editing.quota > 0 ? (
          <div className="flex items-center justify-between rounded-md bg-muted px-3 py-2 text-sm">
            <span>
              {t('keys.quotaUsed')}: <b className="tabular">${editing.quota_used?.toFixed(4) ?? '0.0000'}</b>{' '}
              / ${editing.quota.toFixed(2)}
            </span>
            <Button type="button" size="sm" variant="outline" onClick={() => setConfirm('quota')}>
              {t('keys.reset')}
            </Button>
          </div>
        ) : null}
      </Section>

      <Section
        title={t('keys.rateLimitSection')}
        hint={t('keys.rateLimitHint')}
        enabled={form.enable_rate_limit}
        onToggle={(v) => set({ enable_rate_limit: v })}
      >
        <div className="grid gap-3 sm:grid-cols-3">
          {(['rate_limit_5h', 'rate_limit_1d', 'rate_limit_7d'] as const).map((k) => (
            <FormField
              key={k}
              label={t(
                `keys.${k === 'rate_limit_5h' ? 'rateLimit5h' : k === 'rate_limit_1d' ? 'rateLimit1d' : 'rateLimit7d'}`
              )}
            >
              <Input
                type="number"
                min={0}
                step="0.01"
                value={form[k] ?? ''}
                onChange={(e) => set({ [k]: num(e.target.value) } as Partial<KeyFormData>)}
              />
            </FormField>
          ))}
        </div>
        {isEdit ? (
          <Button type="button" size="sm" variant="outline" onClick={() => setConfirm('rate')}>
            {t('keys.resetRateLimitUsage')}
          </Button>
        ) : null}
      </Section>

      <Section
        title={t('keys.expiration')}
        enabled={form.enable_expiration}
        onToggle={(v) => set({ enable_expiration: v })}
      >
        {isEdit && editing?.expires_at ? (
          <p className="text-xs text-muted-foreground">
            {t('keys.currentExpiration')}: {new Date(editing.expires_at).toLocaleString()}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          {[7, 30, 90].map((d) => (
            <Button
              key={d}
              type="button"
              size="sm"
              variant={form.expiration_preset === String(d) ? 'secondary' : 'outline'}
              onClick={() => setExpirationDays(d)}
            >
              {t('keys.expiresInDays', { days: d })}
            </Button>
          ))}
          <Button
            type="button"
            size="sm"
            variant={form.expiration_preset === 'custom' ? 'secondary' : 'outline'}
            onClick={() => set({ expiration_preset: 'custom' })}
          >
            {t('keys.customDate')}
          </Button>
        </div>
        <FormField label={t('keys.expirationDate')} description={t('keys.expirationDateHint')}>
          <Input
            type="datetime-local"
            value={form.expiration_date}
            onChange={(e) => set({ expiration_date: e.target.value, expiration_preset: 'custom' })}
          />
        </FormField>
      </Section>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" loading={submitting} data-tour="key-form-submit">
          {submitting ? t('keys.saving') : isEdit ? t('common.update') : t('common.create')}
        </Button>
      </DialogFooter>

      <ConfirmDialog
        open={confirm === 'quota'}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={t('keys.resetQuotaTitle')}
        description={t('keys.resetQuotaConfirmMessage', {
          name: editing?.name ?? '',
          used: (editing?.quota_used ?? 0).toFixed(4)
        })}
        confirmText={t('keys.resetQuotaUsed')}
        onConfirm={resetQuota}
      />
      <ConfirmDialog
        open={confirm === 'rate'}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={t('keys.resetRateLimitTitle')}
        description={t('keys.resetRateLimitConfirmMessage', { name: editing?.name ?? '' })}
        confirmText={t('keys.resetRateLimitUsage')}
        onConfirm={resetRate}
      />
    </form>
  )
}

export function KeyFormDialog({ open, onOpenChange, ...rest }: KeyFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{rest.editing ? t('keys.editKey') : t('keys.createKey')}</DialogTitle>
          <DialogDescription className="sr-only">{t('keys.description')}</DialogDescription>
        </DialogHeader>
        {open ? (
          <FormBody key={rest.editing?.id ?? 'new'} {...rest} onClose={() => onOpenChange(false)} />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
