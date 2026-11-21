/** 登录页：密码 + 验证码（Turnstile / 腾讯 / 阿里云）+ TOTP + Passkey + 第三方登录 + 协议同意。 */
import * as React from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/router'
import { KeyRound } from 'lucide-react'
import {
  buildOAuthLoginStartURL,
  isTotp2FARequired,
  isWeChatWebOAuthEnabled,
  startOAuthLogin,
  type OAuthLoginStart
} from '@/api/auth'
import { CaptchaChallenge } from '@/components/captcha/LazyCaptchaChallenge'
import { FormField } from '@/components/FormField'
import { PasswordInput } from '@/components/PasswordInput'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { STORAGE_KEYS } from '@/constants/storage'
import { sanitizeRedirect } from '@/core/safeNavigation'
import { useAppStore } from '@/stores/app'
import { useAuthStore } from '@/stores/auth'
import { extractI18nErrorMessage } from '@/utils/apiError'
import { clearAllAffiliateReferralCodes } from '@/utils/oauthAffiliate'
import { t } from '@/i18n'
import { useLocale } from '@/i18n/react'
import { LoginAgreementPrompt } from './shared/LoginAgreementPrompt'
import { OAuthButtons, OrDivider } from './shared/OAuthButtons'
import { getQueryParam, useAuthSettings } from './shared/useAuthSettings'
import {
  resolveCaptchaConfig,
  toActionProof,
  toRequestFields,
  useCaptchaProof
} from './shared/useCaptchaProof'
import { useLoginAgreement } from './shared/useLoginAgreement'
import { validateLoginFields } from './validation'

// TOTP 弹窗（Radix Dialog）只在需要二次验证时才加载
const TotpStepDialog = dynamic(() => import('./TotpStepDialog').then((m) => m.TotpStepDialog), { ssr: false })

export function LoginPage() {
  useLocale()
  const router = useRouter()
  const login = useAuthStore((s) => s.login)
  const login2FA = useAuthStore((s) => s.login2FA)
  const loginWithPasskey = useAuthStore((s) => s.loginWithPasskey)
  const isAdmin = useAuthStore((s) => s.isAdmin)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const showError = useAppStore((s) => s.showError)
  const showSuccess = useAppStore((s) => s.showSuccess)
  const showWarning = useAppStore((s) => s.showWarning)

  const { settings, loaded } = useAuthSettings()
  const captchaConfig = React.useMemo(() => resolveCaptchaConfig(settings), [settings])
  const { attach: captchaRef, ...captcha } = useCaptchaProof(captchaConfig)
  const agreement = useLoginAgreement(settings, loaded, 'login')

  const [email, setEmail] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [errors, setErrors] = React.useState<{ email?: string; password?: string }>({})
  const [busy, setBusy] = React.useState(false)
  const [passkeyBusy, setPasskeyBusy] = React.useState(false)
  const [formError, setFormError] = React.useState('')
  const [totp, setTotp] = React.useState<{ tempToken: string; masked?: string } | null>(null)

  const backendMode = settings?.backend_mode_enabled === true
  const registrationEnabled = settings?.registration_enabled === true
  const passwordResetEnabled = settings?.password_reset_enabled === true
  const showPasskey =
    settings?.passkey_enabled === true &&
    typeof window !== 'undefined' &&
    typeof window.PublicKeyCredential !== 'undefined'
  const oauth = {
    githubEnabled: settings?.github_oauth_enabled === true,
    googleEnabled: settings?.google_oauth_enabled === true,
    linuxdoEnabled: settings?.linuxdo_oauth_enabled === true,
    dingtalkEnabled: settings?.dingtalk_oauth_enabled === true,
    wechatEnabled: settings ? isWeChatWebOAuthEnabled(settings) : false,
    oidcEnabled: settings?.oidc_oauth_enabled === true,
    oidcProviderName: settings?.oidc_oauth_provider_name || 'OIDC'
  }
  const showOAuth =
    !backendMode &&
    (oauth.githubEnabled ||
      oauth.googleEnabled ||
      oauth.linuxdoEnabled ||
      oauth.dingtalkEnabled ||
      oauth.wechatEnabled ||
      oauth.oidcEnabled)
  const actionDisabled = busy || passkeyBusy || !loaded || agreement.gateActive

  // 会话过期提示：auth_expired 由 API 层在刷新失败时设置，只提示一次
  // LoginPage 只在客户端门禁通过后渲染，可安全读取 sessionStorage
  const [expired] = React.useState(() => {
    try {
      return !!window.sessionStorage.getItem(STORAGE_KEYS.authExpired)
    } catch {
      return false
    }
  })
  React.useEffect(() => {
    try {
      window.sessionStorage.removeItem(STORAGE_KEYS.authExpired)
    } catch {
      /* ignore */
    }
    if (expired) showWarning(t('auth.reloginRequired'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const afterLogin = React.useCallback(
    async (admin: boolean) => {
      clearAllAffiliateReferralCodes()
      showSuccess(t('auth.loginSuccess'))
      const fallback = admin ? '/admin/dashboard' : '/dashboard'
      await router.replace(sanitizeRedirect(getQueryParam('redirect'), fallback))
    },
    [router, showSuccess]
  )

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError('')
    if (agreement.blockIfNeeded()) return
    const fieldErrors = validateLoginFields(email, password)
    setErrors(fieldErrors)
    const turnstileMissing = captchaConfig.turnstileEnabled && !captcha.token
    if (turnstileMissing) captcha.setError(t('auth.completeVerification'))
    if (fieldErrors.email || fieldErrors.password || turnstileMissing) {
      const first = fieldErrors.email || fieldErrors.password
      if (first) showError(t(first))
      return
    }
    const proof = await captcha.acquireActionProof()
    if (!proof) return

    setBusy(true)
    try {
      const response = await login({ email, password, ...toRequestFields(captchaConfig, proof) })
      if (isTotp2FARequired(response)) {
        setTotp({ tempToken: response.temp_token ?? '', masked: response.user_email_masked })
        return
      }
      await afterLogin(useAuthStore.getState().isAdmin)
    } catch (err) {
      const message = extractI18nErrorMessage(err, t, 'auth.errors', t('auth.loginFailed'))
      setFormError(message)
      showError(message)
    } finally {
      if (captchaConfig.enabled) captcha.reset()
      setBusy(false)
    }
  }

  const onPasskey = async () => {
    if (agreement.blockIfNeeded()) return
    setPasskeyBusy(true)
    try {
      let proof
      if (captchaConfig.actionEnabled) {
        const result = await captcha.verifyAction()
        if (!result) return
        proof = toActionProof(captchaConfig, result)
      }
      await loginWithPasskey(proof)
      await afterLogin(useAuthStore.getState().isAdmin)
    } catch (err) {
      const fallback =
        err instanceof DOMException && err.name === 'NotAllowedError'
          ? t('auth.passkeyCancelled')
          : t('auth.passkeyFailed')
      const message = extractI18nErrorMessage(err, t, 'auth.errors', fallback)
      setFormError(message)
      showError(message)
    } finally {
      if (captchaConfig.actionEnabled) captcha.reset()
      setPasskeyBusy(false)
    }
  }

  const onOAuthStart = async (request: OAuthLoginStart) => {
    if (actionDisabled) return
    if (!captchaConfig.actionEnabled) {
      window.location.href = buildOAuthLoginStartURL(request)
      return
    }
    setBusy(true)
    try {
      const proof = await captcha.verifyAction()
      if (!proof) return
      const result = await startOAuthLogin(request, toActionProof(captchaConfig, proof))
      window.location.href = result.authorize_url
    } catch (err) {
      const message = extractI18nErrorMessage(err, t, 'auth.errors', t('auth.turnstileFailed'))
      setFormError(message)
      showError(message)
    } finally {
      captcha.reset()
      setBusy(false)
    }
  }

  const alreadySignedIn = isAuthenticated && !isAdmin && backendMode

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">{t('auth.welcomeBack')}</h1>
        <p className="text-sm text-muted-foreground">{t('auth.signInToAccount')}</p>
      </div>

      {expired ? (
        <p role="status" className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm">
          {t('auth.reloginRequired')}
        </p>
      ) : null}
      {alreadySignedIn ? (
        <p role="status" className="rounded-md border bg-muted px-3 py-2 text-sm">
          {t('ui.login.alreadySignedIn')}
        </p>
      ) : null}

      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <FormField label={t('auth.emailLabel')} error={errors.email ? t(errors.email) : undefined} required>
          <Input
            type="email"
            name="email"
            autoComplete="username"
            inputMode="email"
            placeholder={t('auth.emailPlaceholder')}
            value={email}
            disabled={busy}
            onChange={(e) => setEmail(e.target.value)}
          />
        </FormField>
        <FormField
          label={t('auth.passwordLabel')}
          error={errors.password ? t(errors.password) : undefined}
          required
        >
          <PasswordInput
            name="password"
            autoComplete="current-password"
            placeholder={t('auth.passwordPlaceholder')}
            value={password}
            disabled={busy}
            onChange={(e) => setPassword(e.target.value)}
          />
        </FormField>
        {passwordResetEnabled && !backendMode ? (
          <div className="-mt-2 text-right">
            <Link href="/forgot-password" className="text-sm font-medium text-primary hover:underline">
              {t('auth.forgotPassword')}
            </Link>
          </div>
        ) : null}

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

        <LoginAgreementPrompt
          accepted={agreement.accepted}
          documents={agreement.documents}
          mode={agreement.mode}
          updatedAt={agreement.updatedAt}
          open={agreement.modalOpen}
          onAccept={agreement.accept}
          onReject={agreement.reject}
          onOpen={() => agreement.setModalOpen(true)}
        />

        {formError ? (
          <p
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {formError}
          </p>
        ) : null}

        <Button type="submit" className="w-full" loading={busy} disabled={!loaded || passkeyBusy}>
          {busy ? t('auth.signingIn') : t('auth.signIn')}
        </Button>

        {showPasskey || showOAuth ? (
          <div className="space-y-3 pt-1">
            <OrDivider label={t('auth.oauthOrContinue')} />
            {showPasskey ? (
              <Button
                type="button"
                variant="outline"
                className="w-full"
                disabled={actionDisabled}
                onClick={onPasskey}
              >
                <KeyRound aria-hidden />
                {passkeyBusy ? t('auth.passkeySigningIn') : t('auth.passkeySignIn')}
              </Button>
            ) : null}
            {showOAuth ? <OAuthButtons disabled={actionDisabled} onStart={onOAuthStart} {...oauth} /> : null}
          </div>
        ) : null}
      </form>

      {!backendMode && loaded && registrationEnabled ? (
        <p className="text-center text-sm text-muted-foreground">
          {t('auth.dontHaveAccount')}{' '}
          <Link href="/register" className="font-medium text-primary hover:underline">
            {t('auth.signUp')}
          </Link>
        </p>
      ) : null}

      {totp ? (
        <TotpStepDialog
          open
          masked={totp.masked}
          onCancel={() => setTotp(null)}
          onSubmit={async (code) => {
            const user = await login2FA(totp.tempToken, code)
            setTotp(null)
            await afterLogin(user?.role === 'admin')
          }}
        />
      ) : null}
    </div>
  )
}
