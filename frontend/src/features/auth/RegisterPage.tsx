/** 注册页：邮箱 / 密码 / 邀请码 / 优惠码 / 推广码 / 验证码 / 协议；开启邮箱验证时暂存 register_data 并跳转 /email-verify。 */
import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { CheckCircle2, Loader2, XCircle } from 'lucide-react'
import {
  buildOAuthLoginStartURL,
  isWeChatWebOAuthEnabled,
  startOAuthLogin,
  validateInvitationCode,
  validatePromoCode,
  type OAuthLoginStart
} from '@/api/auth'
import { CaptchaChallenge } from '@/components/captcha/LazyCaptchaChallenge'
import { FormField } from '@/components/FormField'
import { PasswordInput } from '@/components/PasswordInput'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { STORAGE_KEYS } from '@/constants/storage'
import { useAppStore } from '@/stores/app'
import { useAuthStore } from '@/stores/auth'
import { extractApiErrorCode, extractI18nErrorMessage } from '@/utils/apiError'
import { buildAuthErrorMessage } from '@/utils/authError'
import {
  clearAffiliateReferralCode,
  loadAffiliateReferralCode,
  resolveAffiliateReferralCode
} from '@/utils/oauthAffiliate'
import { formatRegistrationEmailSuffixWhitelistForMessage } from '@/utils/registrationEmailPolicy'
import { getLocale, t } from '@/i18n'
import { useLocale } from '@/i18n/react'
import { LoginAgreementPrompt } from './shared/LoginAgreementPrompt'
import { OAuthButtons, OrDivider } from './shared/OAuthButtons'
import { getQueryParam, useAuthSettings } from './shared/useAuthSettings'
import {
  resolveCaptchaConfig,
  toActionProof,
  toRequestFields,
  useCaptchaProof,
  type CaptchaValue
} from './shared/useCaptchaProof'
import { useLoginAgreement } from './shared/useLoginAgreement'
import { normalizeWhitelist, promoErrorKey, validateRegisterFields, type RegisterErrors } from './validation'

interface CodeState {
  validating: boolean
  valid: boolean
  invalid: boolean
  message: string
  bonus?: number | null
}
const IDLE: CodeState = { validating: false, valid: false, invalid: false, message: '', bonus: null }

function useDebouncedValidator(run: (code: string) => Promise<CodeState>) {
  const [state, setState] = React.useState<CodeState>(IDLE)
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const runRef = React.useRef(run)
  React.useEffect(() => {
    runRef.current = run
  })
  React.useEffect(() => () => void (timer.current && clearTimeout(timer.current)), [])

  const validateNow = React.useCallback(async (code: string): Promise<CodeState> => {
    setState({ ...IDLE, validating: true })
    const next = await runRef.current(code)
    setState(next)
    return next
  }, [])
  const onInput = React.useCallback(
    (raw: string) => {
      const code = raw.trim()
      setState(IDLE)
      if (timer.current) clearTimeout(timer.current)
      if (!code) return
      timer.current = setTimeout(() => void validateNow(code), 500)
    },
    [validateNow]
  )
  return { state, onInput, validateNow }
}

function CodeStatus({ state, validText }: { state: CodeState; validText: string }) {
  if (state.validating)
    return (
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" aria-hidden /> {t('auth.processing')}
      </p>
    )
  if (state.valid)
    return (
      <p className="flex items-center gap-1.5 text-xs text-success">
        <CheckCircle2 className="size-3.5" aria-hidden /> {validText}
      </p>
    )
  if (state.invalid)
    return (
      <p role="alert" className="flex items-center gap-1.5 text-xs text-destructive">
        <XCircle className="size-3.5" aria-hidden /> {state.message}
      </p>
    )
  return null
}

export function RegisterPage() {
  useLocale()
  const router = useRouter()
  const registerUser = useAuthStore((s) => s.register)
  const showError = useAppStore((s) => s.showError)
  const showSuccess = useAppStore((s) => s.showSuccess)
  const cached = useAppStore((s) => s.cachedPublicSettings)

  const { settings, loaded } = useAuthSettings()
  const captchaConfig = React.useMemo(() => resolveCaptchaConfig(settings), [settings])
  const { attach: captchaRef, ...captcha } = useCaptchaProof(captchaConfig)
  const agreement = useLoginAgreement(settings, loaded, 'register')

  const [email, setEmail] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [confirm, setConfirm] = React.useState('')
  // URL 参数 ?promo= 仅在优惠码功能开启时生效（见下方 promoEnabled 校验）
  const [promo, setPromo] = React.useState(() => getQueryParam('promo'))
  const [invitation, setInvitation] = React.useState('')
  // 推广码：URL 中的 aff / aff_code → affiliate_referral_code
  const [affCode, setAffCode] = React.useState(() =>
    resolveAffiliateReferralCode(getQueryParam('aff'), getQueryParam('aff_code'))
  )
  const [errors, setErrors] = React.useState<RegisterErrors>({})
  const [busy, setBusy] = React.useState(false)
  const [formError, setFormError] = React.useState('')

  const siteName = settings?.site_name || 'Sub2API'
  const registrationEnabled = loaded ? settings?.registration_enabled !== false || !settings : true
  const emailVerifyEnabled = settings?.email_verify_enabled === true
  // 公开设置已在启动时注入 store：首屏以此为准，避免关闭的优惠码字段闪现；注入缺失时 fail-closed
  const promoEnabled = loaded ? settings?.promo_code_enabled === true : cached?.promo_code_enabled === true
  const invitationEnabled = settings?.invitation_code_enabled === true
  const whitelist = React.useMemo(
    () => normalizeWhitelist(settings?.registration_email_suffix_whitelist),
    [settings]
  )
  const quotaEnabled = settings?.registration_email_domain_quota_enabled === true
  const backendMode = settings?.backend_mode_enabled === true

  const oauth = {
    githubEnabled: settings?.github_oauth_enabled === true,
    googleEnabled: settings?.google_oauth_enabled === true,
    linuxdoEnabled: settings?.linuxdo_oauth_enabled === true,
    wechatEnabled: settings ? isWeChatWebOAuthEnabled(settings) : false,
    oidcEnabled: settings?.oidc_oauth_enabled === true,
    oidcProviderName: settings?.oidc_oauth_provider_name || 'OIDC'
  }
  const showOAuth =
    oauth.githubEnabled ||
    oauth.googleEnabled ||
    oauth.linuxdoEnabled ||
    oauth.wechatEnabled ||
    oauth.oidcEnabled
  const actionDisabled = busy || !loaded || agreement.gateActive

  const promoValidator = useDebouncedValidator(async (code) => {
    try {
      const result = await validatePromoCode(code)
      if (result.valid) return { ...IDLE, valid: true, bonus: result.bonus_amount || 0 }
      return { ...IDLE, invalid: true, message: t(promoErrorKey(result.error_code)) }
    } catch (error) {
      console.error('Failed to validate promo code:', error)
      return { ...IDLE, invalid: true, message: t('auth.promoCodeInvalid') }
    }
  })
  const invitationValidator = useDebouncedValidator(async (code) => {
    try {
      const result = await validateInvitationCode(code)
      return result.valid
        ? { ...IDLE, valid: true }
        : { ...IDLE, invalid: true, message: t('auth.invitationCodeInvalid') }
    } catch {
      return { ...IDLE, invalid: true, message: t('auth.invitationCodeInvalid') }
    }
  })

  // URL 中的 promo 参数：设置加载后确认优惠码功能开启，再校验预填的优惠码
  const promoPrefilled = React.useRef(false)
  React.useEffect(() => {
    if (!loaded || !promoEnabled || promoPrefilled.current) return
    promoPrefilled.current = true
    if (promo.trim()) void promoValidator.validateNow(promo.trim())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, promoEnabled])

  const emailSuffixMessage = () => {
    if (whitelist.length === 0) return t('auth.emailSuffixNotAllowed')
    const separator = getLocale().startsWith('zh') ? '、' : ', '
    return t('auth.emailSuffixNotAllowedWithAllowed', {
      suffixes: formatRegistrationEmailSuffixWhitelistForMessage(whitelist, {
        separator,
        more: (count: number) => t('auth.emailSuffixAllowedMore', { count })
      })
    })
  }
  const fieldMessage = (key: keyof RegisterErrors) => {
    const v = errors[key]
    if (!v || typeof v !== 'string') return undefined
    return key === 'email' && errors.emailSuffixNotAllowed ? emailSuffixMessage() : t(v)
  }

  const requestPayload = (aff: string, proof: CaptchaValue) => ({
    email,
    password,
    ...toRequestFields(captchaConfig, proof),
    promo_code: promoEnabled ? promo || undefined : undefined,
    invitation_code: invitation || undefined,
    ...(aff ? { aff_code: aff } : {})
  })

  const buildRegistrationError = (error: unknown) => {
    const code = extractApiErrorCode(error)
    if (code === 'EMAIL_DOMAIN_REGISTRATION_LIMIT') return t('auth.emailDomainRegistrationLimit')
    if (code === 'EMAIL_BLOCKED') return t('auth.errors.EMAIL_BLOCKED')
    return buildAuthErrorMessage(error, { fallback: t('auth.registrationFailed') })
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError('')
    if (agreement.blockIfNeeded()) return
    const fieldErrors = validateRegisterFields(
      { email, password, confirmPassword: confirm, invitationCode: invitation },
      {
        emailDomainQuotaEnabled: quotaEnabled,
        emailSuffixWhitelist: whitelist,
        invitationCodeEnabled: invitationEnabled
      }
    )
    setErrors(fieldErrors)
    const turnstileMissing = captchaConfig.turnstileEnabled && !captcha.token
    if (turnstileMissing) captcha.setError(t('auth.completeVerification'))
    const firstKey = (['email', 'password', 'confirmPassword', 'invitationCode'] as const).find(
      (k) => fieldErrors[k]
    )
    if (firstKey || turnstileMissing) {
      if (firstKey) {
        const v = fieldErrors[firstKey]!
        showError(firstKey === 'email' && fieldErrors.emailSuffixNotAllowed ? emailSuffixMessage() : t(v))
      }
      return
    }

    if (promoEnabled && promo.trim()) {
      if (promoValidator.state.validating) return setFormError(t('auth.promoCodeValidating'))
      if (promoValidator.state.invalid) return setFormError(t('auth.promoCodeInvalidCannotRegister'))
    }
    if (invitationEnabled) {
      if (invitationValidator.state.validating) return setFormError(t('auth.invitationCodeValidating'))
      if (invitationValidator.state.invalid)
        return setFormError(t('auth.invitationCodeInvalidCannotRegister'))
      if (invitation.trim() && !invitationValidator.state.valid) {
        const result = await invitationValidator.validateNow(invitation.trim())
        if (!result.valid) return setFormError(t('auth.invitationCodeInvalidCannotRegister'))
      }
    }

    const proof = await captcha.acquireActionProof()
    if (!proof) return

    setBusy(true)
    try {
      const aff = affCode.trim() || loadAffiliateReferralCode()
      if (aff) setAffCode(aff)
      if (emailVerifyEnabled) {
        // 暂存注册数据，由 /email-verify 读取后发送验证码并完成注册
        window.sessionStorage.setItem(STORAGE_KEYS.registerData, JSON.stringify(requestPayload(aff, proof)))
        await router.push('/email-verify')
        return
      }
      await registerUser(requestPayload(aff, proof))
      clearAffiliateReferralCode()
      showSuccess(t('auth.accountCreatedSuccess', { siteName }))
      await router.push('/dashboard')
    } catch (err) {
      const message = buildRegistrationError(err)
      setFormError(message)
      showError(message)
    } finally {
      if (captchaConfig.enabled) captcha.reset()
      setBusy(false)
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

  const header = (
    <div className="space-y-1.5">
      <h1 className="text-2xl font-semibold tracking-tight">{t('auth.createAccount')}</h1>
      <p className="text-sm text-muted-foreground">{t('auth.signUpToStart', { siteName })}</p>
    </div>
  )
  const footer = (
    <p className="text-center text-sm text-muted-foreground">
      {t('auth.alreadyHaveAccount')}{' '}
      <Link href="/login" className="font-medium text-primary hover:underline">
        {t('auth.signIn')}
      </Link>
    </p>
  )

  if (loaded && !registrationEnabled) {
    return (
      <div className="space-y-6">
        {header}
        <p role="status" className="rounded-md border bg-muted px-3 py-3 text-sm">
          {t('auth.registrationDisabled')}
        </p>
        {footer}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {header}
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <FormField label={t('auth.emailLabel')} error={fieldMessage('email')} required>
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
        <FormField
          label={t('auth.passwordLabel')}
          error={fieldMessage('password')}
          description={t('auth.passwordHint')}
          required
        >
          <PasswordInput
            name="password"
            autoComplete="new-password"
            placeholder={t('auth.createPasswordPlaceholder')}
            value={password}
            disabled={busy}
            onChange={(e) => setPassword(e.target.value)}
          />
        </FormField>
        <FormField label={t('auth.confirmPassword')} error={fieldMessage('confirmPassword')} required>
          <PasswordInput
            name="confirm_password"
            autoComplete="new-password"
            placeholder={t('auth.confirmPasswordPlaceholder')}
            value={confirm}
            disabled={busy}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </FormField>

        {invitationEnabled ? (
          <div className="space-y-1.5">
            <FormField label={t('auth.invitationCodeLabel')} error={fieldMessage('invitationCode')} required>
              <Input
                name="invitation_code"
                autoComplete="off"
                placeholder={t('auth.invitationCodePlaceholder')}
                value={invitation}
                disabled={busy}
                onChange={(e) => {
                  setInvitation(e.target.value)
                  setErrors((prev) => ({ ...prev, invitationCode: undefined }))
                  invitationValidator.onInput(e.target.value)
                }}
              />
            </FormField>
            <CodeStatus state={invitationValidator.state} validText={t('auth.invitationCodeValid')} />
          </div>
        ) : null}

        {promoEnabled ? (
          <div className="space-y-1.5">
            <FormField label={`${t('auth.promoCodeLabel')} (${t('common.optional')})`}>
              <Input
                name="promo_code"
                autoComplete="off"
                placeholder={t('auth.promoCodePlaceholder')}
                value={promo}
                disabled={busy}
                onChange={(e) => {
                  setPromo(e.target.value)
                  promoValidator.onInput(e.target.value)
                }}
              />
            </FormField>
            <CodeStatus
              state={promoValidator.state}
              validText={t('auth.promoCodeValid', { amount: (promoValidator.state.bonus ?? 0).toFixed(2) })}
            />
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

        <Button type="submit" className="w-full" loading={busy} disabled={!loaded}>
          {busy ? t('auth.processing') : emailVerifyEnabled ? t('auth.continue') : t('auth.createAccount')}
        </Button>

        {showOAuth && !backendMode ? (
          <div className="space-y-3 pt-1">
            <OrDivider label={t('auth.oauthOrContinue')} />
            <OAuthButtons
              disabled={actionDisabled}
              affCode={affCode}
              promoCode={promo}
              onStart={onOAuthStart}
              {...oauth}
            />
          </div>
        ) : null}
      </form>
      {footer}
    </div>
  )
}
