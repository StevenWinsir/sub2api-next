/** 找回密码：提交邮箱（带验证码）→ 后端发送重置链接邮件（链接指向 /reset-password?email=&token=）。 */
import * as React from 'react'
import Link from 'next/link'
import { ArrowLeft, MailCheck } from 'lucide-react'
import { forgotPassword } from '@/api/auth'
import { CaptchaChallenge } from '@/components/captcha/LazyCaptchaChallenge'
import { FormField } from '@/components/FormField'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAppStore } from '@/stores/app'
import { t } from '@/i18n'
import { useLocale } from '@/i18n/react'
import { useAuthSettings } from './shared/useAuthSettings'
import { resolveCaptchaConfig, toRequestFields, useCaptchaProof } from './shared/useCaptchaProof'
import { isValidEmail } from './validation'

export function ForgotPasswordPage() {
  useLocale()
  const showError = useAppStore((s) => s.showError)
  const showSuccess = useAppStore((s) => s.showSuccess)
  const { settings } = useAuthSettings()
  const captchaConfig = React.useMemo(() => resolveCaptchaConfig(settings), [settings])
  const { attach: captchaRef, ...captcha } = useCaptchaProof(captchaConfig)

  const [email, setEmail] = React.useState('')
  const [emailError, setEmailError] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [submitted, setSubmitted] = React.useState(false)
  const [formError, setFormError] = React.useState('')

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError('')
    let err = ''
    if (!email.trim()) err = t('auth.emailRequired')
    else if (!isValidEmail(email)) err = t('auth.invalidEmail')
    setEmailError(err)
    const turnstileMissing = captchaConfig.turnstileEnabled && !captcha.token
    if (turnstileMissing) captcha.setError(t('auth.completeVerification'))
    if (err || turnstileMissing) {
      showError(err || t('auth.completeVerification'))
      return
    }
    const proof = await captcha.acquireActionProof()
    if (!proof) return

    setBusy(true)
    try {
      await forgotPassword({ email, ...toRequestFields(captchaConfig, proof) })
      setSubmitted(true)
      showSuccess(t('auth.resetEmailSent'))
    } catch (error: unknown) {
      const e2 = error as { message?: string; response?: { data?: { detail?: string } } }
      const message = e2.response?.data?.detail || e2.message || t('auth.sendResetLinkFailed')
      setFormError(message)
      showError(message)
    } finally {
      if (captchaConfig.enabled) captcha.reset()
      setBusy(false)
    }
  }

  if (submitted) {
    return (
      <div className="space-y-6 text-center">
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-success/10 text-success">
          <MailCheck className="size-6" aria-hidden />
        </div>
        <div className="space-y-1.5">
          <h1 className="text-2xl font-semibold tracking-tight">{t('auth.resetEmailSent')}</h1>
          <p className="text-sm text-muted-foreground">{t('auth.resetEmailSentHint')}</p>
        </div>
        <Button asChild variant="outline" className="w-full">
          <Link href="/login">
            <ArrowLeft aria-hidden />
            {t('auth.backToLogin')}
          </Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">{t('auth.forgotPasswordTitle')}</h1>
        <p className="text-sm text-muted-foreground">{t('auth.forgotPasswordHint')}</p>
      </div>
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <FormField label={t('auth.emailLabel')} error={emailError || undefined} required>
          <Input
            type="email"
            name="email"
            autoComplete="email"
            inputMode="email"
            placeholder={t('auth.emailPlaceholder')}
            value={email}
            disabled={busy}
            onChange={(e) => setEmail(e.target.value)}
          />
        </FormField>
        {captchaConfig.enabled ? (
          <div className="space-y-1.5">
            <CaptchaChallenge ref={captchaRef} {...captcha.challengeProps} />
            {captcha.error ? (
              <p role="alert" className="text-xs text-destructive">
                {captcha.error}
              </p>
            ) : null}
          </div>
        ) : null}
        {formError ? (
          <p
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {formError}
          </p>
        ) : null}
        <Button type="submit" className="w-full" loading={busy}>
          {busy ? t('auth.sendingResetLink') : t('auth.sendResetLink')}
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
