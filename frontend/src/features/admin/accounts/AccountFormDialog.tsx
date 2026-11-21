/**
 * 账号创建 / 编辑。
 *  - API Key：base_url + api_key（编辑时留空保持原密钥，其余非敏感凭据合并回传，与 Vue 版一致）
 *  - OAuth / Setup Token（Anthropic）：生成授权链接 → 粘贴授权码 → 兑换令牌后创建
 *  - 其他类型（bedrock / service_account / upstream / 其他平台 OAuth）：直接粘贴凭据 JSON
 * 表单字段随平台与类型动态切换，见 accountFormModel.ts（纯逻辑，有快照测试）。
 */
import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { ExternalLink } from 'lucide-react'
import { adminAPI } from '@/api/admin'
import { FormField } from '@/components/FormField'
import { NativeSelect } from '@/components/NativeSelect'
import { PasswordInput } from '@/components/PasswordInput'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input, Textarea } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { CONCRETE_PLATFORM_OPTIONS } from '@/constants/platforms'
import { AdminFormDialog } from '@/features/admin/common/AdminFormDialog'
import { numOrUndef, str, toLocalInput } from '@/features/admin/common/fieldUtils'
import { notifyError } from '@/features/admin/common/notify'
import { useAdminAction } from '@/features/admin/common/useAdminAction'
import { t } from '@/i18n'
import type { Account, AccountType } from '@/types'
import {
  accountFormFields,
  accountTypeOptions,
  buildCreatePayload,
  buildUpdatePayload,
  type FormState
} from './accountFormModel'

interface Props {
  account: Account | null
  onClose: () => void
  onSaved: () => void
}

function initialState(account: Account | null): FormState {
  return {
    name: account?.name ?? '',
    notes: account?.notes ?? '',
    platform: account?.platform ?? 'anthropic',
    type: account?.type ?? 'apikey',
    baseUrl: String((account?.credentials as Record<string, unknown> | undefined)?.base_url ?? ''),
    apiKey: '',
    credentialsJson: '',
    proxyId: str(account?.proxy_id),
    concurrency: str(account?.concurrency ?? 10),
    loadFactor: str(account?.load_factor),
    priority: str(account?.priority ?? 1),
    rateMultiplier: str(account?.rate_multiplier ?? 1),
    groupIds: account?.group_ids ?? account?.groups?.map((g) => g.id) ?? [],
    expiresAt: account?.expires_at ? toLocalInput(new Date(account.expires_at * 1000).toISOString()) : '',
    autoPauseOnExpired: account?.auto_pause_on_expired ?? false,
    schedulable: account?.schedulable ?? true,
    status: account?.status === 'inactive' ? 'inactive' : 'active'
  }
}

export function AccountFormDialog({ account, onClose, onSaved }: Props) {
  const editing = !!account
  const { busy, run } = useAdminAction()
  const [form, setForm] = React.useState<FormState>(() => initialState(account))
  const [error, setError] = React.useState('')
  const [oauth, setOauth] = React.useState<{ url: string; session: string; code: string; loading: boolean }>({
    url: '',
    session: '',
    code: '',
    loading: false
  })
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  const groups = useQuery({
    queryKey: ['admin', 'groups', 'all-including-inactive'],
    queryFn: () => adminAPI.groups.getAllIncludingInactive()
  })
  const proxies = useQuery({
    queryKey: ['admin', 'proxies', 'all'],
    queryFn: () => adminAPI.proxies.getAll()
  })

  const fields = accountFormFields(form.platform, form.type, editing)
  const platformGroups = (groups.data ?? []).filter(
    (g) => g.platform === form.platform || g.platform === 'composite'
  )
  const oauthEndpoints =
    form.type === 'setup-token'
      ? {
          gen: '/admin/accounts/generate-setup-token-url',
          exchange: '/admin/accounts/exchange-setup-token-code'
        }
      : { gen: '/admin/accounts/generate-auth-url', exchange: '/admin/accounts/exchange-code' }

  const generate = async () => {
    setOauth((o) => ({ ...o, loading: true }))
    try {
      const proxy = numOrUndef(form.proxyId)
      const res = await adminAPI.accounts.generateAuthUrl(
        oauthEndpoints.gen,
        proxy ? { proxy_id: proxy } : {}
      )
      setOauth({ url: res.auth_url, session: res.session_id, code: '', loading: false })
    } catch (e) {
      setOauth((o) => ({ ...o, loading: false }))
      notifyError(e)
    }
  }

  const submit = async () => {
    let result: unknown
    if (account) {
      const built = buildUpdatePayload(account, form)
      if ('error' in built) return setError(t(built.error))
      setError('')
      result = await run(() => adminAPI.accounts.update(account.id, built.payload), {
        success: t('admin.accounts.accountUpdated'),
        fallback: t('admin.accounts.failedToUpdate')
      })
    } else {
      const built = buildCreatePayload(form)
      if ('error' in built) return setError(t(built.error))
      setError('')
      if (fields.oauthFlow) {
        if (!oauth.session || !oauth.code.trim()) return setError(t('adminUi.accounts.authCodeRequired'))
        result = await run(
          async () => {
            const proxy = numOrUndef(form.proxyId)
            const tokenInfo = await adminAPI.accounts.exchangeCode(oauthEndpoints.exchange, {
              session_id: oauth.session,
              code: oauth.code.trim(),
              ...(proxy ? { proxy_id: proxy } : {})
            })
            return adminAPI.accounts.create({ ...built.payload, credentials: { ...tokenInfo } })
          },
          { success: t('admin.accounts.accountCreated'), fallback: t('admin.accounts.failedToCreate') }
        )
      } else {
        result = await run(() => adminAPI.accounts.create(built.payload), {
          success: t('admin.accounts.accountCreated'),
          fallback: t('admin.accounts.failedToCreate')
        })
      }
    }
    if (result) onSaved()
  }

  return (
    <AdminFormDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={editing ? t('admin.accounts.editAccount') : t('admin.accounts.createAccount')}
      onSubmit={submit}
      submitting={busy}
      submitText={editing ? t('common.update') : t('common.create')}
      size="xl"
    >
      <div className="grid gap-4 sm:grid-cols-2" data-testid="account-form">
        <FormField label={t('admin.accounts.columns.name')} required error={error}>
          <Input value={form.name} onChange={(e) => set('name', e.target.value)} autoComplete="off" />
        </FormField>
        <FormField label={t('admin.accounts.columns.platform')}>
          <NativeSelect
            value={form.platform}
            disabled={editing}
            onChange={(e) => {
              const platform = e.target.value
              setForm((f) => ({ ...f, platform, type: accountTypeOptions(platform)[0], groupIds: [] }))
            }}
          >
            {CONCRETE_PLATFORM_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField label={t('admin.accounts.columns.type')}>
          <NativeSelect
            value={form.type}
            disabled={editing}
            onChange={(e) => set('type', e.target.value as AccountType)}
          >
            {accountTypeOptions(form.platform).map((type) => (
              <option key={type} value={type}>
                {t(`adminUi.accounts.type.${type === 'setup-token' ? 'setupToken' : type}`)}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField label={t('admin.accounts.columns.proxy')}>
          <NativeSelect value={form.proxyId} onChange={(e) => set('proxyId', e.target.value)}>
            <option value="">{t('common.none')}</option>
            {(proxies.data ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </NativeSelect>
        </FormField>

        {fields.baseUrl ? (
          <FormField label={t('admin.accounts.baseUrl')} className="sm:col-span-2">
            <Input
              value={form.baseUrl}
              onChange={(e) => set('baseUrl', e.target.value)}
              placeholder="https://"
            />
          </FormField>
        ) : null}
        {fields.apiKey ? (
          <FormField
            label={t('admin.accounts.apiKey')}
            required={!editing}
            description={editing ? t('admin.accounts.leaveEmptyToKeep') : undefined}
            className="sm:col-span-2"
          >
            <PasswordInput
              value={form.apiKey}
              onChange={(e) => set('apiKey', e.target.value)}
              autoComplete="off"
            />
          </FormField>
        ) : null}
        {fields.credentialsJson ? (
          <FormField
            label={t('adminUi.accounts.credentialsJson')}
            description={t('adminUi.accounts.credentialsJsonHint')}
            className="sm:col-span-2"
          >
            <Textarea
              rows={6}
              className="font-mono"
              value={form.credentialsJson}
              onChange={(e) => set('credentialsJson', e.target.value)}
              spellCheck={false}
            />
          </FormField>
        ) : null}
        {fields.oauthFlow && !editing ? (
          <div className="space-y-3 rounded-md border bg-muted/30 p-3 sm:col-span-2">
            <Button type="button" variant="outline" loading={oauth.loading} onClick={() => void generate()}>
              <ExternalLink aria-hidden />
              {t('admin.accounts.oauth.generateAuthUrl')}
            </Button>
            {oauth.url ? (
              <>
                <a
                  href={oauth.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block break-all text-sm text-primary underline"
                >
                  {oauth.url}
                </a>
                <FormField label={t('admin.accounts.oauth.authCode')}>
                  <Input
                    value={oauth.code}
                    onChange={(e) => setOauth((o) => ({ ...o, code: e.target.value }))}
                    autoComplete="off"
                  />
                </FormField>
              </>
            ) : null}
          </div>
        ) : null}

        <FormField label={t('admin.accounts.concurrency')}>
          <Input
            type="number"
            min={1}
            value={form.concurrency}
            onChange={(e) => set('concurrency', e.target.value)}
          />
        </FormField>
        <FormField label={t('admin.accounts.columns.priority')}>
          <Input
            type="number"
            min={1}
            value={form.priority}
            onChange={(e) => set('priority', e.target.value)}
          />
        </FormField>
        <FormField label={t('admin.accounts.loadFactor')}>
          <Input
            type="number"
            min={1}
            value={form.loadFactor}
            onChange={(e) => set('loadFactor', e.target.value)}
            placeholder={t('adminUi.accounts.loadFactorPlaceholder')}
          />
        </FormField>
        <FormField label={t('admin.accounts.billingRateMultiplier')}>
          <Input
            type="number"
            min={0}
            step="0.01"
            value={form.rateMultiplier}
            onChange={(e) => set('rateMultiplier', e.target.value)}
          />
        </FormField>
        <FormField label={t('admin.accounts.expiresAt')}>
          <Input
            type="datetime-local"
            value={form.expiresAt}
            onChange={(e) => set('expiresAt', e.target.value)}
          />
        </FormField>
        <label className="flex items-center gap-2 self-end pb-2 text-sm">
          <Switch checked={form.autoPauseOnExpired} onCheckedChange={(v) => set('autoPauseOnExpired', v)} />
          {t('admin.accounts.autoPauseOnExpired')}
        </label>
        {editing ? (
          <>
            <FormField label={t('admin.accounts.columns.status')}>
              <NativeSelect
                value={form.status}
                onChange={(e) => set('status', e.target.value as 'active' | 'inactive')}
              >
                <option value="active">{t('admin.accounts.status.active')}</option>
                <option value="inactive">{t('admin.accounts.status.inactive')}</option>
              </NativeSelect>
            </FormField>
            <label className="flex items-center gap-2 self-end pb-2 text-sm">
              <Switch checked={form.schedulable} onCheckedChange={(v) => set('schedulable', v)} />
              {t('admin.accounts.schedulable')}
            </label>
          </>
        ) : null}
        <FormField label={t('admin.accounts.columns.groups')} className="sm:col-span-2">
          {platformGroups.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('common.noGroupsAvailable')}</p>
          ) : (
            <div className="flex max-h-32 flex-wrap gap-x-4 gap-y-2 overflow-y-auto rounded-md border p-2">
              {platformGroups.map((g) => (
                <label key={g.id} className="flex items-center gap-1.5 text-sm">
                  <Checkbox
                    checked={form.groupIds.includes(g.id)}
                    onCheckedChange={(v) =>
                      set(
                        'groupIds',
                        v === true ? [...form.groupIds, g.id] : form.groupIds.filter((x) => x !== g.id)
                      )
                    }
                  />
                  {g.name}
                </label>
              ))}
            </div>
          )}
        </FormField>
        <FormField label={t('admin.accounts.notes')} className="sm:col-span-2">
          <Textarea
            rows={2}
            value={form.notes}
            onChange={(e) => set('notes', e.target.value)}
            placeholder={t('admin.accounts.notesPlaceholder')}
          />
        </FormField>
      </div>
    </AdminFormDialog>
  )
}
