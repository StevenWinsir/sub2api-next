/** 个人资料页的卡片：基本信息（头像 / 用户名）、修改密码、余额提醒。 */
import * as React from 'react'
import { Camera, Mail, Plus, Trash2 } from 'lucide-react'
import { userAPI } from '@/api/user'
import { FormField } from '@/components/FormField'
import { PasswordInput } from '@/components/PasswordInput'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { t } from '@/i18n'
import { useAppStore } from '@/stores/app'
import { useAuthStore } from '@/stores/auth'
import type { NotifyEmailEntry, User, UserAuthProvider } from '@/types'
import { extractApiErrorMessage } from '@/utils/apiError'
import { isImageDataUrl, prepareAvatarUpload, readFileAsDataURL } from './avatar'
import { displayableEmail, resolveThirdPartySource } from './bindings'

const notify = {
  success: (m: string) => useAppStore.getState().showSuccess(m),
  error: (m: string) => useAppStore.getState().showError(m)
}

/* ───────────── 基本信息 ───────────── */

function AvatarEditor({ user }: { user: User | null }) {
  const [draft, setDraft] = React.useState('')
  const [saving, setSaving] = React.useState(false)
  const [prevUrl, setPrevUrl] = React.useState(user?.avatar_url)
  if (prevUrl !== user?.avatar_url) {
    setPrevUrl(user?.avatar_url)
    setDraft('')
  }
  const name = user?.username?.trim() || user?.email?.trim() || t('profile.user')
  const preview = draft.trim() || user?.avatar_url?.trim() || ''

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target
    const file = input.files?.[0]
    input.value = ''
    if (!file) return
    try {
      const prepared = await prepareAvatarUpload(file)
      const dataUrl = (await readFileAsDataURL(prepared)).trim()
      if (!isImageDataUrl(dataUrl)) return notify.error(t('profile.avatar.uploadRequired'))
      setDraft(dataUrl)
    } catch (error) {
      notify.error(extractApiErrorMessage(error, t('common.error')))
    }
  }
  const save = async () => {
    if (!isImageDataUrl(draft)) return notify.error(t('profile.avatar.uploadRequired'))
    setSaving(true)
    try {
      const updated = await userAPI.updateProfile({ avatar_url: draft.trim() })
      useAuthStore.getState().setUser(updated)
      setDraft(updated.avatar_url?.trim() || '')
      notify.success(t('profile.avatar.saveSuccess'))
    } catch (error) {
      notify.error(extractApiErrorMessage(error, t('common.error')))
    } finally {
      setSaving(false)
    }
  }
  const remove = async () => {
    if (saving) return
    if (!draft.trim() && !user?.avatar_url?.trim()) return notify.error(t('profile.avatar.emptyDeleteHint'))
    setSaving(true)
    try {
      const updated = await userAPI.updateProfile({ avatar_url: '' })
      useAuthStore.getState().setUser(updated)
      setDraft('')
      notify.success(t('profile.avatar.deleteSuccess'))
    } catch (error) {
      notify.error(extractApiErrorMessage(error, t('common.error')))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
      <Avatar className="size-20">
        {preview ? <AvatarImage src={preview} alt="" /> : null}
        <AvatarFallback className="text-2xl">{name.charAt(0).toUpperCase() || 'U'}</AvatarFallback>
      </Avatar>
      <div className="space-y-2">
        <p className="text-sm font-medium">{t('profile.avatar.title')}</p>
        <p className="text-xs text-muted-foreground">{t('profile.avatar.description')}</p>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <label className="cursor-pointer">
              <Camera aria-hidden />
              {t('profile.avatar.uploadAction')}
              <input type="file" accept="image/*" className="sr-only" onChange={(e) => void onFile(e)} />
            </label>
          </Button>
          {draft ? (
            <Button size="sm" loading={saving} onClick={() => void save()}>
              {t('common.save')}
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive hover:text-destructive"
            disabled={saving}
            onClick={() => void remove()}
          >
            <Trash2 aria-hidden />
            {t('common.delete')}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">{t('profile.avatar.uploadHint')}</p>
      </div>
    </div>
  )
}

function UsernameForm({ initialUsername }: { initialUsername: string }) {
  const [username, setUsername] = React.useState(initialUsername)
  const [saved, setSaved] = React.useState(initialUsername)
  const [loading, setLoading] = React.useState(false)
  // 外部用户名变化（如刷新资料）时，若输入框未被改动则同步
  if (initialUsername !== saved) {
    if (username === saved) setUsername(initialUsername)
    setSaved(initialUsername)
  }
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!username.trim()) return notify.error(t('profile.usernameRequired'))
    setLoading(true)
    const submitted = username
    try {
      const updated = await userAPI.updateProfile({ username: submitted })
      if (username === submitted) setUsername(updated.username)
      setSaved(updated.username)
      useAuthStore.getState().setUser(updated)
      notify.success(t('profile.updateSuccess'))
    } catch (error) {
      notify.error(extractApiErrorMessage(error, t('profile.updateFailed')))
    } finally {
      setLoading(false)
    }
  }
  return (
    <form onSubmit={submit} className="space-y-3">
      <FormField label={t('profile.username')}>
        <Input
          value={username}
          placeholder={t('profile.enterUsername')}
          onChange={(e) => setUsername(e.target.value)}
        />
      </FormField>
      <Button type="submit" loading={loading}>
        {loading ? t('profile.updating') : t('profile.updateProfile')}
      </Button>
    </form>
  )
}

export function ProfileInfoCard({
  user,
  providerLabels,
  children
}: {
  user: User | null
  providerLabels: Record<UserAuthProvider, string>
  children?: React.ReactNode
}) {
  const email = displayableEmail(user)
  const name = user?.username?.trim() || user?.email?.trim() || t('profile.user')
  const since = (() => {
    const d = user?.created_at ? new Date(user.created_at) : null
    return d && !Number.isNaN(d.getTime())
      ? new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short' }).format(d)
      : '-'
  })()
  const avatarSource = resolveThirdPartySource(
    user?.profile_sources?.avatar ?? user?.avatar_source,
    providerLabels
  )
  const usernameSource = resolveThirdPartySource(
    user?.profile_sources?.username ??
      user?.profile_sources?.display_name ??
      user?.profile_sources?.nickname ??
      user?.display_name_source ??
      user?.username_source ??
      user?.nickname_source,
    providerLabels
  )
  const hints = [
    ...(avatarSource
      ? [
          {
            key: 'avatar',
            text: t('profile.authBindings.source.avatar', { providerName: avatarSource.label })
          }
        ]
      : []),
    ...(usernameSource
      ? [
          {
            key: 'username',
            text: t('profile.authBindings.source.username', { providerName: usernameSource.label })
          }
        ]
      : [])
  ]
  const fact = (label: string, value: React.ReactNode) => (
    <div className="rounded-lg border bg-muted/40 p-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="tabular mt-1 text-lg font-semibold">{value}</dd>
    </div>
  )
  return (
    <Card data-testid="profile-info-card">
      <CardContent className="space-y-6 p-6">
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold">{name}</h2>
            {email ? <p className="truncate text-sm text-muted-foreground">{email}</p> : null}
          </div>
          <Badge variant="secondary">
            {user?.role === 'admin' ? t('profile.administrator') : t('profile.user')}
          </Badge>
          <Badge variant={user?.status === 'active' ? 'success' : 'destructive'}>
            {user?.status === 'active' ? t('common.active') : t('common.disabled')}
          </Badge>
        </div>
        <dl className="grid gap-3 sm:grid-cols-3">
          {fact(t('profile.accountBalance'), `$${(user?.balance ?? 0).toFixed(2)}`)}
          {fact(t('profile.concurrencyLimit'), user?.concurrency ?? 0)}
          {fact(t('profile.memberSince'), since)}
        </dl>
        <div className="grid gap-6 border-t pt-6 md:grid-cols-2">
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold">{t('profile.basicsTitle')}</h3>
              <p className="text-xs text-muted-foreground">{t('profile.basicsDescription')}</p>
            </div>
            <AvatarEditor user={user} />
            <UsernameForm initialUsername={user?.username ?? ''} />
          </div>
          <div>{children}</div>
        </div>
        {hints.length > 0 ? (
          <div className="rounded-lg border bg-muted/40 p-4">
            <p className="text-sm font-medium">{t('profile.linkedProfileSources')}</p>
            <p className="text-xs text-muted-foreground">{t('profile.linkedProfileSourcesDescription')}</p>
            <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs text-muted-foreground">
              {hints.map((h) => (
                <li key={h.key}>{h.text}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

/* ───────────── 修改密码 ───────────── */

export function ProfilePasswordCard() {
  const [form, setForm] = React.useState({ old_password: '', new_password: '', confirm_password: '' })
  const [loading, setLoading] = React.useState(false)
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (form.new_password !== form.confirm_password) return notify.error(t('profile.passwordsNotMatch'))
    if (form.new_password.length < 8) return notify.error(t('profile.passwordTooShort'))
    setLoading(true)
    try {
      await userAPI.changePassword(form.old_password, form.new_password)
      setForm({ old_password: '', new_password: '', confirm_password: '' })
      notify.success(t('profile.passwordChangeSuccess'))
    } catch (error) {
      notify.error(extractApiErrorMessage(error, t('profile.passwordChangeFailed')))
    } finally {
      setLoading(false)
    }
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t('profile.changePassword')}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="grid max-w-md gap-4">
          <FormField label={t('profile.currentPassword')} required>
            <PasswordInput
              autoComplete="current-password"
              required
              value={form.old_password}
              onChange={(e) => setForm((f) => ({ ...f, old_password: e.target.value }))}
            />
          </FormField>
          <FormField label={t('profile.newPassword')} description={t('profile.passwordHint')} required>
            <PasswordInput
              autoComplete="new-password"
              required
              value={form.new_password}
              onChange={(e) => setForm((f) => ({ ...f, new_password: e.target.value }))}
            />
          </FormField>
          <FormField label={t('profile.confirmNewPassword')} required>
            <PasswordInput
              autoComplete="new-password"
              required
              value={form.confirm_password}
              onChange={(e) => setForm((f) => ({ ...f, confirm_password: e.target.value }))}
            />
          </FormField>
          <Button type="submit" className="w-fit" loading={loading}>
            {loading ? t('profile.changingPassword') : t('profile.changePasswordButton')}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

/* ───────────── 余额提醒 ───────────── */

const MAX_TOTAL_EMAILS = 3

/** 60 秒验证码倒计时（卸载自动清理）。 */
function useCooldown() {
  const [seconds, setSeconds] = React.useState(0)
  React.useEffect(() => {
    if (seconds <= 0) return
    const id = setInterval(() => setSeconds((s) => s - 1), 1000)
    return () => clearInterval(id)
  }, [seconds > 0]) // eslint-disable-line react-hooks/exhaustive-deps -- 仅在开始 / 结束倒计时时重建定时器
  return [seconds, setSeconds] as const
}

function PendingEmailRow({
  email,
  onDone,
  onCancel
}: {
  email: string
  onDone: () => Promise<void>
  onCancel: () => void
}) {
  const [code, setCode] = React.useState('')
  const [sent, setSent] = React.useState(false)
  const [sending, setSending] = React.useState(false)
  const [verifying, setVerifying] = React.useState(false)
  const [cooldown, setCooldown] = useCooldown()
  const send = async () => {
    setSending(true)
    try {
      await userAPI.sendNotifyEmailCode(email)
      setSent(true)
      setCooldown(60)
      notify.success(t('profile.balanceNotify.codeSent'))
    } catch (error) {
      notify.error(extractApiErrorMessage(error, t('common.error')))
    } finally {
      setSending(false)
    }
  }
  const verify = async () => {
    if (code.length !== 6) return
    setVerifying(true)
    try {
      await userAPI.verifyNotifyEmail(email, code)
      notify.success(t('profile.balanceNotify.verifySuccess'))
      await onDone()
    } catch (error) {
      notify.error(extractApiErrorMessage(error, t('common.error')))
    } finally {
      setVerifying(false)
    }
  }
  return (
    <li className="space-y-2 rounded-lg border p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-sm">{email}</span>
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="outline"
            loading={sending}
            disabled={cooldown > 0}
            onClick={() => void send()}
          >
            {cooldown > 0
              ? `${t('profile.balanceNotify.resend')} (${cooldown}s)`
              : t('profile.balanceNotify.sendCode')}
          </Button>
          <Button size="icon" variant="ghost" aria-label={t('common.cancel')} onClick={onCancel}>
            <Trash2 aria-hidden />
          </Button>
        </div>
      </div>
      {sent ? (
        <div className="flex gap-2">
          <Input
            value={code}
            inputMode="numeric"
            maxLength={6}
            placeholder={t('profile.balanceNotify.codePlaceholder')}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          />
          <Button size="sm" loading={verifying} disabled={code.length !== 6} onClick={() => void verify()}>
            {t('profile.balanceNotify.verify')}
          </Button>
        </div>
      ) : null}
    </li>
  )
}

function SavedEmailRow({ entry, onChanged }: { entry: NotifyEmailEntry; onChanged: (u: User) => void }) {
  const [verifying, setVerifying] = React.useState(false)
  const [code, setCode] = React.useState('')
  const [sending, setSending] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [cooldown, setCooldown] = useCooldown()
  const refresh = async () => {
    const updated = await userAPI.getProfile()
    useAuthStore.getState().setUser(updated)
    onChanged(updated)
  }
  const send = async () => {
    setSending(true)
    try {
      await userAPI.sendNotifyEmailCode(entry.email)
      setVerifying(true)
      setCode('')
      setCooldown(60)
      notify.success(t('profile.balanceNotify.codeSent'))
    } catch (error) {
      notify.error(extractApiErrorMessage(error, t('common.error')))
    } finally {
      setSending(false)
    }
  }
  const verify = async () => {
    if (code.length !== 6) return
    setBusy(true)
    try {
      await userAPI.verifyNotifyEmail(entry.email, code)
      setVerifying(false)
      notify.success(t('profile.balanceNotify.verifySuccess'))
      await refresh()
    } catch (error) {
      notify.error(extractApiErrorMessage(error, t('common.error')))
    } finally {
      setBusy(false)
    }
  }
  const toggle = async () => {
    try {
      const updated = await userAPI.toggleNotifyEmail(entry.email, !entry.disabled)
      useAuthStore.getState().setUser(updated)
      onChanged(updated)
    } catch (error) {
      notify.error(extractApiErrorMessage(error, t('common.error')))
    }
  }
  const remove = async () => {
    try {
      await userAPI.removeNotifyEmail(entry.email)
      notify.success(t('profile.balanceNotify.removeSuccess'))
      await refresh()
    } catch (error) {
      notify.error(extractApiErrorMessage(error, t('common.error')))
    }
  }
  return (
    <li className="space-y-2 rounded-lg border p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2 text-sm">
          <Mail className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <span className="truncate">{entry.email}</span>
          <Badge variant={entry.verified ? 'success' : 'warning'}>
            {entry.verified ? t('profile.balanceNotify.verified') : t('profile.balanceNotify.unverified')}
          </Badge>
        </span>
        <div className="flex items-center gap-1">
          {entry.verified ? (
            <Switch
              checked={!entry.disabled}
              onCheckedChange={() => void toggle()}
              aria-label={entry.email}
            />
          ) : (
            <Button
              size="sm"
              variant="outline"
              loading={sending}
              disabled={cooldown > 0}
              onClick={() => void send()}
            >
              {cooldown > 0
                ? `${t('profile.balanceNotify.resend')} (${cooldown}s)`
                : t('profile.balanceNotify.sendCode')}
            </Button>
          )}
          <Button
            size="icon"
            variant="ghost"
            aria-label={t('profile.balanceNotify.removeEmail')}
            onClick={() => void remove()}
          >
            <Trash2 aria-hidden />
          </Button>
        </div>
      </div>
      {verifying ? (
        <div className="flex gap-2">
          <Input
            value={code}
            inputMode="numeric"
            maxLength={6}
            placeholder={t('profile.balanceNotify.codePlaceholder')}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          />
          <Button size="sm" loading={busy} disabled={code.length !== 6} onClick={() => void verify()}>
            {t('profile.balanceNotify.verify')}
          </Button>
        </div>
      ) : null}
    </li>
  )
}

export function ProfileBalanceNotifyCard({
  user,
  systemDefaultThreshold
}: {
  user: User
  systemDefaultThreshold: number
}) {
  const [enabled, setEnabled] = React.useState(user.balance_notify_enabled ?? true)
  const [threshold, setThreshold] = React.useState<number | null>(user.balance_notify_threshold ?? null)
  const [entries, setEntries] = React.useState<NotifyEmailEntry[]>(user.balance_notify_extra_emails ?? [])
  const [pending, setPending] = React.useState<string[]>([])
  const [newEmail, setNewEmail] = React.useState(() =>
    (user.balance_notify_extra_emails ?? []).length === 0 ? user.email : ''
  )
  const [saving, setSaving] = React.useState(false)
  const canAddMore = entries.length + pending.length < MAX_TOTAL_EMAILS

  const toggle = async (next: boolean) => {
    setEnabled(next)
    try {
      useAuthStore.getState().setUser(await userAPI.updateProfile({ balance_notify_enabled: next }))
    } catch (error) {
      notify.error(extractApiErrorMessage(error, t('common.error')))
      setEnabled(!next)
    }
  }
  const saveThreshold = async () => {
    setSaving(true)
    try {
      useAuthStore.getState().setUser(
        await userAPI.updateProfile({
          balance_notify_threshold: threshold && threshold > 0 ? threshold : 0
        })
      )
      notify.success(t('common.saved'))
    } catch (error) {
      notify.error(extractApiErrorMessage(error, t('common.error')))
    } finally {
      setSaving(false)
    }
  }
  const addPending = () => {
    const email = newEmail.trim()
    if (!email) return
    const lower = email.toLowerCase()
    if (
      entries.some((e) => e.email.toLowerCase() === lower) ||
      pending.some((p) => p.toLowerCase() === lower)
    )
      return notify.error(t('profile.balanceNotify.emailDuplicate'))
    setPending((p) => [...p, email])
    setNewEmail('')
  }
  const reloadFromServer = async (email: string) => {
    const updated = await userAPI.getProfile()
    useAuthStore.getState().setUser(updated)
    setEntries([...(updated.balance_notify_extra_emails ?? [])])
    setPending((p) => p.filter((x) => x !== email))
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t('profile.balanceNotify.title')}</CardTitle>
        <CardDescription>{t('profile.balanceNotify.description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center justify-between rounded-lg border p-3">
          <span className="text-sm font-medium">{t('profile.balanceNotify.enabled')}</span>
          <Switch
            checked={enabled}
            onCheckedChange={(v) => void toggle(v)}
            aria-label={t('profile.balanceNotify.enabled')}
          />
        </div>
        {enabled ? (
          <>
            <div className="space-y-1.5">
              <FormField
                label={t('profile.balanceNotify.threshold')}
                description={`${t('profile.balanceNotify.thresholdHint')} ${t('profile.balanceNotify.systemDefault', { threshold: systemDefaultThreshold })}`}
              >
                <div className="flex max-w-sm gap-2">
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={threshold ?? ''}
                    placeholder={t('profile.balanceNotify.thresholdPlaceholder')}
                    onChange={(e) => setThreshold(e.target.value === '' ? null : Number(e.target.value))}
                  />
                  <Button loading={saving} onClick={() => void saveThreshold()}>
                    {t('common.save')}
                  </Button>
                </div>
              </FormField>
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">{t('profile.balanceNotify.extraEmails')}</p>
              <p className="text-xs text-muted-foreground">{t('profile.balanceNotify.extraEmailsHint')}</p>
              <ul className="space-y-2">
                {entries.map((e) => (
                  <SavedEmailRow
                    key={e.email}
                    entry={e}
                    onChanged={(u) => setEntries([...(u.balance_notify_extra_emails ?? [])])}
                  />
                ))}
                {pending.map((email) => (
                  <PendingEmailRow
                    key={email}
                    email={email}
                    onDone={() => reloadFromServer(email)}
                    onCancel={() => setPending((p) => p.filter((x) => x !== email))}
                  />
                ))}
              </ul>
              {canAddMore ? (
                <div className="flex max-w-sm gap-2">
                  <Input
                    type="email"
                    value={newEmail}
                    placeholder={t('profile.balanceNotify.emailPlaceholder')}
                    onChange={(e) => setNewEmail(e.target.value)}
                  />
                  <Button variant="outline" onClick={addPending}>
                    <Plus aria-hidden />
                    {t('common.add')}
                  </Button>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">{t('profile.balanceNotify.maxEmailsReached')}</p>
              )}
            </div>
          </>
        ) : null}
      </CardContent>
    </Card>
  )
}
