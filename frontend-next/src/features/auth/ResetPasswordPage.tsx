/** 重置密码：从邮件链接（?email=&token=）进入，提交新密码。 */
import * as React from 'react'
import Link from 'next/link'
import { CheckCircle2, TriangleAlert } from 'lucide-react'
import { resetPassword } from '@/api/auth'
import { FormField } from '@/components/FormField'
import { PasswordInput } from '@/components/PasswordInput'
import { Button } from '@/components/ui/button'
import { useAppStore } from '@/stores/app'
import { extractApiErrorCode } from '@/utils/apiError'
import { t } from '@/i18n'
import { useLocale } from '@/i18n/react'
import { getQueryParam } from './shared/useAuthSettings'

export function ResetPasswordPage() {
  useLocale()
  const showError = useAppStore((s) => s.showError)
  const showSuccess = useAppStore((s) => s.showSuccess)
  const [link] = React.useState(() => ({ email: getQueryParam('email'), token: getQueryParam('token') }))
  const [password, setPassword] = React.useState('')
  const [confirm, setConfirm] = React.useState('')
  const [errors, setErrors] = React.useState<{ password?: string; confirm?: string }>({})
  const [busy, setBusy] = React.useState(false)
  const [done, setDone] = React.useState(false)
  const [formError, setFormError] = React.useState('')

  React.useEffect(() => {
    if (!link.email || !link.token) showError(t('auth.invalidResetLink'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const invalid = !link.email || !link.token

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError('')
    const next: { password?: string; confirm?: string } = {}
    if (!password) next.password = t('auth.passwordRequired')
    else if (password.length < 6) next.password = t('auth.passwordMinLength')
    if (!confirm) next.confirm = t('auth.confirmPasswordRequired')
    else if (password !== confirm) next.confirm = t('auth.passwordsDoNotMatch')
    setErrors(next)
    if (next.password || next.confirm) {
      showError((next.password || next.confirm) as string)
      return
    }
    setBusy(true)
    try {
      await resetPassword({ email: link.email, token: link.token, new_password: password })
      setDone(true)
      showSuccess(t('auth.passwordResetSuccess'))
    } catch (error: unknown) {
      const err = error as { message?: string; response?: { data?: { detail?: string; code?: string } } }
      const message =
        extractApiErrorCode(error) === 'INVALID_RESET_TOKEN' ||
        err.response?.data?.code === 'INVALID_RESET_TOKEN'
          ? t('auth.invalidOrExpiredToken')
          : err.response?.data?.detail || err.message || t('auth.resetPasswordFailed')
      setFormError(message)
      showError(message)
    } finally {
      setBusy(false)
    }
  }

  if (invalid) {
    return (
      <div className="space-y-6 text-center">
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-warning/10 text-warning">
          <TriangleAlert className="size-6" aria-hidden />
        </div>
        <div className="space-y-1.5">
          <h1 className="text-2xl font-semibold tracking-tight">{t('auth.invalidResetLink')}</h1>
          <p className="text-sm text-muted-foreground">{t('auth.invalidResetLinkHint')}</p>
        </div>
        <Button asChild className="w-full">
          <Link href="/forgot-password">{t('auth.requestNewResetLink')}</Link>
        </Button>
      </div>
    )
  }

  if (done) {
    return (
      <div className="space-y-6 text-center">
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-success/10 text-success">
          <CheckCircle2 className="size-6" aria-hidden />
        </div>
        <div className="space-y-1.5">
          <h1 className="text-2xl font-semibold tracking-tight">{t('auth.passwordResetSuccess')}</h1>
          <p className="text-sm text-muted-foreground">{t('auth.passwordResetSuccessHint')}</p>
        </div>
        <Button asChild className="w-full">
          <Link href="/login">{t('auth.signIn')}</Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">{t('auth.resetPasswordTitle')}</h1>
        <p className="text-sm text-muted-foreground">{t('auth.resetPasswordHint')}</p>
      </div>
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <FormField label={t('auth.emailLabel')}>
          <input
            readOnly
            value={link.email}
            className="h-9 w-full rounded-md border bg-muted px-3 text-base text-muted-foreground sm:text-sm"
            aria-readonly
          />
        </FormField>
        <FormField label={t('auth.newPassword')} error={errors.password} required>
          <PasswordInput
            autoComplete="new-password"
            placeholder={t('auth.newPasswordPlaceholder')}
            value={password}
            disabled={busy}
            onChange={(e) => setPassword(e.target.value)}
          />
        </FormField>
        <FormField label={t('auth.confirmPassword')} error={errors.confirm} required>
          <PasswordInput
            autoComplete="new-password"
            placeholder={t('auth.confirmPasswordPlaceholder')}
            value={confirm}
            disabled={busy}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </FormField>
        {formError ? (
          <p
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {formError}
          </p>
        ) : null}
        <Button type="submit" className="w-full" loading={busy}>
          {busy ? t('auth.resettingPassword') : t('auth.resetPassword')}
        </Button>
      </form>
      <p className="text-center text-sm text-muted-foreground">
        {t('auth.rememberedPassword')}{' '}
        <Link href="/login" className="font-medium text-primary hover:underline">
          {t('auth.signIn')}
        </Link>
      </p>
    </div>
  )
}
