/** 系统设置·安全：管理员 API Key（旧）、管理员访问密钥、注册邮箱黑名单。 */
import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { Copy, Plus, RefreshCw } from 'lucide-react'
import { adminAPI } from '@/api/admin'
import * as keysApi from '@/api/admin/adminAccessKeys'
import type { AccessRule, AdminKey, AdminKeyInput, Permission } from '@/api/admin/adminAccessKeys'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { StatusBadge } from '@/components/StatusBadge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input, Textarea } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { AdminFormDialog } from '@/features/admin/common/AdminFormDialog'
import { notifyError, notifySuccess } from '@/features/admin/common/notify'
import { TotpStepUpDialog } from '@/features/auth/TotpStepUpDialog'
import { copyText } from '@/hooks/useClipboard'
import { isStepUpBlocked, isStepUpCancelled, stepUpBlockReason, useStepUp } from '@/hooks/useStepUp'
import { t } from '@/i18n'
import { CONCRETE_PLATFORM_OPTIONS } from '@/constants/platforms'
import { useAppStore } from '@/stores/app'
import { extractApiErrorMessage } from '@/utils/apiError'
import { AddButton, LabeledField, SwitchRow } from './settingsUi'

const A = (k: string, p?: Record<string, unknown>) => t(`adminAccessKeys.${k}`, p)
const S = (k: string, p?: Record<string, unknown>) => t(`admin.settings.${k}`, p)

/* ------------------------------ 旧版管理员 API Key ------------------------------ */
export function AdminApiKeyPanel() {
  const stepUp = useStepUp()
  const q = useQuery({
    queryKey: ['admin', 'settings', 'admin-api-key'],
    queryFn: () => adminAPI.settings.getAdminApiKey()
  })
  const [fresh, setFresh] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [confirm, setConfirm] = React.useState<'regen' | 'delete' | null>(null)
  const status = q.data
  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    try {
      await stepUp.run(fn)
    } catch (e) {
      if (isStepUpCancelled(e)) return
      if (isStepUpBlocked(e)) {
        useAppStore
          .getState()
          .showError(
            stepUpBlockReason(e) === 'STEP_UP_ADMIN_API_KEY_FORBIDDEN'
              ? t('stepUp.adminApiKeyForbidden')
              : t('stepUp.notEnabled')
          )
        return
      }
      useAppStore.getState().showError(extractApiErrorMessage(e, t('common.error')))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="grid gap-3 rounded-md border p-4">
      {q.isLoading ? (
        <Skeleton className="h-10" />
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm">
              <StatusBadge status={status?.exists ? 'success' : 'neutral'}>
                {status?.exists ? S('adminApiKey.configured') : S('adminApiKey.notConfigured')}
              </StatusBadge>
              {status?.exists ? (
                <span className="ml-2 font-mono text-xs">
                  {S('adminApiKey.currentKey')}: {status.masked_key}
                </span>
              ) : null}
            </div>
            <div className="flex gap-2">
              {status?.exists ? (
                <>
                  <Button size="sm" variant="outline" loading={busy} onClick={() => setConfirm('regen')}>
                    {busy ? S('adminApiKey.regenerating') : S('adminApiKey.regenerate')}
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={busy}
                    onClick={() => setConfirm('delete')}
                  >
                    {S('adminApiKey.delete')}
                  </Button>
                </>
              ) : (
                <Button
                  size="sm"
                  loading={busy}
                  onClick={() =>
                    void run(async () => {
                      const r = await adminAPI.settings.regenerateAdminApiKey()
                      setFresh(r.key)
                      void q.refetch()
                      notifySuccess(S('adminApiKey.keyGenerated'))
                    })
                  }
                >
                  {busy ? S('adminApiKey.creating') : S('adminApiKey.create')}
                </Button>
              )}
            </div>
          </div>
          {fresh ? (
            <div
              role="status"
              className="grid gap-2 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm"
            >
              <p className="text-xs">{S('adminApiKey.keyWarning')}</p>
              <div className="flex items-center gap-2">
                <code className="min-w-0 flex-1 text-xs break-all">{fresh}</code>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    if (await copyText(fresh)) notifySuccess(S('adminApiKey.keyCopied'))
                  }}
                >
                  <Copy aria-hidden />
                  {S('adminApiKey.copyKey')}
                </Button>
              </div>
            </div>
          ) : null}
          <p className="text-xs text-muted-foreground">
            {S('adminApiKey.securityWarning')} {S('adminApiKey.usage')}
          </p>
        </>
      )}
      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={confirm === 'delete' ? S('adminApiKey.delete') : S('adminApiKey.regenerate')}
        description={
          confirm === 'delete' ? S('adminApiKey.deleteConfirm') : S('adminApiKey.regenerateConfirm')
        }
        destructive
        onConfirm={() => {
          const c = confirm
          setConfirm(null)
          if (c === 'regen')
            void run(async () => {
              const r = await adminAPI.settings.regenerateAdminApiKey()
              setFresh(r.key)
              void q.refetch()
              notifySuccess(S('adminApiKey.keyGenerated'))
            })
          else
            void run(async () => {
              await adminAPI.settings.deleteAdminApiKey()
              setFresh('')
              void q.refetch()
              notifySuccess(S('adminApiKey.keyDeleted'))
            })
        }}
      />
      <TotpStepUpDialog controller={stepUp} />
    </div>
  )
}

/* ------------------------------ 管理员访问密钥 ------------------------------ */
const ACCOUNT_TYPES = ['oauth', 'setup-token', 'apikey', 'upstream', 'bedrock', 'service_account']
const permKey = (p: Permission) => p.id.replace(/_/g, '_u').replace(/\./g, '_d')
// 权限 ID 是稳定协议；后端标签可能始终是中文，不作为本地化回退值
const permLabel = (p: Permission) => {
  const k = `adminAccessKeys.permissions.${permKey(p)}.label`
  const v = t(k)
  return v === k ? A('unknownPermission', { id: p.id }) : v
}
const permCategory = (p: Permission) => {
  const k = `adminAccessKeys.permissions.${permKey(p)}.category`
  const v = t(k)
  return v === k ? A('other') : v
}
const emptyRule = (): AccessRule => ({
  permissions: [],
  group_ids: [],
  all_groups: false,
  include_ungrouped: false,
  account_types: [],
  platforms: []
})
// Go 的空切片可能序列化为 null；统一为空数组且不增加任何授权
const normalizeKey = (item: AdminKey): AdminKey => ({
  ...item,
  allowed_ips: item.allowed_ips ?? [],
  policy: {
    full_access: item.policy?.full_access ?? false,
    global_permissions: item.policy?.global_permissions ?? [],
    rules: (item.policy?.rules ?? []).map((r) => ({
      ...r,
      permissions: r.permissions ?? [],
      group_ids: r.group_ids ?? [],
      account_types: r.account_types ?? [],
      platforms: r.platforms ?? []
    }))
  }
})

export function AdminAccessKeysPanel() {
  const stepUp = useStepUp()
  const [now] = React.useState(() => Date.now())
  const [items, setItems] = React.useState<AdminKey[]>([])
  const [perms, setPerms] = React.useState<Permission[]>([])
  const [groups, setGroups] = React.useState<{ id: number; name: string }[]>([])
  const [loaded, setLoaded] = React.useState(false)
  const [loading, setLoading] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [secret, setSecret] = React.useState('')
  const [draft, setDraft] = React.useState<{
    id: string
    input: AdminKeyInput
    expiration: string
    initialExpiration: string
    ips: string
    fullConfirmed: boolean
  } | null>(null)
  const [phrasePrompt, setPhrasePrompt] = React.useState(false)
  const [phrase, setPhrase] = React.useState('')
  const [confirm, setConfirm] = React.useState<{
    kind: 'rotate' | 'revoke' | 'delete'
    item: AdminKey
  } | null>(null)

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const [res, all] = await Promise.all([keysApi.list(), adminAPI.groups.getAllIncludingInactive()])
      setItems((res.items ?? []).map(normalizeKey))
      setPerms(res.permissions ?? [])
      setGroups(all ?? [])
      setLoaded(true)
    } catch (e) {
      if (!isStepUpCancelled(e)) notifyError(e, A('operationFailed'))
    } finally {
      setLoading(false)
    }
  }, [])
  const didLoad = React.useRef(false)
  React.useEffect(() => {
    if (didLoad.current) return
    didLoad.current = true
    const id = window.setTimeout(() => void load(), 0)
    return () => window.clearTimeout(id)
  }, [load])

  const replace = (item: AdminKey) =>
    setItems((list) => [normalizeKey(item), ...list.filter((k) => k.id !== item.id)])
  const mutate = async (fn: () => Promise<void>) => {
    setBusy(true)
    setSecret('')
    try {
      await stepUp.run(fn)
    } catch (e) {
      notifyError(e, A('operationFailed'))
    } finally {
      setBusy(false)
    }
  }
  const accountPerms = perms.filter((p) => p.scope === 'account')
  const groupPerms = perms.filter((p) => p.scope === 'group')
  const globalCats = React.useMemo(() => {
    const m = new Map<string, Permission[]>()
    for (const p of perms.filter((x) => x.scope === 'global'))
      m.set(permCategory(p), [...(m.get(permCategory(p)) ?? []), p])
    return [...m]
  }, [perms])

  const edit = (item?: AdminKey) => {
    const date = item?.expires_at ? new Date(item.expires_at) : null
    const exp = date
      ? new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
      : ''
    setDraft({
      id: item?.id ?? '',
      input: item
        ? structuredClone({
            name: item.name,
            description: item.description,
            enabled: item.enabled,
            expires_at: item.expires_at,
            allowed_ips: item.allowed_ips,
            policy: item.policy
          })
        : {
            name: '',
            description: '',
            enabled: true,
            expires_at: null,
            allowed_ips: [],
            policy: { rules: [emptyRule()], global_permissions: [] }
          },
      expiration: exp,
      initialExpiration: exp,
      ips: item?.allowed_ips.join('\n') ?? '',
      fullConfirmed: false
    })
  }
  const setInput = (p: Partial<AdminKeyInput>) =>
    setDraft((d) => (d ? { ...d, input: { ...d.input, ...p } } : d))
  const setRule = (i: number, p: Partial<AccessRule>) =>
    setDraft((d) =>
      d
        ? {
            ...d,
            input: {
              ...d.input,
              policy: {
                ...d.input.policy,
                rules: d.input.policy.rules.map((r, j) => (j === i ? { ...r, ...p } : r))
              }
            }
          }
        : d
    )
  const toggleIn = (arr: string[], v: string, on: boolean) => (on ? [...arr, v] : arr.filter((x) => x !== v))

  const save = async () => {
    if (!draft || busy) return
    if (!draft.input.name.trim()) return notifyError(new Error(A('nameRequired')))
    const date = draft.expiration ? new Date(draft.expiration) : null
    if (date && !Number.isFinite(date.getTime())) return notifyError(new Error(A('expirationInvalid')))
    const input: AdminKeyInput = structuredClone(draft.input)
    input.confirm_full_access = !!input.policy.full_access && draft.fullConfirmed
    input.name = input.name.trim()
    // 未修改日期时保留服务端原值，避免丢失秒数 / 时区精度
    if (draft.expiration !== draft.initialExpiration) input.expires_at = date?.toISOString() || null
    input.allowed_ips = draft.ips
      .split(/[\n,]/)
      .map((x) => x.trim())
      .filter(Boolean)
    await mutate(async () => {
      if (draft.id) replace(await keysApi.update(draft.id, input))
      else {
        const r = await keysApi.create(input)
        replace(r.item)
        setSecret(r.key)
      }
      setDraft(null)
      notifySuccess(A('saved'))
    })
  }

  const statusOf = (k: AdminKey) =>
    k.revoked_at
      ? A('statusRevoked')
      : !k.enabled
        ? A('statusDisabled')
        : k.expires_at && new Date(k.expires_at).getTime() <= now
          ? A('statusExpired')
          : A('statusEnabled')
  const ruleSummary = (r: AccessRule) => {
    const g = r.all_groups
      ? A('allGroupsSummary')
      : r.group_ids
          .map((id) => groups.find((x) => x.id === id)?.name || A('groupFallback', { id }))
          .join(A('listSeparator')) || A('noGroups')
    return A('ruleSummary', {
      groups: g + (r.include_ungrouped ? A('ungroupedSummary') : ''),
      types: r.account_types.join(A('listSeparator')) || A('noAccountTypes'),
      platforms: r.platforms.join(A('listSeparator')) || A('anyPlatform'),
      count: r.permissions.length
    })
  }
  const permCheck = (list: Permission[], selected: string[], onChange: (v: string[]) => void) => (
    <div className="grid gap-1 sm:grid-cols-2">
      {list.map((p) => (
        <label key={p.id} className="flex items-start gap-2 text-xs">
          <Checkbox
            checked={selected.includes(p.id)}
            onCheckedChange={(v) => onChange(toggleIn(selected, p.id, v === true))}
          />
          <span>
            {permLabel(p)} <span className="font-mono text-muted-foreground">{p.id}</span>
          </span>
        </label>
      ))}
    </div>
  )
  const full = draft?.input.policy.full_access ?? false

  return (
    <section aria-label={A('title')} className="grid gap-3 rounded-md border p-4">
      <div>
        <h3 className="text-sm font-semibold">{A('title')}</h3>
        <p className="text-xs text-muted-foreground">{A('authorizationHint')}</p>
        <p className="text-xs text-muted-foreground">{A('sharedAccountWarning')}</p>
      </div>
      {secret ? (
        <div
          role="status"
          className="grid gap-2 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm"
        >
          <p className="text-xs">{A('secretWarning')}</p>
          <code className="text-xs break-all">{secret}</code>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                if (await copyText(secret)) notifySuccess(A('copied'))
              }}
            >
              <Copy aria-hidden />
              {A('copySecret')}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSecret('')}>
              {A('dismissSecret')}
            </Button>
          </div>
        </div>
      ) : null}
      <div className="flex gap-2">
        <Button size="sm" disabled={busy || loading || !loaded} onClick={() => edit()}>
          <Plus aria-hidden />
          {A('create')}
        </Button>
        <Button size="sm" variant="outline" disabled={busy || loading} onClick={() => void load()}>
          <RefreshCw className={loading ? 'animate-spin' : undefined} aria-hidden />
          {A('refresh')}
        </Button>
      </div>
      {loading && !loaded ? <Skeleton className="h-16" /> : null}
      <ul className="grid gap-3">
        {items.map((it) => (
          <li key={it.id} className="grid gap-1.5 rounded-md border p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <b>{it.name}</b>
              <code className="text-xs">{it.key_prefix}…</code>
              <StatusBadge status={it.revoked_at ? 'error' : it.enabled ? 'success' : 'neutral'}>
                {statusOf(it)}
              </StatusBadge>
              {it.policy.full_access ? <Badge variant="secondary">{A('legacy')}</Badge> : null}
            </div>
            <p className="text-xs text-muted-foreground">
              {it.description || A('noDescription')} · {A('expires', { value: it.expires_at || A('never') })}{' '}
              · {A('lastUsed', { value: it.last_used_at || A('neverUsed') })} {it.last_used_ip}
            </p>
            <div aria-label={A('summaryLabel')} className="text-xs">
              {it.policy.full_access ? <p className="text-warning">{A('fullAccessLabel')}</p> : null}
              <p>
                {A('summary', {
                  globals: it.policy.global_permissions.length,
                  rules: it.policy.rules.length
                })}
              </p>
              {it.policy.rules.map((r, i) => (
                <p key={i} className="text-muted-foreground">
                  {A('ruleLine', { index: i + 1, summary: ruleSummary(r) })}
                </p>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {!it.revoked_at ? (
                <>
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => edit(it)}>
                    {A('editPermissions')}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() =>
                      void mutate(async () => {
                        replace(
                          await keysApi.update(it.id, {
                            name: it.name,
                            description: it.description,
                            enabled: !it.enabled,
                            expires_at: it.expires_at,
                            allowed_ips: it.allowed_ips,
                            policy: it.policy
                          })
                        )
                        notifySuccess(A('statusUpdated'))
                      })
                    }
                  >
                    {it.enabled ? A('disable') : A('enable')}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => setConfirm({ kind: 'rotate', item: it })}
                  >
                    {A('rotate')}
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={busy}
                    onClick={() => setConfirm({ kind: 'revoke', item: it })}
                  >
                    {A('revoke')}
                  </Button>
                </>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => setConfirm({ kind: 'delete', item: it })}
                >
                  {A('deleteRecord')}
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>

      <AdminFormDialog
        open={draft !== null}
        onOpenChange={(o) => !o && !busy && setDraft(null)}
        title={draft?.id ? A('editTitle') : A('createTitle')}
        size="xl"
        onSubmit={save}
        submitting={busy}
        submitDisabled={phrasePrompt}
        submitText={A('save')}
      >
        {draft ? (
          <div className="grid gap-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <LabeledField label={A('name')}>
                <Input
                  maxLength={100}
                  value={draft.input.name}
                  onChange={(e) => setInput({ name: e.target.value })}
                />
              </LabeledField>
              <LabeledField label={A('expiration')}>
                <Input
                  type="datetime-local"
                  value={draft.expiration}
                  onChange={(e) => setDraft({ ...draft, expiration: e.target.value })}
                />
              </LabeledField>
              <LabeledField label={A('description')} className="sm:col-span-2">
                <Textarea
                  rows={2}
                  maxLength={1000}
                  value={draft.input.description}
                  onChange={(e) => setInput({ description: e.target.value })}
                />
              </LabeledField>
              <LabeledField label={A('allowedIps')} className="sm:col-span-2">
                <Textarea
                  rows={3}
                  className="font-mono text-xs"
                  placeholder={'192.0.2.1\n2001:db8::/32'}
                  value={draft.ips}
                  onChange={(e) => setDraft({ ...draft, ips: e.target.value })}
                />
              </LabeledField>
            </div>
            <SwitchRow
              label={A('enabled')}
              checked={draft.input.enabled}
              onChange={(v) => setInput({ enabled: v })}
            />
            <div className="grid gap-1 rounded-md border border-warning/40 p-3">
              <label className="flex items-center gap-2 text-sm font-medium">
                <Checkbox
                  checked={full || phrasePrompt}
                  disabled={busy}
                  onCheckedChange={(v) => {
                    if (v === true) {
                      setPhrase('')
                      setPhrasePrompt(true)
                    } else
                      setDraft({
                        ...draft,
                        fullConfirmed: false,
                        input: { ...draft.input, policy: { ...draft.input.policy, full_access: false } }
                      })
                  }}
                />
                {A('fullAccessLabel')}
              </label>
              <p className="text-xs text-muted-foreground">{A('fullAccessWarning')}</p>
              {full ? <p className="text-xs text-warning">{A('rulesSuspended')}</p> : null}
            </div>
            <fieldset disabled={busy || full} className="grid gap-4 disabled:opacity-60">
              {draft.input.policy.rules.map((r, i) => (
                <fieldset key={i} className="grid gap-3 rounded-md border p-3">
                  <legend className="px-1 text-xs font-medium">{A('ruleLegend', { index: i + 1 })}</legend>
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={r.all_groups}
                      onCheckedChange={(v) => setRule(i, { all_groups: v === true })}
                    />
                    {A('allGroups')}
                  </label>
                  <LabeledField label={A('groups')}>
                    <select
                      multiple
                      disabled={r.all_groups}
                      className="min-h-24 rounded-md border bg-card p-1 text-sm"
                      value={r.group_ids.map(String)}
                      onChange={(e) =>
                        setRule(i, {
                          group_ids: Array.from(e.target.selectedOptions, (o) => Number(o.value))
                        })
                      }
                    >
                      {groups.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.name}
                        </option>
                      ))}
                    </select>
                  </LabeledField>
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={r.include_ungrouped}
                      onCheckedChange={(v) => setRule(i, { include_ungrouped: v === true })}
                    />
                    {A('includeUngrouped')}
                  </label>
                  <div className="grid gap-1">
                    <span className="text-xs">{A('accountTypes')}</span>
                    <div className="flex flex-wrap gap-3">
                      {ACCOUNT_TYPES.map((ty) => (
                        <label key={ty} className="flex items-center gap-1.5 text-xs">
                          <Checkbox
                            checked={r.account_types.includes(ty)}
                            onCheckedChange={(v) =>
                              setRule(i, { account_types: toggleIn(r.account_types, ty, v === true) })
                            }
                          />
                          {ty}
                        </label>
                      ))}
                    </div>
                  </div>
                  <LabeledField label={A('platforms')}>
                    <select
                      multiple
                      className="min-h-24 rounded-md border bg-card p-1 text-sm"
                      value={r.platforms}
                      onChange={(e) =>
                        setRule(i, { platforms: Array.from(e.target.selectedOptions, (o) => o.value) })
                      }
                    >
                      {CONCRETE_PLATFORM_OPTIONS.map((p) => (
                        <option key={p.value} value={p.value}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                  </LabeledField>
                  <div className="grid gap-1">
                    <span className="text-xs">{A('accountOperations')}</span>
                    {permCheck(accountPerms, r.permissions, (v) => setRule(i, { permissions: v }))}
                  </div>
                  {groupPerms.length ? (
                    <div className="grid gap-1">
                      <span className="text-xs">{A('groupOperations')}</span>
                      <p className="text-xs text-muted-foreground">{A('modelAllowlistHint')}</p>
                      {permCheck(groupPerms, r.permissions, (v) => setRule(i, { permissions: v }))}
                    </div>
                  ) : null}
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="justify-self-start"
                    onClick={() =>
                      setDraft({
                        ...draft,
                        input: {
                          ...draft.input,
                          policy: {
                            ...draft.input.policy,
                            rules: draft.input.policy.rules.filter((_, j) => j !== i)
                          }
                        }
                      })
                    }
                  >
                    {A('removeRule')}
                  </Button>
                </fieldset>
              ))}
              <AddButton
                onClick={() =>
                  setDraft({
                    ...draft,
                    input: {
                      ...draft.input,
                      policy: { ...draft.input.policy, rules: [...draft.input.policy.rules, emptyRule()] }
                    }
                  })
                }
              >
                {A('addRule')}
              </AddButton>
              <fieldset className="grid gap-3 rounded-md border p-3">
                <legend className="px-1 text-xs font-medium">{A('globalPermissions')}</legend>
                {globalCats.map(([name, list]) => (
                  <div key={name} className="grid gap-1">
                    <b className="text-xs">{name}</b>
                    {permCheck(list, draft.input.policy.global_permissions, (v) =>
                      setDraft({
                        ...draft,
                        input: { ...draft.input, policy: { ...draft.input.policy, global_permissions: v } }
                      })
                    )}
                  </div>
                ))}
              </fieldset>
            </fieldset>
          </div>
        ) : null}
      </AdminFormDialog>

      <AdminFormDialog
        open={phrasePrompt}
        onOpenChange={(o) => !o && (setPhrasePrompt(false), setPhrase(''))}
        title={A('fullAccessConfirmTitle')}
        size="md"
        submitText={A('fullAccessConfirmTitle')}
        submitDisabled={phrase !== A('fullAccessPhrase')}
        onSubmit={() => {
          if (!draft || phrase !== A('fullAccessPhrase')) return
          setDraft({
            ...draft,
            fullConfirmed: true,
            input: { ...draft.input, policy: { ...draft.input.policy, full_access: true } }
          })
          setPhrasePrompt(false)
          setPhrase('')
        }}
      >
        <p className="text-sm">{A('fullAccessWarning')}</p>
        <LabeledField label={A('fullAccessPhraseHint', { phrase: A('fullAccessPhrase') })}>
          <Input autoComplete="off" value={phrase} onChange={(e) => setPhrase(e.target.value)} />
        </LabeledField>
      </AdminFormDialog>

      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={
          confirm
            ? A(confirm.kind === 'rotate' ? 'rotate' : confirm.kind === 'revoke' ? 'revoke' : 'deleteRecord')
            : ''
        }
        description={
          confirm
            ? A(
                confirm.kind === 'rotate'
                  ? 'rotateConfirm'
                  : confirm.kind === 'revoke'
                    ? 'revokeConfirm'
                    : 'deleteConfirm',
                { name: confirm.item.name }
              )
            : ''
        }
        destructive
        onConfirm={() => {
          const c = confirm
          setConfirm(null)
          if (!c) return
          const it = c.item
          if (c.kind === 'rotate')
            void mutate(async () => {
              const r = await keysApi.rotate(it.id)
              replace(r.item)
              setSecret(r.key)
              notifySuccess(A('rotated'))
            })
          else if (c.kind === 'revoke')
            void mutate(async () => {
              await keysApi.revoke(it.id)
              replace({ ...it, enabled: false, revoked_at: new Date().toISOString() })
              notifySuccess(A('revoked'))
            })
          else
            void mutate(async () => {
              await keysApi.deleteRecord(it.id)
              setItems((l) => l.filter((k) => k.id !== it.id))
              notifySuccess(A('removed'))
            })
        }}
      />
      <TotpStepUpDialog controller={stepUp} />
    </section>
  )
}

/* ------------------------------ 注册邮箱黑名单 ------------------------------ */
export function EmailBlacklistPanel() {
  const [open, setOpen] = React.useState(false)
  const q = useQuery({
    queryKey: ['admin', 'settings', 'email-blacklist'],
    queryFn: () => adminAPI.settings.getRegistrationEmailBlacklist(),
    refetchOnWindowFocus: false
  })
  const [text, setText] = React.useState('')
  const [saving, setSaving] = React.useState(false)
  const parsed = React.useMemo(
    () =>
      Array.from(
        new Set(
          text
            .split(/[\s,;]+/)
            .map((s) => s.trim().toLowerCase())
            .filter(Boolean)
        )
      ),
    [text]
  )
  const max = q.data?.max ?? 0
  const count = q.data?.emails.length ?? 0
  const save = async () => {
    setSaving(true)
    try {
      await adminAPI.settings.updateRegistrationEmailBlacklist(parsed)
      notifySuccess(S('registration.emailBlacklist.saved'))
      void q.refetch()
      setOpen(false)
    } catch (e) {
      notifyError(e, S('registration.emailBlacklist.loadFailed'))
    } finally {
      setSaving(false)
    }
  }
  return (
    <div className="grid gap-2 rounded-md border p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="text-sm font-medium">{S('registration.emailBlacklist.title')}</h4>
          <p className="text-xs text-muted-foreground">{S('registration.emailBlacklist.hint')}</p>
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled={!q.data}
          onClick={() => {
            setText((q.data?.emails ?? []).join('\n'))
            setOpen(true)
          }}
        >
          {S('registration.emailBlacklist.edit')}
        </Button>
      </div>
      {q.error ? (
        <p className="text-xs text-destructive">{S('registration.emailBlacklist.loadFailed')}</p>
      ) : (
        <p className="text-xs">{S('registration.emailBlacklist.count', { count })}</p>
      )}
      <AdminFormDialog
        open={open}
        onOpenChange={(o) => !saving && setOpen(o)}
        title={S('registration.emailBlacklist.editorTitle')}
        size="lg"
        onSubmit={save}
        submitting={saving}
        submitDisabled={parsed.length > max && max > 0}
      >
        <LabeledField
          label={S('registration.emailBlacklist.listLabel')}
          hint={`${parsed.length}${max ? ` / ${max}` : ''}${parsed.length > max && max > 0 ? ` — ${S('registration.emailBlacklist.tooMany')}` : ''}`}
        >
          <Textarea
            rows={12}
            className="font-mono text-xs"
            placeholder={S('registration.emailBlacklist.bulkPlaceholder')}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </LabeledField>
      </AdminFormDialog>
    </div>
  )
}
