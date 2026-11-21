import * as React from 'react'
import { sendPendingOAuthVerifyCode } from '@/api/auth'
import { CaptchaChallenge } from '@/components/captcha/LazyCaptchaChallenge'
import { FormField } from '@/components/FormField'
import { PasswordInput } from '@/components/PasswordInput'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAppStore } from '@/stores/app'
import { t } from '@/i18n'
import { useAuthSettings } from '../shared/useAuthSettings'
import { resolveCaptchaConfig, toRequestFields, useCaptchaProof } from '../shared/useCaptchaProof'
import { getRequestErrorMessage } from './pending'

export interface PendingOAuthCreateAccountPayload {
  email: string
  password: string
  verifyCode: string
  turnstileToken?: string
  tencentCaptchaTicket?: string
  tencentCaptchaRandstr?: string
  invitationCode?: string
}

interface Props {
  initialEmail: string
  testIdPrefix: string
  isSubmitting: boolean
  errorMessage?: string
  onSubmit: (payload: PendingOAuthCreateAccountPayload) => void
  onSwitchToBind: (email: string) => void
}

/** pending OAuth 的“创建账号”表单：邮箱 / 密码 / 验证码 / 邮箱验证码 / 邀请码。 */
export function PendingOAuthCreateAccountForm({
  initialEmail,
  testIdPrefix,
  isSubmitting,
  errorMessage,
  onSubmit,
  onSwitchToBind
}: Props) {
  const showError = useAppStore((s) => s.showError)
  const { settings } = useAuthSettings()
  const config = React.useMemo(() => resolveCaptchaConfig(settings), [settings])
  const { attach: captchaRef, ...captcha } = useCaptchaProof(config)
  const invitationEnabled = settings?.invitation_code_enabled === true
  const emailVerifyEnabled = settings ? settings.email_verify_enabled !== false : true

  const [email, setEmail] = React.useState(initialEmail || '')
  const [password, setPassword] = React.useState('')
  const [verifyCode, setVerifyCode] = React.useState('')
  const [invitation, setInvitation] = React.useState('')
  const [sending, setSending] = React.useState(false)
  const [sent, setSent] = React.useState(false)
  const [countdown, setCountdown] = React.useState(0)

  // initialEmail 变化（如从“选择”切到“创建”）时同步到输入框：在渲染期调整状态，避免级联渲染
  const [prevInitialEmail, setPrevInitialEmail] = React.useState(initialEmail)
  if (prevInitialEmail !== initialEmail) {
    setPrevInitialEmail(initialEmail)
    setEmail(initialEmail || '')
  }
  React.useEffect(() => {
    if (countdown <= 0) return
    const id = window.setTimeout(() => setCountdown((c) => Math.max(0, c - 1)), 1000)
    return () => window.clearTimeout(id)
  }, [countdown])
  React.useEffect(() => {
    if (errorMessage) {
      showError(errorMessage)
      if (config.enabled) captcha.reset()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [errorMessage])

  const sendCode = async () => {
    const trimmed = email.trim()
    if (!trimmed) return
    if (config.turnstileEnabled && !captcha.token) {
      showError(t('auth.completeVerification'))
      return
    }
    const proof = await captcha.acquireActionProof()
    if (!proof) return
    setSending(true)
    setSent(false)
    try {
      const response = await sendPendingOAuthVerifyCode({ email: trimmed, ...toRequestFields(config, proof) })
      setSent(true)
      setCountdown(Math.max(0, response.countdown))
    } catch (error) {
      showError(getRequestErrorMessage(error, t('auth.sendCodeFailed')))
    } finally {
      if (config.enabled) captcha.reset()
      setSending(false)
    }
  }

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault()
    const trimmed = email.trim()
    if (!trimmed || password.length < 6) return
    // Turnstile 票据一次性：发送验证码已消耗上一枚，缺票时不能提交（回车隐式提交会绕过按钮 disabled）
    if (config.turnstileEnabled && !captcha.token) {
      showError(t('auth.completeVerification'))
      return
    }
    const fields = await captcha.acquireActionProof()
    if (!fields) return
    onSubmit({
      email: trimmed,
      password,
      verifyCode: emailVerifyEnabled ? verifyCode.trim() : '',
      ...((config.turnstileEnabled || config.aliyunEnabled) && fields.token
        ? { turnstileToken: fields.token }
        : {}),
      ...(config.tencentEnabled && fields.token
        ? { tencentCaptchaTicket: fields.token, tencentCaptchaRandstr: fields.randstr }
        : {}),
      invitationCode: invitation.trim() || undefined
    })
    if (config.actionEnabled) captcha.reset()
  }

  return (
    <form onSubmit={submit} className="grid gap-3.5" noValidate>
      <FormField label={t('auth.emailLabel')}>
        <Input
          type="email"
          data-testid={`${testIdPrefix}-create-account-email`}
          placeholder={t('auth.emailPlaceholder')}
          value={email}
          autoComplete="email"
          disabled={isSubmitting || sending}
          onChange={(e) => setEmail(e.target.value)}
        />
      </FormField>
      <FormField label={t('auth.passwordLabel')}>
        <PasswordInput
          data-testid={`${testIdPrefix}-create-account-password`}
          placeholder={t('auth.passwordPlaceholder')}
          value={password}
          autoComplete="new-password"
          disabled={isSubmitting}
          onChange={(e) => setPassword(e.target.value)}
        />
      </FormField>

      {config.enabled ? <CaptchaChallenge ref={captchaRef} {...captcha.challengeProps} /> : null}
      {captcha.error ? (
        <p role="alert" className="text-xs text-destructive">
          {captcha.error}
        </p>
      ) : null}

      {emailVerifyEnabled ? (
        <div className="grid gap-1.5">
          <div className="flex gap-2">
            <Input
              data-testid={`${testIdPrefix}-create-account-verify-code`}
              inputMode="numeric"
              maxLength={6}
              placeholder="123456"
              aria-label={t('auth.verificationCode')}
              value={verifyCode}
              disabled={isSubmitting}
              onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            />
            <Button
              type="button"
              variant="outline"
              data-testid={`${testIdPrefix}-create-account-send-code`}
              className="shrink-0"
              disabled={
                isSubmitting ||
                sending ||
                countdown > 0 ||
                !email.trim() ||
                (config.turnstileEnabled && !captcha.token)
              }
              onClick={sendCode}
            >
              {sending
                ? t('auth.sendingCode')
                : countdown > 0
                  ? t('auth.resendCountdown', { countdown })
                  : t('auth.sendCode')}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {sent ? t('auth.codeSentSuccess') : t('auth.verificationCodeHint')}
          </p>
        </div>
      ) : null}

      {invitationEnabled ? (
        <Input
          data-testid={`${testIdPrefix}-create-account-invitation-code`}
          placeholder={t('auth.invitationCodePlaceholder')}
          aria-label={t('auth.invitationCodeLabel')}
          value={invitation}
          disabled={isSubmitting}
          onChange={(e) => setInvitation(e.target.value)}
        />
      ) : null}

      <Button
        type="submit"
        data-testid={`${testIdPrefix}-create-account-submit`}
        loading={isSubmitting}
        disabled={
          !email.trim() ||
          password.length < 6 ||
          (invitationEnabled && !invitation.trim()) ||
          (config.turnstileEnabled && !captcha.token)
        }
      >
        {isSubmitting ? t('common.processing') : t('auth.createAccount')}
      </Button>
      <Button
        type="button"
        variant="ghost"
        disabled={isSubmitting}
        onClick={() => onSwitchToBind(email.trim())}
      >
        {t('auth.alreadyHaveAccount')}
      </Button>
    </form>
  )
}
