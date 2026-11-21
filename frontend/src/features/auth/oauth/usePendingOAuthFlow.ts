/**
 * pending OAuth 回调流程引擎（LinuxDo / OIDC / 微信 / 钉钉 共用，逐条对应 Vue 版回调页脚本）。
 *
 * 流程：读取 fragment / query →（legacy 令牌直接登录 | 邀请码 | 错误）→ 兑换 pending 会话 →
 * 依次判断：邀请码、TOTP 挑战、账号动作（选择 / 创建 / 绑定）、资料采用确认、最终登录或绑定。
 */
import * as React from 'react'
import { useRouter } from 'next/router'
import {
  completeLinuxDoOAuthRegistration,
  completeOIDCOAuthRegistration,
  completeWeChatOAuthRegistration,
  exchangePendingOAuthCompletion,
  getAuthToken,
  getOAuthCompletionKind,
  getPublicSettings,
  hasExplicitWeChatOAuthCapabilities,
  isOAuthLoginCompletion,
  login2FA,
  persistOAuthTokenContext,
  prepareOAuthBindAccessTokenCookie,
  resolveWeChatOAuthStartStrict,
  type OAuthAdoptionDecision,
  type PendingOAuthExchangeResponse
} from '@/api/auth'
import { apiClient } from '@/api/client'
import { buildApiUrl } from '@/api/url'
import { useAppStore } from '@/stores/app'
import { useAuthStore } from '@/stores/auth'
import {
  clearAllAffiliateReferralCodes,
  loadOAuthAffiliateCode,
  oauthAffiliatePayload
} from '@/utils/oauthAffiliate'
import { t } from '@/i18n'
import type { PendingOAuthCreateAccountPayload } from './PendingOAuthCreateAccountForm'
import {
  extractPendingAccountEmail,
  getRequestErrorMessage,
  hasSuggestedProfile,
  isCreateAccountRecoveryError,
  isTotpChallenge,
  parseFragmentParams,
  readLegacyFragmentLogin,
  requiresEmailCompletion,
  resolvePendingAccountAction,
  sanitizeOAuthRedirect,
  serializeAdoptionDecision,
  type PendingCompletion
} from './pending'

export type OAuthProvider = 'linuxdo' | 'oidc' | 'wechat' | 'dingtalk'
export type FlowStep = 'none' | 'invitation' | 'adoption' | 'choose' | 'create' | 'bind' | 'totp'

export interface FlowState {
  processing: boolean
  errorMessage: string
  step: FlowStep
  submitting: boolean
  redirectTo: string
  invitationCode: string
  adoptionRequired: boolean
  suggestedDisplayName: string
  suggestedAvatarUrl: string
  adoptDisplayName: boolean
  adoptAvatar: boolean
  pendingEmail: string
  bindEmail: string
  bindPassword: string
  canReturnToCreate: boolean
  accountActionError: string
  legacyToken: string
  totpTempToken: string
  totpCode: string
  totpMasked: string
  existingAccountEmail: string
  providerName: string
}

const INITIAL: FlowState = {
  processing: true,
  errorMessage: '',
  step: 'none',
  submitting: false,
  redirectTo: '/dashboard',
  invitationCode: '',
  adoptionRequired: false,
  suggestedDisplayName: '',
  suggestedAvatarUrl: '',
  adoptDisplayName: true,
  adoptAvatar: true,
  pendingEmail: '',
  bindEmail: '',
  bindPassword: '',
  canReturnToCreate: false,
  accountActionError: '',
  legacyToken: '',
  totpTempToken: '',
  totpCode: '',
  totpMasked: '',
  existingAccountEmail: '',
  providerName: ''
}

/** i18n 命名空间：微信沿用 oidc 的文案。 */
export function i18nNamespace(provider: OAuthProvider): 'linuxdo' | 'oidc' | 'dingtalk' {
  return provider === 'wechat' ? 'oidc' : provider
}

export function usePendingOAuthFlow(provider: OAuthProvider, initialProviderName: string) {
  const router = useRouter()
  const setToken = useAuthStore((s) => s.setToken)
  const setPendingAuthSession = useAuthStore((s) => s.setPendingAuthSession)
  const clearPendingAuthSessionStore = useAuthStore((s) => s.clearPendingAuthSession)
  const showError = useAppStore((s) => s.showError)
  const showSuccess = useAppStore((s) => s.showSuccess)
  const ns = i18nNamespace(provider)

  const [state, setState] = React.useState<FlowState>({ ...INITIAL, providerName: initialProviderName })
  const ref = React.useRef(state)
  const patch = React.useCallback((p: Partial<FlowState>) => {
    ref.current = { ...ref.current, ...p }
    setState(ref.current)
  }, [])

  // 错误一律同步以 Toast 提示（与 Vue 版 watch 行为一致）
  React.useEffect(() => {
    if (state.errorMessage) showError(state.errorMessage)
  }, [state.errorMessage, showError])
  React.useEffect(() => {
    if (state.accountActionError) showError(state.accountActionError)
  }, [state.accountActionError, showError])

  const query = () => new URLSearchParams(window.location.search)

  const persistPending = (redirect?: string) =>
    setPendingAuthSession({
      token: '',
      token_field: 'pending_oauth_token',
      provider,
      redirect: sanitizeOAuthRedirect(redirect || ref.current.redirectTo)
    })

  const decision = (): OAuthAdoptionDecision => ({
    adoptDisplayName: ref.current.adoptDisplayName,
    adoptAvatar: ref.current.adoptAvatar
  })

  const applyAdoption = (c: PendingOAuthExchangeResponse) => {
    const name = c.suggested_display_name || ''
    const avatar = c.suggested_avatar_url || ''
    patch({
      adoptionRequired: c.adoption_required === true,
      suggestedDisplayName: name,
      suggestedAvatarUrl: avatar,
      ...(name ? {} : { adoptDisplayName: false }),
      ...(avatar ? {} : { adoptAvatar: false })
    })
  }

  const applyAction = (c: PendingCompletion): boolean => {
    const action = resolvePendingAccountAction(c)
    const email = extractPendingAccountEmail(
      c,
      provider === 'wechat' ? (query().get('email') || '').trim() : ''
    )
    const reset = { accountActionError: '', totpTempToken: '', totpCode: '', totpMasked: '' }
    if (action === 'choose_account_action') {
      patch({
        ...reset,
        step: 'choose',
        pendingEmail: email,
        bindEmail: email,
        bindPassword: '',
        canReturnToCreate: false
      })
      return true
    }
    if (action === 'create_account') {
      patch({ ...reset, step: 'create', pendingEmail: email, canReturnToCreate: true })
      return true
    }
    if (action === 'bind_login') {
      patch({ ...reset, step: 'bind', bindEmail: email, bindPassword: '', canReturnToCreate: false })
      return true
    }
    patch({ ...reset, canReturnToCreate: false })
    return false
  }

  const applyTotp = (c: PendingCompletion): boolean => {
    if (!isTotpChallenge(c)) return false
    patch({
      step: 'totp',
      totpTempToken: c.temp_token!,
      totpCode: '',
      totpMasked: c.user_email_masked || '',
      processing: false
    })
    return true
  }

  const finalizeCompletion = async (completion: PendingOAuthExchangeResponse, redirect: string) => {
    if (getOAuthCompletionKind(completion) === 'bind') {
      clearPendingAuthSessionStore()
      clearAllAffiliateReferralCodes()
      showSuccess(t('profile.authBindings.bindSuccess'))
      await router.replace(sanitizeOAuthRedirect(completion.redirect || '/profile'))
      return
    }
    if (!isOAuthLoginCompletion(completion)) throw new Error(t(`auth.${ns}.callbackMissingToken`))
    persistOAuthTokenContext(completion)
    await setToken(completion.access_token)
    clearAllAffiliateReferralCodes()
    showSuccess(t('auth.loginSuccess'))
    await router.replace(redirect)
  }

  const goEmailCompletion = (redirect: string) =>
    router.replace('/auth/dingtalk/email-completion?redirect=' + encodeURIComponent(redirect))

  const finalizePending = async (completion: PendingCompletion) => {
    applyAdoption(completion)
    const redirect = sanitizeOAuthRedirect(completion.redirect || ref.current.redirectTo)
    // 钉钉：用户无邮箱，需要跳到补邮箱页面
    if (provider === 'dingtalk' && requiresEmailCompletion(completion)) {
      await goEmailCompletion(redirect)
      return
    }
    if (completion.error === 'invitation_required') {
      patch({ step: 'invitation', processing: false })
      persistPending(redirect)
      return
    }
    if (applyTotp(completion)) {
      persistPending(redirect)
      return
    }
    if (applyAction(completion)) {
      patch({ processing: false })
      persistPending(redirect)
      return
    }
    if (completion.auth_result === 'pending_session') {
      patch({ step: 'none', processing: false })
      persistPending(redirect)
      return
    }
    await finalizeCompletion(completion, redirect)
  }

  // ---------- 动作 ----------
  const submitInvitation = async () => {
    patch({ accountActionError: '' })
    const code = ref.current.invitationCode.trim()
    if (!code) return
    patch({ submitting: true })
    try {
      const affCode = loadOAuthAffiliateCode()
      const d = decision()
      let completion: PendingCompletion
      if (provider === 'dingtalk') {
        const { data } = await apiClient.post<PendingCompletion>(
          '/auth/oauth/dingtalk/complete-registration',
          {
            pending_oauth_token: ref.current.legacyToken || undefined,
            invitation_code: code,
            ...oauthAffiliatePayload(affCode),
            ...serializeAdoptionDecision(d)
          }
        )
        completion = data
      } else if (ref.current.legacyToken) {
        const { data } = await apiClient.post<PendingCompletion>(
          `/auth/oauth/${provider}/complete-registration`,
          {
            pending_oauth_token: ref.current.legacyToken,
            invitation_code: code,
            ...oauthAffiliatePayload(affCode),
            ...serializeAdoptionDecision(d)
          }
        )
        completion = data
      } else {
        const complete =
          provider === 'linuxdo'
            ? completeLinuxDoOAuthRegistration
            : provider === 'oidc'
              ? completeOIDCOAuthRegistration
              : completeWeChatOAuthRegistration
        completion = (
          affCode ? await complete(code, d, affCode) : await complete(code, d)
        ) as PendingCompletion
      }
      await finalizePending(completion)
    } catch (e) {
      patch({ accountActionError: getRequestErrorMessage(e, t(`auth.${ns}.completeRegistrationFailed`)) })
    } finally {
      patch({ submitting: false })
    }
  }

  const continueLogin = async () => {
    patch({ submitting: true })
    try {
      await finalizePending((await exchangePendingOAuthCompletion(decision())) as PendingCompletion)
    } catch (e) {
      patch({ errorMessage: getRequestErrorMessage(e, t('auth.loginFailed')), step: 'none' })
    } finally {
      patch({ submitting: false })
    }
  }

  const createAccount = async (payload: PendingOAuthCreateAccountPayload) => {
    patch({ accountActionError: '' })
    if (!payload.email || !payload.password) return
    patch({ submitting: true })
    try {
      const { data } = await apiClient.post<PendingCompletion>('/auth/oauth/pending/create-account', {
        email: payload.email,
        password: payload.password,
        verify_code: payload.verifyCode || undefined,
        ...(payload.turnstileToken ? { turnstile_token: payload.turnstileToken } : {}),
        ...(payload.tencentCaptchaTicket
          ? {
              tencent_captcha_ticket: payload.tencentCaptchaTicket,
              tencent_captcha_randstr: payload.tencentCaptchaRandstr
            }
          : {}),
        invitation_code: payload.invitationCode || undefined,
        ...oauthAffiliatePayload(loadOAuthAffiliateCode()),
        ...serializeAdoptionDecision(decision())
      })
      await finalizePending(data)
    } catch (e) {
      if (isCreateAccountRecoveryError(e)) {
        switchToBind(payload.email.trim())
        return
      }
      patch({ accountActionError: getRequestErrorMessage(e, t('auth.loginFailed')) })
    } finally {
      patch({ submitting: false })
    }
  }

  const bindLogin = async () => {
    patch({ accountActionError: '' })
    const email = ref.current.bindEmail.trim()
    const password = ref.current.bindPassword
    if (!email || !password) return
    patch({ submitting: true })
    try {
      const { data } = await apiClient.post<PendingCompletion>('/auth/oauth/pending/bind-login', {
        email,
        password,
        ...serializeAdoptionDecision(decision())
      })
      await finalizePending(data)
    } catch (e) {
      patch({ accountActionError: getRequestErrorMessage(e, t('auth.loginFailed')) })
    } finally {
      patch({ submitting: false })
    }
  }

  const submitTotp = async () => {
    const code = ref.current.totpCode.trim()
    if (!ref.current.totpTempToken || code.length !== 6) return
    patch({ submitting: true })
    try {
      const completion = await login2FA({ temp_token: ref.current.totpTempToken, totp_code: code })
      persistOAuthTokenContext(completion)
      await setToken(completion.access_token)
      clearAllAffiliateReferralCodes()
      showSuccess(t('auth.loginSuccess'))
      await router.replace(ref.current.redirectTo)
    } catch (e) {
      patch({ errorMessage: getRequestErrorMessage(e, t('auth.loginFailed')) })
    } finally {
      patch({ submitting: false })
    }
  }

  function switchToBind(nextEmail?: string) {
    patch({
      step: 'bind',
      bindEmail: ref.current.bindEmail.trim() || nextEmail?.trim() || ref.current.pendingEmail.trim(),
      bindPassword: '',
      accountActionError: '',
      canReturnToCreate: true
    })
  }
  const switchToCreate = () =>
    patch({
      step: 'create',
      pendingEmail: ref.current.pendingEmail.trim() || ref.current.bindEmail.trim(),
      accountActionError: ''
    })

  // ---------- 微信：绑定当前账号 / 已有账号 ----------
  const wechatMode = (): 'open' | 'mp' | null => {
    const settings = useAppStore.getState().cachedPublicSettings
    if (hasExplicitWeChatOAuthCapabilities(settings)) {
      const mode = resolveWeChatOAuthStartStrict(settings).mode
      if (mode) return mode
    }
    const q = query().get('mode')
    if (q === 'open' || q === 'mp') return q
    return typeof navigator !== 'undefined' && /MicroMessenger/i.test(navigator.userAgent) ? 'mp' : 'open'
  }
  const wechatUnavailableMessage = (): string => {
    switch (resolveWeChatOAuthStartStrict(useAppStore.getState().cachedPublicSettings).unavailableReason) {
      case 'capability_unknown':
        return t('auth.oauthFlow.wechatAvailabilityUnknown')
      case 'external_browser_required':
        return t('auth.oauthFlow.wechatSystemBrowserOnly')
      case 'wechat_browser_required':
        return t('auth.oauthFlow.wechatBrowserOnly')
      case 'native_app_required':
        return 'This WeChat sign-in flow is only available from the native mobile app.'
      case 'not_configured':
        return t('auth.oauthFlow.wechatNotConfigured')
      default:
        return t('auth.loginFailed')
    }
  }
  const redirectTarget = () =>
    sanitizeOAuthRedirect(query().get('redirect') || ref.current.redirectTo || '/dashboard')

  const bindCurrentAccount = async () => {
    const configured = hasExplicitWeChatOAuthCapabilities(useAppStore.getState().cachedPublicSettings)
    const mode = wechatMode()
    if (!mode) {
      patch({ errorMessage: (!configured && wechatUnavailableMessage()) || wechatUnavailableMessage() })
      return
    }
    const params = new URLSearchParams({ mode, redirect: redirectTarget(), intent: 'bind_current_user' })
    try {
      await prepareOAuthBindAccessTokenCookie()
      window.location.href = buildApiUrl(`/auth/oauth/wechat/bind/start?${params.toString()}`)
    } catch (e) {
      patch({ errorMessage: getRequestErrorMessage(e, t('auth.loginFailed')) })
    }
  }

  const existingAccountResume = async () => {
    const mode = wechatMode()
    if (!mode) {
      patch({ errorMessage: wechatUnavailableMessage(), processing: false })
      return
    }
    const resume = new URLSearchParams({ wechat_bind_existing: '1', redirect: redirectTarget(), mode })
    const email = ref.current.existingAccountEmail.trim()
    if (email) resume.set('email', email)
    const params = new URLSearchParams({ redirect: `/auth/wechat/callback?${resume.toString()}` })
    if (email) params.set('email', email)
    await router.replace(`/login?${params.toString()}`)
  }

  const handleExistingAccountBinding = async () => {
    if (getAuthToken()) {
      await bindCurrentAccount()
      return
    }
    await existingAccountResume()
  }

  // ---------- 启动 ----------
  const started = React.useRef(false)
  React.useEffect(() => {
    if (started.current) return
    started.current = true
    void (async () => {
      if (provider === 'oidc') {
        getPublicSettings()
          .then((s) => {
            const name = s.oidc_oauth_provider_name?.trim()
            if (name) patch({ providerName: name })
          })
          .catch(() => undefined)
      }
      const q = query()
      if (provider === 'wechat') {
        try {
          const store = useAppStore.getState()
          if (
            !hasExplicitWeChatOAuthCapabilities(store.cachedPublicSettings) &&
            !store.publicSettingsLoaded
          ) {
            await store.fetchPublicSettings()
          }
        } catch {
          /* 绑定恢复需要明确的能力标志，下面的 strict 守卫会处理 */
        }
        const presetEmail = q.get('email')
        if (typeof presetEmail === 'string') {
          const email = presetEmail.trim()
          patch({ existingAccountEmail: email, bindEmail: email, pendingEmail: email })
        }
        if (q.get('wechat_bind_existing') === '1') {
          if (getAuthToken()) {
            await bindCurrentAccount()
            return
          }
          await existingAccountResume()
          return
        }
      }

      const params = parseFragmentParams(window.location.hash)
      // 令牌在 fragment 里：读取后立即清除，避免留在地址栏 / 历史记录中
      if (window.location.hash) {
        window.history.replaceState(
          window.history.state,
          '',
          window.location.pathname + window.location.search
        )
      }
      const legacyLogin = readLegacyFragmentLogin(params)
      const legacyPendingToken = params.get('pending_oauth_token')?.trim() || ''
      const error = params.get('error')
      const errorDesc = params.get('error_description') || params.get('error_message') || ''
      const redirect = sanitizeOAuthRedirect(params.get('redirect') || q.get('redirect'))
      try {
        if (legacyLogin) {
          persistOAuthTokenContext(legacyLogin)
          await setToken(legacyLogin.access_token)
          clearAllAffiliateReferralCodes()
          showSuccess(t('auth.loginSuccess'))
          await router.replace(redirect)
          return
        }
        if (error === 'invitation_required' && legacyPendingToken) {
          patch({
            legacyToken: legacyPendingToken,
            redirectTo: redirect,
            step: 'invitation',
            processing: false
          })
          return
        }
        if (error) {
          let message = errorDesc || error
          if (provider === 'dingtalk') {
            const key = `auth.dingtalk.error.${error}`
            const translated = t(key)
            if (translated !== key) message = translated
          }
          patch({ errorMessage: message, processing: false })
          return
        }
        const completion = (await exchangePendingOAuthCompletion()) as PendingCompletion
        const completionRedirect = sanitizeOAuthRedirect(completion.redirect || q.get('redirect'))
        applyAdoption(completion)
        patch({ redirectTo: completionRedirect })
        if (provider === 'dingtalk' && requiresEmailCompletion(completion)) {
          // 用户从补邮箱页“我已有账户”跳回时携带 bind=1，直接进入绑定登录
          if (q.get('bind') === '1') {
            patch({
              step: 'bind',
              bindEmail: (q.get('email') || '').trim(),
              bindPassword: '',
              canReturnToCreate: true,
              processing: false
            })
            persistPending(completionRedirect)
            return
          }
          await goEmailCompletion(completionRedirect)
          return
        }
        if (completion.error === 'invitation_required') {
          patch({ step: 'invitation', processing: false })
          persistPending(completionRedirect)
          return
        }
        if (applyTotp(completion)) {
          persistPending(completionRedirect)
          return
        }
        if (applyAction(completion)) {
          patch({ processing: false })
          persistPending(completionRedirect)
          return
        }
        if (ref.current.adoptionRequired && hasSuggestedProfile(completion)) {
          patch({ step: 'adoption', processing: false })
          persistPending(completionRedirect)
          return
        }
        await finalizeCompletion(completion, completionRedirect)
      } catch (e) {
        clearPendingAuthSessionStore()
        patch({ errorMessage: getRequestErrorMessage(e, t('auth.loginFailed')), processing: false })
      }
    })()
    // 只在首次挂载执行：流程会消费一次性的 pending 会话
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return {
    state,
    patch,
    ns,
    actions: {
      submitInvitation,
      continueLogin,
      createAccount,
      bindLogin,
      submitTotp,
      switchToBind,
      switchToCreate,
      bindCurrentAccount,
      handleExistingAccountBinding
    }
  }
}
