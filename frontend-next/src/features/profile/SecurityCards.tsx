/** 个人资料页的安全卡片：TOTP 两步验证（启用 / 停用）与 Passkey 管理。 */
import * as React from 'react'
import { Copy, KeyRound, Loader2, Pencil, Plus, ShieldCheck, Trash2 } from 'lucide-react'
import { passkeyAPI, type PasskeyCredentialSummary } from '@/api/passkey'
import { totpAPI } from '@/api/totp'
import { FormField } from '@/components/FormField'
import { PasswordInput } from '@/components/PasswordInput'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useClipboard } from '@/hooks/useClipboard'
import { t } from '@/i18n'
import { useAppStore } from '@/stores/app'
import type { TotpSetupResponse, TotpStatus } from '@/types'
import { extractApiErrorMessage } from '@/utils/apiError'
import { useQuery, useQueryClient } from '@tanstack/react-query'

const notify = {
  success: (m: string) => useAppStore.getState().showSuccess(m),
  error: (m: string) => useAppStore.getState().showError(m)
}

type VerifyMethod = 'email' | 'password'

/** 身份验证表单（邮箱验证码 / 密码），TOTP 启用与停用共用。 */
function IdentityVerify({
  method,
  email,
  password,
  onEmail,
  onPassword
}: {
  method: VerifyMethod
  email: string
  password: string
  onEmail: (v: string) => void
  onPassword: (v: string) => void
}) {
  const [sending, setSending] = React.useState(false)
  const [cooldown, setCooldown] = React.useState(0)
  React.useEffect(() => {
    if (cooldown <= 0) return
    const id = setInterval(() => setCooldown((c) => c - 1), 1000)
    return () => clearInterval(id)
  }, [cooldown > 0]) // eslint-disable-line react-hooks/exhaustive-deps -- 仅在开始 / 结束倒计时时重建
  const send = async () => {
    setSending(true)
    try {
      await totpAPI.sendVerifyCode()
      notify.success(t('profile.totp.codeSent'))
      setCooldown(60)
    } catch (error) {
      notify.error(extractApiErrorMessage(error, t('profile.totp.sendCodeFailed')))
    } finally {
      setSending(false)
    }
  }
  if (method === 'email') {
    return (
      <FormField label={t('profile.totp.emailCode')}>
        <div className="flex gap-2">
          <Input
            value={email}
            inputMode="numeric"
            maxLength={6}
            placeholder={t('profile.totp.enterEmailCode')}
            onChange={(e) => onEmail(e.target.value.replace(/\D/g, ''))}
          />
          <Button
            type="button"
            variant="outline"
            loading={sending}
            disabled={cooldown > 0}
            onClick={() => void send()}
          >
            {cooldown > 0 ? `${cooldown}s` : t('profile.totp.sendCode')}
          </Button>
        </div>
      </FormField>
    )
  }
  return (
    <FormField label={t('profile.currentPassword')}>
      <PasswordInput
        autoComplete="current-password"
        value={password}
        placeholder={t('profile.totp.enterPassword')}
        onChange={(e) => onPassword(e.target.value)}
      />
    </FormField>
  )
}

function useVerificationMethod(open: boolean, onFail: () => void) {
  const q = useQuery({
    queryKey: ['user', 'totp', 'method'],
    enabled: open,
    queryFn: () => totpAPI.getVerificationMethod(),
    staleTime: 0
  })
  React.useEffect(() => {
    if (q.isError) {
      notify.error(extractApiErrorMessage(q.error, t('common.error')))
      onFail()
    }
  }, [q.isError, q.error, onFail])
  return q
}

function SetupBody({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const method = useVerificationMethod(true, onClose)
  const [step, setStep] = React.useState<0 | 1 | 2>(0)
  const [form, setForm] = React.useState({ emailCode: '', password: '' })
  const [setup, setSetup] = React.useState<TotpSetupResponse | null>(null)
  const [qr, setQr] = React.useState('')
  const [code, setCode] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const { copy } = useClipboard()
  const verifyMethod: VerifyMethod = method.data?.method ?? 'password'
  const canProceed = verifyMethod === 'email' ? form.emailCode.length === 6 : form.password.length > 0

  React.useEffect(() => {
    if (!setup?.qr_code_url) return
    let cancelled = false
    void import('qrcode').then(({ default: QRCode }) =>
      QRCode.toDataURL(setup.qr_code_url, {
        width: 200,
        margin: 2,
        color: { dark: '#000000', light: '#ffffff' }
      })
        .then((url) => !cancelled && setQr(url))
        .catch((err) => console.error('Failed to generate QR code:', err))
    )
    return () => {
      cancelled = true
    }
  }, [setup?.qr_code_url])

  const initiate = async () => {
    setBusy(true)
    try {
      setSetup(
        await totpAPI.initiateSetup(
          verifyMethod === 'email' ? { email_code: form.emailCode } : { password: form.password }
        )
      )
      setStep(1)
    } catch (error) {
      notify.error(extractApiErrorMessage(error, t('profile.totp.setupFailed')))
    } finally {
      setBusy(false)
    }
  }
  const enable = async () => {
    if (code.length !== 6 || !setup) return
    setBusy(true)
    try {
      await totpAPI.enable({ totp_code: code, setup_token: setup.setup_token })
      notify.success(t('profile.totp.enableSuccess'))
      onSuccess()
    } catch (error) {
      notify.error(extractApiErrorMessage(error, t('profile.totp.verifyFailed')))
      setCode('')
    } finally {
      setBusy(false)
    }
  }

  const description =
    step === 0
      ? verifyMethod === 'email'
        ? t('profile.totp.verifyEmailFirst')
        : t('profile.totp.verifyPasswordFirst')
      : step === 1
        ? t('profile.totp.setupStep1')
        : t('profile.totp.setupStep2')

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t('profile.totp.setupTitle')}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>
      {method.isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="size-6 animate-spin text-primary" aria-hidden />
        </div>
      ) : step === 0 ? (
        <>
          <IdentityVerify
            method={verifyMethod}
            email={form.emailCode}
            password={form.password}
            onEmail={(v) => setForm((f) => ({ ...f, emailCode: v }))}
            onPassword={(v) => setForm((f) => ({ ...f, password: v }))}
          />
          <DialogFooter>
            <Button variant="outline" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button disabled={!canProceed} loading={busy} onClick={() => void initiate()}>
              {t('common.next')}
            </Button>
          </DialogFooter>
        </>
      ) : step === 1 && setup ? (
        <>
          <div className="flex flex-col items-center gap-3">
            {qr ? (
              // eslint-disable-next-line @next/next/no-img-element -- 本地生成的 data URL
              <img src={qr} alt="TOTP QR" className="size-48 rounded-lg border bg-white" />
            ) : (
              <Loader2 className="size-6 animate-spin" aria-hidden />
            )}
            <p className="text-xs text-muted-foreground">{t('profile.totp.manualEntry')}</p>
            <div className="flex items-center gap-2 rounded-md bg-muted px-3 py-1.5">
              <code className="break-all font-mono text-sm">{setup.secret}</code>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label={t('common.copied')}
                onClick={() => void copy(setup.secret)}
              >
                <Copy aria-hidden />
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStep(0)}>
              {t('common.back')}
            </Button>
            <Button onClick={() => setStep(2)}>{t('common.next')}</Button>
          </DialogFooter>
        </>
      ) : (
        <>
          <FormField label={t('profile.totp.enterCode')}>
            <Input
              value={code}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              className="text-center font-mono text-xl tracking-[0.5em]"
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              autoFocus
            />
          </FormField>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStep(1)}>
              {t('common.back')}
            </Button>
            <Button disabled={code.length !== 6} loading={busy} onClick={() => void enable()}>
              {t('profile.totp.verify')}
            </Button>
          </DialogFooter>
        </>
      )}
    </>
  )
}

function DisableBody({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const method = useVerificationMethod(true, onClose)
  const [form, setForm] = React.useState({ emailCode: '', password: '' })
  const [busy, setBusy] = React.useState(false)
  const verifyMethod: VerifyMethod = method.data?.method ?? 'password'
  const canSubmit = verifyMethod === 'email' ? form.emailCode.length === 6 : form.password.length > 0
  const submit = async () => {
    if (!canSubmit) return
    setBusy(true)
    try {
      await totpAPI.disable(
        verifyMethod === 'email' ? { email_code: form.emailCode } : { password: form.password }
      )
      notify.success(t('profile.totp.disableSuccess'))
      onSuccess()
    } catch (error) {
      notify.error(extractApiErrorMessage(error, t('profile.totp.disableFailed')))
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <DialogHeader>
        <DialogTitle>{t('profile.totp.disableTitle')}</DialogTitle>
        <DialogDescription>{t('profile.totp.disableWarning')}</DialogDescription>
      </DialogHeader>
      {method.isLoading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="size-6 animate-spin text-primary" aria-hidden />
        </div>
      ) : (
        <IdentityVerify
          method={verifyMethod}
          email={form.emailCode}
          password={form.password}
          onEmail={(v) => setForm((f) => ({ ...f, emailCode: v }))}
          onPassword={(v) => setForm((f) => ({ ...f, password: v }))}
        />
      )}
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          {t('common.cancel')}
        </Button>
        <Button variant="destructive" disabled={!canSubmit} loading={busy} onClick={() => void submit()}>
          {t('profile.totp.confirmDisable')}
        </Button>
      </DialogFooter>
    </>
  )
}

export function ProfileTotpCard() {
  const queryClient = useQueryClient()
  const status = useQuery({
    queryKey: ['user', 'totp', 'status'],
    queryFn: (): Promise<TotpStatus> => totpAPI.getStatus()
  })
  const [dialog, setDialog] = React.useState<'setup' | 'disable' | null>(null)
  const done = () => {
    setDialog(null)
    void queryClient.invalidateQueries({ queryKey: ['user', 'totp'] })
  }
  const s = status.data
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="size-4" aria-hidden />
          {t('profile.totp.title')}
        </CardTitle>
        <CardDescription>{t('profile.totp.description')}</CardDescription>
      </CardHeader>
      <CardContent>
        {status.isLoading ? (
          <Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden />
        ) : !s ? null : !s.feature_enabled ? (
          <div className="rounded-lg border bg-muted/40 p-4">
            <p className="text-sm font-medium">{t('profile.totp.featureDisabled')}</p>
            <p className="text-xs text-muted-foreground">{t('profile.totp.featureDisabledHint')}</p>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <Badge variant={s.enabled ? 'success' : 'secondary'}>
                {s.enabled ? t('profile.totp.enabled') : t('profile.totp.notEnabled')}
              </Badge>
              <p className="mt-1 text-xs text-muted-foreground">
                {s.enabled && s.enabled_at
                  ? `${t('profile.totp.enabledAt')}: ${new Date(s.enabled_at * 1000).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`
                  : t('profile.totp.notEnabledHint')}
              </p>
            </div>
            {s.enabled ? (
              <Button variant="outline" onClick={() => setDialog('disable')}>
                {t('profile.totp.disable')}
              </Button>
            ) : (
              <Button onClick={() => setDialog('setup')}>{t('profile.totp.enable')}</Button>
            )}
          </div>
        )}
      </CardContent>
      <Dialog open={dialog !== null} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent>
          {dialog === 'setup' ? <SetupBody onClose={() => setDialog(null)} onSuccess={done} /> : null}
          {dialog === 'disable' ? <DisableBody onClose={() => setDialog(null)} onSuccess={done} /> : null}
        </DialogContent>
      </Dialog>
    </Card>
  )
}

/* ───────────── Passkey ───────────── */

const errorMessageOf = (error: unknown, fallback: string): string => {
  const m = (error as { message?: string }).message
  return typeof m === 'string' && m.length > 0 ? m : fallback
}

const fmtDate = (v: string) =>
  new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric' }).format(new Date(v))

export function ProfilePasskeyCard({ enabled }: { enabled: boolean }) {
  const supported = typeof window !== 'undefined' && passkeyAPI.isSupported()
  const queryClient = useQueryClient()
  const list = useQuery({
    queryKey: ['user', 'passkeys'],
    enabled,
    queryFn: async () => {
      try {
        return await passkeyAPI.list()
      } catch (error) {
        // 设置变更竞态下后端仍可能返回 PASSKEY_DISABLED，静默处理
        if ((error as { reason?: string }).reason !== 'PASSKEY_DISABLED')
          notify.error(t('profile.passkey.loadFailed'))
        return [] as PasskeyCredentialSummary[]
      }
    }
  })
  const [adding, setAdding] = React.useState(false)
  const [name, setName] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [deleteTarget, setDeleteTarget] = React.useState<PasskeyCredentialSummary | null>(null)
  const [deletePassword, setDeletePassword] = React.useState('')
  const reload = () => queryClient.invalidateQueries({ queryKey: ['user', 'passkeys'] })

  const add = async () => {
    if (password.length === 0) return
    setBusy(true)
    try {
      await passkeyAPI.register(name.trim(), password)
      notify.success(t('profile.passkey.added'))
      setAdding(false)
      setName('')
      setPassword('')
      await reload()
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'NotAllowedError'))
        notify.error(errorMessageOf(error, t('profile.passkey.addFailed')))
    } finally {
      setBusy(false)
    }
  }
  const rename = async (c: PasskeyCredentialSummary) => {
    const next = window.prompt(t('profile.passkey.renamePrompt'), c.name)?.trim()
    if (!next || next === c.name) return
    setBusy(true)
    try {
      await passkeyAPI.rename(c.id, next)
      notify.success(t('profile.passkey.renamed'))
      await reload()
    } catch {
      notify.error(t('profile.passkey.renameFailed'))
    } finally {
      setBusy(false)
    }
  }
  const remove = async () => {
    if (!deleteTarget || deletePassword.length === 0) return
    setBusy(true)
    try {
      await passkeyAPI.remove(deleteTarget.id, deletePassword)
      notify.success(t('profile.passkey.deleted'))
      setDeleteTarget(null)
      setDeletePassword('')
      await reload()
    } catch (error) {
      // 密码错误等失败保持对话框打开，允许重试
      notify.error(errorMessageOf(error, t('profile.passkey.deleteFailed')))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <KeyRound className="size-4" aria-hidden />
          {t('profile.passkey.title')}
        </CardTitle>
        <CardDescription>{t('profile.passkey.description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!enabled ? (
          <p className="text-sm text-muted-foreground">{t('profile.passkey.featureDisabled')}</p>
        ) : !supported ? (
          <p className="text-sm text-muted-foreground">{t('profile.passkey.unsupported')}</p>
        ) : (
          <>
            {list.isLoading ? (
              <Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden />
            ) : null}
            {!list.isLoading && (list.data ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('profile.passkey.empty')}</p>
            ) : null}
            <ul className="space-y-2">
              {(list.data ?? []).map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 truncate text-sm font-medium">
                      {c.name}
                      {c.backup ? <Badge variant="info">{t('profile.passkey.synced')}</Badge> : null}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t('profile.passkey.createdAt')}: {fmtDate(c.created_at)}
                      {c.last_used_at
                        ? ` · ${t('profile.passkey.lastUsed')}: ${fmtDate(c.last_used_at)}`
                        : ''}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={t('common.edit')}
                      disabled={busy}
                      onClick={() => void rename(c)}
                    >
                      <Pencil aria-hidden />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={t('common.delete')}
                      disabled={busy}
                      onClick={() => {
                        setDeleteTarget(c)
                        setDeletePassword('')
                      }}
                    >
                      <Trash2 aria-hidden />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
            {adding ? (
              <div className="space-y-3 rounded-lg border p-4">
                <FormField label={t('profile.passkey.name')}>
                  <Input
                    value={name}
                    placeholder={t('profile.passkey.namePlaceholder')}
                    onChange={(e) => setName(e.target.value)}
                  />
                </FormField>
                <FormField label={t('profile.currentPassword')}>
                  <PasswordInput
                    value={password}
                    placeholder={t('profile.passkey.passwordPlaceholder')}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </FormField>
                <div className="flex gap-2">
                  <Button loading={busy} disabled={password.length === 0} onClick={() => void add()}>
                    {t('profile.passkey.continue')}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setAdding(false)
                      setName('')
                      setPassword('')
                    }}
                  >
                    {t('common.cancel')}
                  </Button>
                </div>
              </div>
            ) : (
              <Button variant="outline" onClick={() => setAdding(true)}>
                <Plus aria-hidden />
                {t('profile.passkey.add')}
              </Button>
            )}
          </>
        )}
      </CardContent>
      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('profile.passkey.deleteTitle')}</DialogTitle>
            <DialogDescription>
              {t('profile.passkey.deleteConfirm', { name: deleteTarget?.name ?? '' })}
            </DialogDescription>
          </DialogHeader>
          <PasswordInput
            value={deletePassword}
            placeholder={t('profile.passkey.passwordPlaceholder')}
            onChange={(e) => setDeletePassword(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="destructive"
              loading={busy}
              disabled={deletePassword.length === 0}
              onClick={() => void remove()}
            >
              {t('common.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
