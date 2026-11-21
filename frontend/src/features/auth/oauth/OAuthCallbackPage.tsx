/**
 * 通用 OAuth 回调页（/auth/callback 及别名 /auth/oauth/callback）：
 *  - GitHub / Google（邮箱类 OAuth）：先回跳后端换取结果，再兑换 pending 会话，必要时补充密码 / 邀请码完成注册；
 *  - fragment 带令牌（legacy）直接登录；
 *  - 无任何有效结果时展示 code / state / 完整 URL（管理员授权流程需要复制回去）。
 */
import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { Loader2, TriangleAlert } from 'lucide-react'
import { exchangePendingOAuthCompletion, persistOAuthTokenContext, type OAuthTokenResponse } from '@/api/auth'
import { apiClient } from '@/api/client'
import { buildApiUrl } from '@/api/url'
import { CopyButton } from '@/components/CopyButton'
import { FormField } from '@/components/FormField'
import { PasswordInput } from '@/components/PasswordInput'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { STORAGE_KEYS } from '@/constants/storage'
import { useAppStore } from '@/stores/app'
import { useAuthStore } from '@/stores/auth'
import {
  clearAllAffiliateReferralCodes,
  loadOAuthAffiliateCode,
  oauthAffiliatePayload
} from '@/utils/oauthAffiliate'
import { t } from '@/i18n'
import { useLocale } from '@/i18n/react'
import { parseFragmentParams, readLegacyFragmentLogin, sanitizeOAuthRedirect } from './pending'

type EmailOAuthProvider = 'github' | 'google'

type PendingCompletion = Partial<OAuthTokenResponse> & {
  error?: string
  provider?: string
  redirect?: string
  email?: string
  resolved_email?: string
  invitation_required?: boolean
}

function readPendingProvider(): EmailOAuthProvider | null {
  try {
    const provider = window.sessionStorage.getItem(STORAGE_KEYS.emailOauthPendingProvider)
    return provider === 'github' || provider === 'google' ? provider : null
  } catch {
    return null
  }
}

export function OAuthCallbackPage() {
  useLocale()
  const router = useRouter()
  const setToken = useAuthStore((s) => s.setToken)
  const showError = useAppStore((s) => s.showError)
  const showSuccess = useAppStore((s) => s.showSuccess)

  const [processing, setProcessing] = React.useState(false)
  const [submitting, setSubmitting] = React.useState(false)
  const [needsRegistration, setNeedsRegistration] = React.useState(false)
  const [invitationRequired, setInvitationRequired] = React.useState(false)
  const [email, setEmail] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [confirm, setConfirm] = React.useState('')
  const [invitation, setInvitation] = React.useState('')
  const [registrationError, setRegistrationError] = React.useState('')
  const [provider, setProvider] = React.useState<EmailOAuthProvider>('github')
  const [redirectTo, setRedirectTo] = React.useState('/dashboard')
  const [invalid, setInvalid] = React.useState(false)
  const [info, setInfo] = React.useState({ code: '', state: '', fullUrl: '' })

  const providerName = provider === 'google' ? 'Google' : 'GitHub'
  const canSubmit =
    !!email.trim() &&
    password.length >= 6 &&
    password === confirm &&
    (!invitationRequired || !!invitation.trim())

  const finalize = React.useCallback(
    async (tokens: OAuthTokenResponse, redirect: string) => {
      persistOAuthTokenContext(tokens)
      await setToken(tokens.access_token)
      try {
        window.sessionStorage.removeItem(STORAGE_KEYS.emailOauthPendingProvider)
      } catch {
        /* ignore */
      }
      clearAllAffiliateReferralCodes()
      showSuccess(t('auth.loginSuccess'))
      await router.replace(sanitizeOAuthRedirect(redirect))
    },
    [router, setToken, showSuccess]
  )

  const started = React.useRef(false)
  React.useEffect(() => {
    if (started.current) return
    started.current = true
    const query = new URLSearchParams(window.location.search)
    const fragment = parseFragmentParams(window.location.hash)
    // 令牌在 fragment：读取后立即清除
    if (window.location.hash) {
      window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search)
    }
    const queryError = query.get('error') || query.get('error_description') || ''
    setInfo({ code: query.get('code') || '', state: query.get('state') || '', fullUrl: window.location.href })
    if (queryError) showError(queryError)

    const tokens = readLegacyFragmentLogin(fragment)
    const fragmentError = fragment.get('error') || ''
    const fragmentErrorDescription = fragment.get('error_description') || fragment.get('error_message') || ''
    if (fragmentError) {
      showError(fragmentErrorDescription || fragmentError)
      return
    }

    void (async () => {
      if (!tokens) {
        // 仅别名路径 /auth/oauth/callback 承接邮箱类 OAuth（后端按该路径回跳）
        if (window.location.pathname === '/auth/oauth/callback') {
          const pending = readPendingProvider()
          if (pending && query.get('code') && query.get('state')) {
            // 回跳后端完成 provider 回调（保留全部 query）
            window.location.href = buildApiUrl(`/auth/oauth/${pending}/callback${window.location.search}`)
            return
          }
          setProcessing(true)
          try {
            const completion = (await exchangePendingOAuthCompletion()) as PendingCompletion
            const redirect = completion.redirect || '/dashboard'
            if (typeof completion.access_token === 'string' && completion.access_token.trim() !== '') {
              await finalize(completion as OAuthTokenResponse, redirect)
              return
            }
            const p = String(completion.provider || '').toLowerCase()
            if (p === 'github' || p === 'google') setProvider(p)
            setRedirectTo(sanitizeOAuthRedirect(redirect))
            if (
              completion.error === 'invitation_required' ||
              completion.error === 'registration_completion_required'
            ) {
              setInvitationRequired(
                completion.error === 'invitation_required' || completion.invitation_required === true
              )
              setEmail(String(completion.resolved_email || completion.email || '').trim())
              setNeedsRegistration(true)
              return
            }
            showError(completion.error || t('auth.loginFailed'))
          } catch (e) {
            const err = e as { message?: string; response?: { data?: { message?: string } } }
            showError(err.response?.data?.message || err.message || t('auth.loginFailed'))
            setInvalid(true)
          } finally {
            setProcessing(false)
          }
        }
        return
      }
      setProcessing(true)
      try {
        await finalize(tokens, fragment.get('redirect') || '/dashboard')
      } catch (e) {
        showError((e as { message?: string })?.message || t('auth.loginFailed'))
        setProcessing(false)
      }
    })()
    // 只在首次挂载执行：流程会消费一次性的 pending 会话
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const submitRegistration = async () => {
    setRegistrationError('')
    if (!email.trim()) return setRegistrationError(t('auth.emailRequired'))
    if (password.length < 6) return setRegistrationError(t('auth.passwordMinLength'))
    if (password !== confirm) return setRegistrationError(t('auth.passwordsDoNotMatch'))
    const code = invitation.trim()
    if (invitationRequired && !code) return
    setSubmitting(true)
    try {
      const payload: { password: string; invitation_code?: string; aff_code?: string } = {
        password,
        ...oauthAffiliatePayload(loadOAuthAffiliateCode())
      }
      if (invitationRequired) payload.invitation_code = code
      const { data } = await apiClient.post<OAuthTokenResponse>(
        `/auth/oauth/${provider}/complete-registration`,
        payload
      )
      await finalize(data, redirectTo)
    } catch (e) {
      const err = e as { message?: string; response?: { data?: { message?: string } } }
      setRegistrationError(
        err.response?.data?.message || err.message || t('auth.oidc.completeRegistrationFailed')
      )
    } finally {
      setSubmitting(false)
    }
  }

  if (needsRegistration) {
    return (
      <div className="space-y-5">
        <div className="space-y-1.5 text-center">
          <h1 className="text-xl font-semibold tracking-tight">
            {t('auth.oidc.callbackTitle', { providerName })}
          </h1>
          <p className="text-sm text-muted-foreground">
            {invitationRequired
              ? t('auth.oidc.invitationRequired', { providerName })
              : t('auth.oidc.completeRegistration')}
          </p>
        </div>
        <form
          className="grid gap-3.5 rounded-lg border bg-card p-4"
          onSubmit={(e) => {
            e.preventDefault()
            void submitRegistration()
          }}
        >
          <FormField label={t('auth.emailLabel')}>
            <Input type="email" value={email} readOnly disabled />
          </FormField>
          <FormField label={t('auth.passwordLabel')}>
            <PasswordInput
              placeholder={t('auth.createPasswordPlaceholder')}
              autoComplete="new-password"
              value={password}
              disabled={submitting}
              onChange={(e) => setPassword(e.target.value)}
            />
          </FormField>
          <FormField label={t('auth.confirmPassword')}>
            <PasswordInput
              placeholder={t('auth.confirmPasswordPlaceholder')}
              autoComplete="new-password"
              value={confirm}
              disabled={submitting}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </FormField>
          {invitationRequired ? (
            <FormField label={t('auth.invitationCodeLabel')}>
              <Input
                placeholder={t('auth.invitationCodePlaceholder')}
                value={invitation}
                disabled={submitting}
                onChange={(e) => setInvitation(e.target.value)}
              />
            </FormField>
          ) : null}
          {registrationError ? (
            <p role="alert" className="text-sm text-destructive">
              {registrationError}
            </p>
          ) : null}
          <Button type="submit" loading={submitting} disabled={!canSubmit}>
            {submitting ? t('common.processing') : t('auth.oidc.completeRegistration')}
          </Button>
        </form>
      </div>
    )
  }

  if (invalid) {
    return (
      <div className="space-y-5 text-center">
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-warning/10 text-warning">
          <TriangleAlert className="size-6" aria-hidden />
        </div>
        <div className="space-y-1.5">
          <h1 className="text-xl font-semibold tracking-tight">{t('auth.oauth.invalidCallbackTitle')}</h1>
          <p className="text-sm text-muted-foreground">{t('auth.oauth.invalidCallbackHint')}</p>
        </div>
        <Button asChild className="w-full">
          <Link href="/login">{t('auth.backToLogin')}</Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="space-y-1.5 text-center">
        {processing ? <Loader2 className="mx-auto size-6 animate-spin text-primary" aria-hidden /> : null}
        <h1 className="text-xl font-semibold tracking-tight">{t('auth.oauth.callbackTitle')}</h1>
        <p className="text-sm text-muted-foreground">{t('auth.oauth.callbackHint')}</p>
      </div>
      {!processing ? (
        <dl className="grid gap-3 rounded-lg border bg-card p-4 text-sm">
          {(
            [
              ['code', t('auth.oauth.code'), info.code],
              ['state', t('auth.oauth.state'), info.state],
              ['url', t('auth.oauth.fullUrl'), info.fullUrl]
            ] as const
          ).map(([key, label, value]) => (
            <div key={key} className="grid gap-1">
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="flex items-center gap-2">
                <code className="min-w-0 flex-1 break-all rounded bg-muted px-2 py-1 font-mono text-xs">
                  {value || '—'}
                </code>
                <CopyButton value={value} disabled={!value} />
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
    </div>
  )
}
