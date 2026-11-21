/**
 * 邮箱验证：读取 /register 暂存的 register_data（sessionStorage）→ 自动发送验证码 → 提交验证码完成注册。
 * 同时承接 pending OAuth 的“创建账号”流程（pending session 令牌 + 验证码）。
 */
import * as React from 'react'
import { useRouter } from 'next/router'
import { ArrowLeft, CheckCircle2, TriangleAlert } from 'lucide-react'
import {
  getPublicSettings,
  isOAuthLoginCompletion,
  persistOAuthTokenContext,
  sendPendingOAuthVerifyCode,
  sendVerifyCode,
  type PendingOAuthSendVerifyCodeResponse
} from '@/api/auth'
import { apiClient } from '@/api/client'
import { CaptchaChallenge } from '@/components/captcha/LazyCaptchaChallenge'
import { FormField } from '@/components/FormField'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { STORAGE_KEYS } from '@/constants/storage'
import { useAppStore } from '@/stores/app'
import { useAuthStore } from '@/stores/auth'
import { extractApiErrorCode } from '@/utils/apiError'
import { buildAuthErrorMessage } from '@/utils/authError'
import {
  clearAllAffiliateReferralCodes,
  loadAffiliateReferralCode,
  oauthAffiliatePayload
} from '@/utils/oauthAffiliate'
import {
  formatRegistrationEmailSuffixWhitelistForMessage,
  isRegistrationEmailSuffixAllowed,
  normalizeRegistrationEmailSuffixWhitelist
} from '@/utils/registrationEmailPolicy'
import { getLocale, t } from '@/i18n'
import { useLocale } from '@/i18n/react'
import { sanitizeRedirect } from '@/core/safeNavigation'
import { resolveCaptchaConfig, useCaptchaProof, type CaptchaValue } from './shared/useCaptchaProof'

type PendingAuthTokenField = 'pending_auth_token' | 'pending_oauth_token'

interface PendingCreateResponse {
  auth_result?: string
  access_token: string
  refresh_token?: string
  expires_in?: number
  token_type?: string
  provider?: string
  redirect?: string
}

interface RegData {
  email: string
  password: string
  initialToken: string
  initialRandstr: string
  promoCode: string
  invitationCode: string
  affCode: string
  pendingToken: string
  pendingField: PendingAuthTokenField
  pendingProvider: string
  pendingRedirect: string
  adoption: { adoptDisplayName?: boolean; adoptAvatar?: boolean } | null
  hasRegisterData: boolean
}

const EMPTY: RegData = {
  email: '',
  password: '',
  initialToken: '',
  initialRandstr: '',
  promoCode: '',
  invitationCode: '',
  affCode: '',
  pendingToken: '',
  pendingField: 'pending_auth_token',
  pendingProvider: '',
  pendingRedirect: '',
  adoption: null,
  hasRegisterData: false
}

function pendingCallbackRoute(provider: string): string {
  switch (provider.trim().toLowerCase()) {
    case 'linuxdo':
      return '/auth/linuxdo/callback'
    case 'oidc':
      return '/auth/oidc/callback'
    case 'wechat':
      return '/auth/wechat/callback'
    default:
      return '/auth/callback'
  }
}

function readRegData(): RegData {
  const active = useAuthStore.getState().pendingAuthSession
  const raw = window.sessionStorage.getItem(STORAGE_KEYS.registerData)
  if (raw) {
    try {
      const d = JSON.parse(raw)
      const email = d.email || ''
      const password = d.password || ''
      return {
        email,
        password,
        initialToken: d.tencent_captcha_ticket || d.turnstile_token || '',
        initialRandstr: d.tencent_captcha_randstr || '',
        promoCode: d.promo_code || '',
        invitationCode: d.invitation_code || '',
        affCode: d.aff_code || loadAffiliateReferralCode(),
        pendingToken: d.pending_auth_token || active?.token || '',
        pendingField: d.pending_auth_token_field || active?.token_field || 'pending_auth_token',
        pendingProvider: d.pending_provider || active?.provider || '',
        pendingRedirect: d.pending_redirect || active?.redirect || '',
        adoption: d.pending_adoption_decision
          ? {
              adoptDisplayName: d.pending_adoption_decision.adopt_display_name === true,
              adoptAvatar: d.pending_adoption_decision.adopt_avatar === true
            }
          : null,
        hasRegisterData: !!(email && password)
      }
    } catch {
      return { ...EMPTY }
    }
  }
  if (active) {
    return {
      ...EMPTY,
      pendingToken: active.token,
      pendingField: active.token_field,
      pendingProvider: active.provider,
      pendingRedirect: active.redirect || ''
    }
  }
  return { ...EMPTY }
}

function clearStoredCaptchaProof() {
  const raw = window.sessionStorage.getItem(STORAGE_KEYS.registerData)
  if (!raw) return
  try {
    const d = JSON.parse(raw) as Record<string, unknown>
    delete d.turnstile_token
    delete d.tencent_captcha_ticket
    delete d.tencent_captcha_randstr
    window.sessionStorage.setItem(STORAGE_KEYS.registerData, JSON.stringify(d))
  } catch {
    /* 无效的注册暂存由挂载时的解析处理 */
  }
}

export function EmailVerifyPage() {
  useLocale()
  const router = useRouter()
  const registerUser = useAuthStore((s) => s.register)
  const setToken = useAuthStore((s) => s.setToken)
  const setPendingAuthSession = useAuthStore((s) => s.setPendingAuthSession)
  const clearPendingAuthSession = useAuthStore((s) => s.clearPendingAuthSession)
  const showError = useAppStore((s) => s.showError)
  const showSuccess = useAppStore((s) => s.showSuccess)

  const [ready, setReady] = React.useState(false)
  const [settings, setSettings] = React.useState<Awaited<ReturnType<typeof getPublicSettings>> | null>(null)
  const captchaConfig = React.useMemo(() => resolveCaptchaConfig(settings), [settings])
  const { attach: resendRef, ...resend } = useCaptchaProof(captchaConfig)
  const { attach: createRef, ...create } = useCaptchaProof(captchaConfig)

  // 可变的注册数据放在 ref：异步流程读取的总是最新值，且不触发重渲染
  const reg = React.useRef<RegData>({ ...EMPTY })
  const [hasRegisterData, setHasRegisterData] = React.useState(false)
  const [regEmail, setRegEmail] = React.useState('')
  const [pendingFlow, setPendingFlow] = React.useState(false)

  const [code, setCode] = React.useState('')
  const [codeError, setCodeError] = React.useState('')
  const [codeSent, setCodeSent] = React.useState(false)
  const [countdown, setCountdown] = React.useState(0)
  const [sending, setSending] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [showResendCaptcha, setShowResendCaptcha] = React.useState(false)
  const [formError, setFormError] = React.useState('')

  const siteName = settings?.site_name || 'Sub2API'
  const whitelist = React.useMemo(
    () => normalizeRegistrationEmailSuffixWhitelist(settings?.registration_email_suffix_whitelist || []),
    [settings]
  )
  const quotaEnabled = settings?.registration_email_domain_quota_enabled === true
  const isPending = () => Boolean(reg.current.pendingProvider.trim())
  // 域名限量注册开启时交由后端按额度判定；pending OAuth / 换绑流程沿用后端策略，前端不预检
  const bypassPolicy = () => quotaEnabled || isPending() || Boolean(reg.current.pendingToken.trim())

  const emailSuffixMessage = () => {
    if (whitelist.length === 0) return t('auth.emailSuffixNotAllowed')
    return t('auth.emailSuffixNotAllowedWithAllowed', {
      suffixes: formatRegistrationEmailSuffixWhitelistForMessage(whitelist, {
        separator: getLocale().startsWith('zh') ? '、' : ', ',
        more: (count: number) => t('auth.emailSuffixAllowedMore', { count })
      })
    })
  }
  const buildError = (error: unknown, fallback: string) => {
    const c = extractApiErrorCode(error)
    if (c === 'EMAIL_DOMAIN_REGISTRATION_LIMIT') return t('auth.emailDomainRegistrationLimit')
    if (c === 'EMAIL_BLOCKED') return t('auth.errors.EMAIL_BLOCKED')
    return buildAuthErrorMessage(error, { fallback })
  }

  // 倒计时
  React.useEffect(() => {
    if (countdown <= 0) return
    const id = window.setTimeout(() => setCountdown((c) => c - 1), 1000)
    return () => window.clearTimeout(id)
  }, [countdown])

  const persistPending = (provider: string, redirect?: string) => {
    setPendingAuthSession({
      token: reg.current.pendingToken,
      token_field: reg.current.pendingField,
      provider: provider.trim() || reg.current.pendingProvider.trim(),
      redirect: redirect || reg.current.pendingRedirect || undefined
    })
  }

  const sendCode = async (
    cfg: ReturnType<typeof resolveCaptchaConfig>,
    siteSettings: typeof settings,
    fresh?: CaptchaValue
  ) => {
    const r = reg.current
    setSending(true)
    setFormError('')
    let succeeded = false
    let proofUsed = false
    try {
      if (
        !bypassPolicyFor(r, siteSettings) &&
        !isRegistrationEmailSuffixAllowed(
          r.email,
          normalizeRegistrationEmailSuffixWhitelist(siteSettings?.registration_email_suffix_whitelist || [])
        )
      ) {
        const message = emailSuffixMessage()
        setFormError(message)
        showError(message)
        return
      }
      // 优先使用重发时新获取的 token（初始 token 可能已被使用）
      const token = fresh?.token || r.initialToken || undefined
      const randstr = fresh?.randstr || r.initialRandstr || undefined
      const payload = {
        email: r.email,
        [r.pendingField]: r.pendingToken || undefined,
        turnstile_token: cfg.turnstileEnabled || cfg.aliyunEnabled ? token : undefined,
        tencent_captcha_ticket: cfg.tencentEnabled ? token : undefined,
        tencent_captcha_randstr: cfg.tencentEnabled ? randstr : undefined
      } as Parameters<typeof sendVerifyCode>[0]
      proofUsed = Boolean(payload.turnstile_token || payload.tencent_captcha_ticket)
      const response = r.pendingProvider.trim()
        ? await sendPendingOAuthVerifyCode(payload)
        : await sendVerifyCode(payload)
      succeeded = true
      if (r.pendingProvider.trim()) {
        const pending = response as PendingOAuthSendVerifyCodeResponse
        if (pending.auth_result === 'pending_session') {
          window.sessionStorage.removeItem(STORAGE_KEYS.registerData)
          persistPending(pending.provider || r.pendingProvider, pending.redirect)
          await router.push(pendingCallbackRoute(pending.provider || r.pendingProvider))
          return
        }
      }
      setCodeSent(true)
      setCountdown(response.countdown)
      setShowResendCaptcha(false)
    } catch (error) {
      const message = buildError(error, t('auth.sendCodeFailed'))
      setFormError(message)
      showError(message)
    } finally {
      if (proofUsed) {
        clearStoredCaptchaProof()
        r.initialToken = ''
        r.initialRandstr = ''
        resend.reset()
        if (!succeeded && cfg.turnstileEnabled) setShowResendCaptcha(true)
      }
      setSending(false)
    }
  }

  // 启动：读取暂存数据 + 公开设置，有有效数据时自动发送验证码
  const started = React.useRef(false)
  React.useEffect(() => {
    if (started.current) return
    started.current = true
    reg.current = readRegData()
    setHasRegisterData(reg.current.hasRegisterData)
    setRegEmail(reg.current.email)
    setPendingFlow(Boolean(reg.current.pendingProvider.trim()))
    void (async () => {
      let loaded: typeof settings = null
      try {
        loaded = await getPublicSettings()
      } catch (error) {
        console.error('Failed to load public settings:', error)
      }
      setSettings(loaded)
      setReady(true)
      if (reg.current.hasRegisterData) await sendCode(resolveCaptchaConfig(loaded), loaded)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleResend = async () => {
    if (captchaConfig.turnstileEnabled && !showResendCaptcha) {
      setShowResendCaptcha(true)
      return
    }
    if (captchaConfig.turnstileEnabled && !resend.token) {
      resend.setError(t('auth.completeVerification'))
      return
    }
    const proof = await resend.acquireActionProof()
    if (!proof) return
    await sendCode(captchaConfig, settings, proof)
  }

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError('')
    const value = code.trim()
    if (!value) return (setCodeError(t('auth.codeRequired')), showError(t('auth.codeRequired')))
    if (!/^\d{6}$/.test(value)) return (setCodeError(t('auth.invalidCode')), showError(t('auth.invalidCode')))
    setCodeError('')
    const r = reg.current
    if (!bypassPolicy() && !isRegistrationEmailSuffixAllowed(r.email, whitelist)) {
      const message = emailSuffixMessage()
      setFormError(message)
      showError(message)
      return
    }
    // 创建账号的验证码凭据：pending OAuth 流程才需要（动作触发式验证在此弹窗）
    let createProof: CaptchaValue | null = null
    if (isPending() && captchaConfig.enabled) {
      createProof = await create.acquireActionProof()
      if (!createProof) return
    }

    setBusy(true)
    try {
      if (isPending()) {
        const fresh = createProof ?? { token: '', randstr: '' }
        const payload: Record<string, unknown> = {
          email: r.email,
          password: r.password,
          verify_code: value,
          ...((captchaConfig.turnstileEnabled || captchaConfig.aliyunEnabled) && fresh.token
            ? { turnstile_token: fresh.token }
            : {}),
          ...(captchaConfig.tencentEnabled && fresh.token
            ? { tencent_captcha_ticket: fresh.token, tencent_captcha_randstr: fresh.randstr }
            : {}),
          ...oauthAffiliatePayload(r.affCode || loadAffiliateReferralCode())
        }
        if (r.invitationCode) payload.invitation_code = r.invitationCode
        if (r.adoption?.adoptDisplayName !== undefined)
          payload.adopt_display_name = r.adoption.adoptDisplayName
        if (r.adoption?.adoptAvatar !== undefined) payload.adopt_avatar = r.adoption.adoptAvatar
        const { data } = await apiClient.post<PendingCreateResponse>(
          '/auth/oauth/pending/create-account',
          payload
        )
        if (data.auth_result === 'pending_session') {
          window.sessionStorage.removeItem(STORAGE_KEYS.registerData)
          persistPending(data.provider || r.pendingProvider, data.redirect)
          await router.push(pendingCallbackRoute(data.provider || r.pendingProvider))
          return
        }
        if (!isOAuthLoginCompletion(data)) throw new Error(t('auth.verifyFailed'))
        persistOAuthTokenContext(data)
        await setToken(data.access_token)
        clearPendingAuthSession?.()
      } else {
        const token = r.initialToken || undefined
        await registerUser({
          email: r.email,
          password: r.password,
          verify_code: value,
          turnstile_token: captchaConfig.turnstileEnabled || captchaConfig.aliyunEnabled ? token : undefined,
          tencent_captcha_ticket: captchaConfig.tencentEnabled ? token : undefined,
          tencent_captcha_randstr: captchaConfig.tencentEnabled ? r.initialRandstr || undefined : undefined,
          promo_code: r.promoCode || undefined,
          invitation_code: r.invitationCode || undefined,
          ...(r.affCode ? { aff_code: r.affCode } : {})
        })
      }
      window.sessionStorage.removeItem(STORAGE_KEYS.registerData)
      clearAllAffiliateReferralCodes()
      showSuccess(t('auth.accountCreatedSuccess', { siteName }))
      await router.push(sanitizeRedirect(r.pendingRedirect, '/dashboard'))
    } catch (error) {
      const message = buildError(error, t('auth.verifyFailed'))
      setFormError(message)
      showError(message)
    } finally {
      r.initialToken = ''
      r.initialRandstr = ''
      if (isPending() && captchaConfig.enabled) create.reset()
      setBusy(false)
    }
  }

  const back = () => {
    window.sessionStorage.removeItem(STORAGE_KEYS.registerData)
    void router.push('/register')
  }

  const createCaptchaRequired = pendingFlow && captchaConfig.turnstileEnabled
  const resendLabel = sending
    ? t('auth.sendingCode')
    : captchaConfig.enabled && !showResendCaptcha
      ? t('auth.clickToResend')
      : t('auth.resendCode')

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">{t('auth.verifyYourEmail')}</h1>
        <p className="text-sm text-muted-foreground">{t('auth.sendCodeDesc')}</p>
        {hasRegisterData ? <p className="font-medium text-sm">{regEmail}</p> : null}
      </div>

      {ready && !hasRegisterData ? (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm"
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
          <div>
            <p className="font-medium">{t('auth.sessionExpired')}</p>
            <p className="mt-1 text-muted-foreground">{t('auth.sessionExpiredDesc')}</p>
          </div>
        </div>
      ) : (
        <form onSubmit={handleVerify} noValidate className="space-y-4">
          <FormField
            label={t('auth.verificationCode')}
            error={codeError || undefined}
            description={t('auth.verificationCodeHint')}
            required
          >
            <Input
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="000000"
              disabled={busy}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              className="text-center font-mono text-lg tracking-[0.4em]"
            />
          </FormField>

          {codeSent ? (
            <p role="status" className="flex items-center gap-2 text-sm text-success">
              <CheckCircle2 className="size-4" aria-hidden /> {t('auth.codeSentSuccess')}
            </p>
          ) : null}

          {captchaConfig.actionEnabled || (captchaConfig.turnstileEnabled && showResendCaptcha) ? (
            <div className="space-y-1.5">
              <CaptchaChallenge ref={resendRef} {...resend.challengeProps} />
              {resend.error ? (
                <p role="alert" className="text-xs text-destructive">
                  {resend.error}
                </p>
              ) : null}
            </div>
          ) : null}

          {pendingFlow && captchaConfig.enabled ? (
            <div className="space-y-1.5">
              <CaptchaChallenge ref={createRef} {...create.challengeProps} />
              {create.error ? (
                <p role="alert" className="text-xs text-destructive">
                  {create.error}
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

          <Button
            type="submit"
            className="w-full"
            loading={busy}
            disabled={!code || (createCaptchaRequired && !create.token)}
          >
            {busy ? t('auth.verifying') : t('auth.verifyAndCreate')}
          </Button>

          <div className="text-center">
            {countdown > 0 ? (
              <Button type="button" variant="ghost" size="sm" disabled>
                {t('auth.resendCountdown', { countdown })}
              </Button>
            ) : (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleResend}
                disabled={sending || (captchaConfig.turnstileEnabled && showResendCaptcha && !resend.token)}
              >
                {resendLabel}
              </Button>
            )}
          </div>
        </form>
      )}

      <div className="text-center">
        <Button type="button" variant="link" size="sm" onClick={back}>
          <ArrowLeft aria-hidden />
          {t('auth.backToRegistration')}
        </Button>
      </div>
    </div>
  )
}

function bypassPolicyFor(
  r: RegData,
  settings: { registration_email_domain_quota_enabled?: boolean } | null
): boolean {
  return (
    settings?.registration_email_domain_quota_enabled === true ||
    Boolean(r.pendingProvider.trim()) ||
    Boolean(r.pendingToken.trim())
  )
}
