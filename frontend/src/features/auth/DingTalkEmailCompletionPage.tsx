/** 钉钉用户无邮箱时的补邮箱页：创建账号，或跳回回调页走“绑定已有账户”。 */
import * as React from 'react'
import { useRouter } from 'next/router'
import { persistOAuthTokenContext, type PendingOAuthExchangeResponse } from '@/api/auth'
import { apiClient } from '@/api/client'
import { useAppStore } from '@/stores/app'
import { useAuthStore } from '@/stores/auth'
import { clearAllAffiliateReferralCodes } from '@/utils/oauthAffiliate'
import { t } from '@/i18n'
import { useLocale } from '@/i18n/react'
import {
  PendingOAuthCreateAccountForm,
  type PendingOAuthCreateAccountPayload
} from './oauth/PendingOAuthCreateAccountForm'
import { getRequestErrorMessage, sanitizeOAuthRedirect } from './oauth/pending'
import { getQueryParam } from './shared/useAuthSettings'

type CreateResponse = PendingOAuthExchangeResponse & {
  step?: string
  redirect?: string
  existing_account_bindable?: boolean
}

export function DingTalkEmailCompletionPage() {
  useLocale()
  const router = useRouter()
  const setToken = useAuthStore((s) => s.setToken)
  const showSuccess = useAppStore((s) => s.showSuccess)
  const showInfo = useAppStore((s) => s.showInfo)
  const [submitting, setSubmitting] = React.useState(false)
  const [error, setError] = React.useState('')
  // 页面只在门禁通过后的客户端渲染，可直接读取地址栏
  const [initialEmail] = React.useState(() => getQueryParam('email'))

  const navigateToBindLogin = (email: string) => {
    const query: Record<string, string> = { bind: '1' }
    if (email) query.email = email
    const redirect = getQueryParam('redirect')
    if (redirect) query.redirect = redirect
    void router.replace({ pathname: '/auth/dingtalk/callback', query })
  }

  const onSubmit = async (payload: PendingOAuthCreateAccountPayload) => {
    setError('')
    if (!payload.email || !payload.password) return
    setSubmitting(true)
    try {
      const { data } = await apiClient.post<CreateResponse>('/auth/oauth/pending/create-account', {
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
        invitation_code: payload.invitationCode || undefined
      })
      const redirect = sanitizeOAuthRedirect(data.redirect || getQueryParam('redirect'))
      if (data.access_token) {
        persistOAuthTokenContext(data)
        await setToken(data.access_token)
        clearAllAffiliateReferralCodes()
        showSuccess(t('auth.loginSuccess'))
        await router.replace(redirect)
        return
      }
      // 后端把 pending session 转到 choice 状态（邮箱已在系统内）→ 跳回回调页走绑定流程
      if (data.step === 'choose_account_action_required' || data.existing_account_bindable === true) {
        navigateToBindLogin(payload.email)
        return
      }
      setError(t('auth.loginFailed'))
    } catch (e) {
      // 全局“开放注册”关闭且未开启钉钉企业模式豁免时，引导用户去绑定已有账户而非死路
      if (
        (e as { response?: { data?: { reason?: string } } }).response?.data?.reason ===
        'REGISTRATION_DISABLED'
      ) {
        showInfo(t('auth.dingtalk.registrationDisabledRedirectToBind'))
        navigateToBindLogin(payload.email)
        return
      }
      setError(getRequestErrorMessage(e, t('auth.loginFailed')))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1.5 text-center">
        <h1 className="text-xl font-semibold tracking-tight">{t('auth.dingtalk.createAccountTitle')}</h1>
        <p className="text-sm text-muted-foreground">{t('auth.oauthFlow.createAccountHint')}</p>
      </div>
      <div className="rounded-lg border bg-card p-4">
        <PendingOAuthCreateAccountForm
          testIdPrefix="dingtalk"
          initialEmail={initialEmail}
          isSubmitting={submitting}
          errorMessage={error}
          onSubmit={onSubmit}
          onSwitchToBind={navigateToBindLogin}
        />
      </div>
    </div>
  )
}
