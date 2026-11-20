import * as React from 'react'
import { Button } from '@/components/ui/button'
import { resolveWeChatOAuthStart, type OAuthLoginStart } from '@/api/auth'
import { useAppStore } from '@/stores/app'
import { resolveAffiliateReferralCode, storeOAuthAffiliateCode } from '@/utils/oauthAffiliate'
import { STORAGE_KEYS } from '@/constants/storage'
import { getLocale, t } from '@/i18n'
import { useLocale } from '@/i18n/react'
import { sanitizeRedirect } from '@/core/safeNavigation'
import { getQueryParam } from './useAuthSettings'

export interface OAuthButtonsProps {
  disabled?: boolean
  /** 注册页传入表单里已有的推广码 / 优惠码。 */
  affCode?: string
  promoCode?: string
  githubEnabled?: boolean
  googleEnabled?: boolean
  linuxdoEnabled?: boolean
  dingtalkEnabled?: boolean
  wechatEnabled?: boolean
  oidcEnabled?: boolean
  oidcProviderName?: string
  onStart: (request: OAuthLoginStart) => void
}

function GitHubMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82A7.61 7.61 0 0 1 8 3.86c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  )
}

function GoogleMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.1A6.61 6.61 0 0 1 5.5 12c0-.73.12-1.43.34-2.1V7.06H2.18A10.96 10.96 0 0 0 1 12c0 1.77.42 3.45 1.18 4.94l3.66-2.84z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06L5.84 9.9C6.71 7.31 9.14 5.38 12 5.38z"
      />
    </svg>
  )
}

function LinuxDoMark() {
  return (
    <svg viewBox="0 0 16 16" width="20" height="20" aria-hidden="true">
      <path
        d="m7.44,0s.09,0,.13,0c.09,0,.19,0,.28,0,.14,0,.29,0,.43,0,.09,0,.18,0,.27,0q.12,0,.25,0t.26.08c.15.03.29.06.44.08,1.97.38,3.78,1.47,4.95,3.11.04.06.09.12.13.18.67.96,1.15,2.11,1.3,3.28q0,.19.09.26c0,.15,0,.29,0,.44,0,.04,0,.09,0,.13,0,.09,0,.19,0,.28,0,.14,0,.29,0,.43,0,.09,0,.18,0,.27,0,.08,0,.17,0,.25q0,.19-.08.26c-.03.15-.06.29-.08.44-.38,1.97-1.47,3.78-3.11,4.95-.06.04-.12.09-.18.13-.96.67-2.11,1.15-3.28,1.3q-.19,0-.26.09c-.15,0-.29,0-.44,0-.04,0-.09,0-.13,0-.09,0-.19,0-.28,0-.14,0-.29,0-.43,0-.09,0-.18,0-.27,0-.08,0-.17,0-.25,0q-.19,0-.26-.08c-.15-.03-.29-.06-.44-.08-1.97-.38-3.78-1.47-4.95-3.11q-.07-.09-.13-.18c-.67-.96-1.15-2.11-1.3-3.28q0-.19-.09-.26c0-.15,0-.29,0-.44,0-.04,0-.09,0-.13,0-.09,0-.19,0-.28,0-.14,0-.29,0-.43,0-.09,0-.18,0-.27,0-.08,0-.17,0-.25q0-.19.08-.26c.03-.15.06-.29.08-.44.38-1.97,1.47-3.78,3.11-4.95.06-.04.12-.09.18-.13C4.42.73,5.57.26,6.74.1,7,.07,7.15,0,7.44,0Z"
        fill="#EFEFEF"
      />
      <path
        d="m1.27,11.33h13.45c-.94,1.89-2.51,3.21-4.51,3.88-1.99.59-3.96.37-5.8-.57-1.25-.7-2.67-1.9-3.14-3.3Z"
        fill="#FEB005"
      />
      <path
        d="m12.54,1.99c.87.7,1.82,1.59,2.18,2.68H1.27c.87-1.74,2.33-3.13,4.2-3.78,2.44-.79,5-.47,7.07,1.1Z"
        fill="#1D1D1F"
      />
    </svg>
  )
}

function Badge({ color, letter }: { color: string; letter: string }) {
  return (
    <span
      aria-hidden="true"
      className="inline-flex size-5 items-center justify-center rounded-full text-[11px] font-bold text-white"
      style={{ backgroundColor: color }}
    >
      {letter}
    </span>
  )
}

/** 当前页面 `redirect` 参数（登录后回跳目标）；经 sanitizeRedirect 约束为站内路径。 */
function currentRedirect(): string {
  return sanitizeRedirect(getQueryParam('redirect'), '/dashboard')
}

function currentAffiliate(extra?: string): string {
  return resolveAffiliateReferralCode(extra, getQueryParam('aff'), getQueryParam('aff_code'))
}

/**
 * 第三方登录按钮组（GitHub / Google / LinuxDo / 钉钉 / 微信 / OIDC）。
 * 点击时写入推广码与 pending provider，再把 OAuthLoginStart 交给页面（页面负责验证码与跳转）。
 */
export function OAuthButtons(props: OAuthButtonsProps) {
  useLocale()
  const { disabled, affCode, promoCode, onStart } = props
  const settings = useAppStore((s) => s.cachedPublicSettings)
  const publicSettingsLoaded = useAppStore((s) => s.publicSettingsLoaded)
  const fetchPublicSettings = useAppStore((s) => s.fetchPublicSettings)

  React.useEffect(() => {
    if (props.wechatEnabled && !settings && !publicSettingsLoaded) void fetchPublicSettings()
  }, [props.wechatEnabled, settings, publicSettingsLoaded, fetchPublicSettings])

  const emailProviders = (['github', 'google'] as const).filter((p) =>
    p === 'github' ? props.githubEnabled : props.googleEnabled
  )
  const multi = emailProviders.length > 1

  const startEmail = (provider: 'github' | 'google') => {
    const code = currentAffiliate(affCode)
    storeOAuthAffiliateCode(code)
    try {
      window.sessionStorage.setItem(STORAGE_KEYS.emailOauthPendingProvider, provider)
    } catch {
      /* ignore */
    }
    const params: Record<string, string> = { redirect: currentRedirect() }
    if (code) params.aff_code = code
    const promo = promoCode?.trim()
    if (promo) params.promo_code = promo
    onStart({ provider, params })
  }

  const startSimple = (provider: 'linuxdo' | 'dingtalk' | 'oidc') => {
    storeOAuthAffiliateCode(currentAffiliate(affCode))
    const params: Record<string, string> = { redirect: currentRedirect() }
    const promo = promoCode?.trim()
    if (provider === 'linuxdo' && promo) params.promo_code = promo
    onStart({ provider, params })
  }

  const wechat = resolveWeChatOAuthStart(settings)
  const wechatDisabled = disabled || wechat.mode === null
  const zh = getLocale().startsWith('zh')
  const wechatHint = (() => {
    if (disabled) return ''
    switch (wechat.unavailableReason) {
      case 'external_browser_required':
        return t('auth.oauthFlow.wechatSystemBrowserOnly')
      case 'wechat_browser_required':
        return t('auth.oauthFlow.wechatBrowserOnly')
      case 'native_app_required':
        return zh
          ? '当前仅配置微信移动应用登录，需要在原生 App 中通过微信 SDK 发起授权。'
          : 'This site only has WeChat mobile app login configured. Continue from the native app through the WeChat SDK.'
      case 'not_configured':
        return t('auth.oauthFlow.wechatNotConfigured')
      default:
        return ''
    }
  })()
  const startWechat = () => {
    if (wechatDisabled || !wechat.mode) return
    storeOAuthAffiliateCode(currentAffiliate(affCode))
    onStart({ provider: 'wechat', params: { mode: wechat.mode, redirect: currentRedirect() } })
  }

  const oidcName = props.oidcProviderName?.trim() || 'OIDC'

  return (
    <div className="grid gap-2.5">
      {emailProviders.length > 0 ? (
        <div className={multi ? 'grid grid-cols-1 gap-2.5 sm:grid-cols-2' : 'grid gap-2.5'}>
          {emailProviders.map((provider) => {
            const name = provider === 'github' ? 'GitHub' : 'Google'
            return (
              <Button
                key={provider}
                type="button"
                variant="outline"
                disabled={disabled}
                onClick={() => startEmail(provider)}
              >
                {provider === 'github' ? (
                  <GitHubMark className="size-5" />
                ) : (
                  <GoogleMark className="size-5" />
                )}
                {multi ? name : t('auth.emailOAuth.signIn', { providerName: name })}
              </Button>
            )
          })}
        </div>
      ) : null}
      {props.linuxdoEnabled ? (
        <Button type="button" variant="outline" disabled={disabled} onClick={() => startSimple('linuxdo')}>
          <LinuxDoMark />
          {t('auth.linuxdo.signIn')}
        </Button>
      ) : null}
      {props.dingtalkEnabled ? (
        <Button type="button" variant="outline" disabled={disabled} onClick={() => startSimple('dingtalk')}>
          <Badge color="#1677FF" letter="D" />
          {t('auth.dingtalk.signIn')}
        </Button>
      ) : null}
      {props.wechatEnabled ? (
        <div className="grid gap-1.5">
          <Button type="button" variant="outline" disabled={wechatDisabled} onClick={startWechat}>
            <Badge color="#07C160" letter="W" />
            {t('auth.oidc.signIn', { providerName: t('auth.wechatProviderName') })}
          </Button>
          {wechatHint ? (
            <p data-testid="wechat-oauth-hint" className="text-xs text-muted-foreground">
              {wechatHint}
            </p>
          ) : null}
        </div>
      ) : null}
      {props.oidcEnabled ? (
        <Button type="button" variant="outline" disabled={disabled} onClick={() => startSimple('oidc')}>
          <Badge color="#6366F1" letter={oidcName.charAt(0).toUpperCase() || 'O'} />
          {t('auth.oidc.signIn', { providerName: oidcName })}
        </Button>
      ) : null}
    </div>
  )
}

export function OrDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3" role="separator">
      <div className="h-px flex-1 bg-border" />
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="h-px flex-1 bg-border" />
    </div>
  )
}
