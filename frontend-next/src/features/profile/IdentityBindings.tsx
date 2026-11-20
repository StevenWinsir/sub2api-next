/** 第三方身份绑定：邮箱绑定 / 更换 + LinuxDo / 钉钉 / OIDC / 微信的绑定与解绑。 */
import * as React from 'react'
import { useRouter } from 'next/router'
import { Link2, Mail } from 'lucide-react'
import {
  hasExplicitWeChatOAuthCapabilities,
  resolveWeChatOAuthStartStrict,
  type WeChatOAuthPublicSettings
} from '@/api/auth'
import { bindEmailIdentity, sendEmailBindingCode, startOAuthBinding, unbindAuthIdentity } from '@/api/user'
import { FormField } from '@/components/FormField'
import { PasswordInput } from '@/components/PasswordInput'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { t } from '@/i18n'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/stores/app'
import { useAuthStore } from '@/stores/auth'
import type { User, UserAuthBindingStatus, UserAuthProvider } from '@/types'
import { bindingDetails, displayableEmail, isBound, type BindableProvider } from './bindings'

const LEGACY_NOTE_KEYS: Record<string, string> = {
  'Primary account email is managed from the profile form.':
    'profile.authBindings.notes.emailManagedFromProfile',
  'You can unbind this sign-in method.': 'profile.authBindings.notes.canUnbind',
  'Bind another sign-in method before unbinding.': 'profile.authBindings.notes.bindAnotherBeforeUnbind'
}

/** 旧版后端没有明确的微信开放平台 / 公众号能力位时，按总开关推断。 */
function wechatCompatibleSettings(
  s: WeChatOAuthPublicSettings | null | undefined
): WeChatOAuthPublicSettings | null {
  if (!s) return null
  if (hasExplicitWeChatOAuthCapabilities(s)) return s
  if (typeof s.wechat_oauth_enabled !== 'boolean') return null
  return {
    ...s,
    wechat_oauth_open_enabled: s.wechat_oauth_enabled,
    wechat_oauth_mp_enabled: s.wechat_oauth_enabled
  }
}

function bindingNote(details: UserAuthBindingStatus | null): string {
  if (!details) return ''
  const key = details.note_key?.trim() || LEGACY_NOTE_KEYS[details.note?.trim() || ''] || ''
  if (key) {
    const translated = t(key)
    if (translated !== key) return translated
  }
  return details.note?.trim() || ''
}

const ICON_CLASS: Record<string, string> = {
  linuxdo: 'bg-orange-500/15 text-orange-600',
  dingtalk: 'bg-blue-500/15 text-blue-600',
  wechat: 'bg-green-500/15 text-green-600',
  oidc: 'bg-sky-500/15 text-sky-600',
  email: 'bg-primary/10 text-primary'
}
const INITIAL: Record<string, string> = { linuxdo: 'L', dingtalk: 'D', wechat: 'W', oidc: 'O', email: 'E' }

export interface IdentityBindingsProps {
  user: User | null
  linuxdoEnabled: boolean
  dingtalkEnabled: boolean
  oidcEnabled: boolean
  oidcProviderName: string
  wechatEnabled: boolean
  wechatOpenEnabled?: boolean
  wechatMpEnabled?: boolean
}

export function IdentityBindings(props: IdentityBindingsProps) {
  const router = useRouter()
  const cached = useAppStore((s) => s.cachedPublicSettings)
  const [localUser, setLocalUser] = React.useState<User | null>(null)
  const [unbinding, setUnbinding] = React.useState<BindableProvider | null>(null)
  const [emailOpen, setEmailOpen] = React.useState(false)
  const [sending, setSending] = React.useState(false)
  const [binding, setBinding] = React.useState(false)
  const initialEmail = (u: User | null) =>
    typeof u?.email === 'string' && !u.email.endsWith('.invalid') ? u.email : ''
  const [form, setForm] = React.useState({ email: initialEmail(props.user), verifyCode: '', password: '' })
  const [dirty, setDirty] = React.useState(false)
  const [prevUserId, setPrevUserId] = React.useState(props.user?.id)

  // 资料轮询不得覆盖进行中的邮箱验证流程
  if (props.user?.id !== prevUserId) {
    setPrevUserId(props.user?.id)
    setForm({ email: initialEmail(props.user), verifyCode: '', password: '' })
    setDirty(false)
  }

  const user = localUser ?? props.user
  const emailBound = isBound(user, 'email')
  const wechatSettings =
    wechatCompatibleSettings(cached) ??
    wechatCompatibleSettings({
      wechat_oauth_enabled: props.wechatEnabled,
      wechat_oauth_open_enabled: props.wechatOpenEnabled,
      wechat_oauth_mp_enabled: props.wechatMpEnabled
    })
  const wechatMode = resolveWeChatOAuthStartStrict(wechatSettings).mode
  const enabledFor = (p: BindableProvider) =>
    p === 'linuxdo'
      ? props.linuxdoEnabled
      : p === 'dingtalk'
        ? props.dingtalkEnabled
        : p === 'oidc'
          ? props.oidcEnabled
          : wechatMode !== null

  const providers: { provider: UserAuthProvider; label: string }[] = [
    { provider: 'email', label: t('profile.authBindings.providers.email') },
    { provider: 'linuxdo', label: t('profile.authBindings.providers.linuxdo') },
    { provider: 'dingtalk', label: t('profile.authBindings.providers.dingtalk') },
    {
      provider: 'oidc',
      label: t('profile.authBindings.providers.oidc', { providerName: props.oidcProviderName })
    },
    { provider: 'wechat', label: t('profile.authBindings.providers.wechat') }
  ]

  const apply = (u: User) => {
    setLocalUser(u)
    useAuthStore.getState().setUser(u)
  }
  const error = (e: unknown, fallback: string) =>
    useAppStore.getState().showError((e as { message?: string }).message || fallback)

  const unbind = async (provider: BindableProvider, label: string) => {
    setUnbinding(provider)
    try {
      apply(await unbindAuthIdentity(provider))
      useAppStore.getState().showSuccess(t('profile.authBindings.unbindSuccess', { providerName: label }))
    } catch (e) {
      error(e, t('common.tryAgain'))
    } finally {
      setUnbinding(null)
    }
  }

  const validate = (requireCode: boolean): boolean => {
    const show = (m: string) => {
      useAppStore.getState().showError(m)
      return false
    }
    if (!form.email) return show(t('auth.emailRequired'))
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) return show(t('auth.invalidEmail'))
    if (requireCode && !form.verifyCode) return show(t('auth.codeRequired'))
    if (requireCode && !form.password) return show(t('auth.passwordRequired'))
    if (requireCode && !emailBound && form.password.length < 6) return show(t('auth.passwordMinLength'))
    return true
  }
  const sendCode = async () => {
    if (!validate(false)) return
    setDirty(true)
    setSending(true)
    try {
      await sendEmailBindingCode(form.email)
      useAppStore.getState().showSuccess(t('profile.authBindings.codeSentTo', { email: form.email }))
    } catch (e) {
      error(e, t('auth.sendCodeFailed'))
    } finally {
      setSending(false)
    }
  }
  const bindEmail = async () => {
    if (!validate(true)) return
    setDirty(true)
    setBinding(true)
    try {
      const replacing = emailBound
      const updated = await bindEmailIdentity({
        email: form.email,
        verify_code: form.verifyCode,
        password: form.password
      })
      apply(updated)
      setForm({ email: initialEmail(updated), verifyCode: '', password: '' })
      setDirty(false)
      setEmailOpen(false)
      useAppStore
        .getState()
        .showSuccess(
          replacing ? t('profile.authBindings.replaceSuccess') : t('profile.authBindings.bindSuccess')
        )
    } catch (e) {
      error(e, t('common.tryAgain'))
    } finally {
      setBinding(false)
    }
  }
  void dirty

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Link2 className="size-4" aria-hidden />
          {t('profile.authBindings.title')}
        </CardTitle>
        <CardDescription>{t('profile.authBindings.description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {providers.map(({ provider, label }) => {
          const bound = isBound(user, provider)
          const details = bindingDetails(user, provider)
          const bindable = provider !== 'email'
          const canBind =
            bindable && !bound && enabledFor(provider as BindableProvider) && (details?.can_bind ?? true)
          const canUnbind = bindable && bound && Boolean(details?.can_unbind)
          const note = bindingNote(details)
          const summary = provider === 'email' ? displayableEmail(user) : ''
          const count =
            details && typeof details.bound_count === 'number' && details.bound_count > 1
              ? t('profile.authBindings.boundCount', { count: details.bound_count })
              : ''
          return (
            <div key={provider} className="space-y-3 rounded-lg border p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    className={cn(
                      'flex size-9 shrink-0 items-center justify-center rounded-md text-sm font-semibold',
                      ICON_CLASS[provider]
                    )}
                  >
                    {provider === 'email' ? <Mail className="size-4" aria-hidden /> : INITIAL[provider]}
                  </span>
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                      {label}
                      <Badge variant={bound ? 'success' : 'secondary'}>
                        {bound
                          ? t('profile.authBindings.status.bound')
                          : t('profile.authBindings.status.notBound')}
                      </Badge>
                    </p>
                    {summary ? <p className="truncate text-xs text-muted-foreground">{summary}</p> : null}
                    {bound && provider !== 'email' && (details?.display_name || details?.subject_hint) ? (
                      <p className="truncate text-xs text-muted-foreground">
                        {[details?.display_name, details?.subject_hint].filter(Boolean).join(' · ')}
                      </p>
                    ) : null}
                    {count ? <p className="text-xs text-muted-foreground">{count}</p> : null}
                    {note ? <p className="text-xs text-muted-foreground">{note}</p> : null}
                  </div>
                </div>
                {provider === 'email' ? (
                  <Button size="sm" variant="outline" onClick={() => setEmailOpen((o) => !o)}>
                    {emailOpen
                      ? t('profile.authBindings.hideEmailFormAction')
                      : t('profile.authBindings.manageEmailAction')}
                  </Button>
                ) : canBind ? (
                  <Button
                    size="sm"
                    onClick={() =>
                      void startOAuthBinding(provider as BindableProvider, {
                        redirectTo: router.asPath || '/profile',
                        wechatOAuthSettings: provider === 'wechat' ? wechatSettings : null
                      })
                    }
                  >
                    {t('profile.authBindings.bindAction')}
                  </Button>
                ) : canUnbind ? (
                  <Button
                    size="sm"
                    variant="outline"
                    loading={unbinding === provider}
                    onClick={() => void unbind(provider as BindableProvider, label)}
                  >
                    {t('profile.authBindings.unbindAction')}
                  </Button>
                ) : null}
              </div>
              {provider === 'email' && emailOpen ? (
                <div className="grid gap-3 border-t pt-3">
                  <FormField label={t('profile.authBindings.emailPlaceholder')}>
                    <div className="flex gap-2">
                      <Input
                        type="email"
                        value={form.email}
                        placeholder={t('profile.authBindings.emailPlaceholder')}
                        onChange={(e) => {
                          setDirty(true)
                          setForm((f) => ({ ...f, email: e.target.value }))
                        }}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        loading={sending}
                        onClick={() => void sendCode()}
                      >
                        {t('profile.authBindings.sendCodeAction')}
                      </Button>
                    </div>
                  </FormField>
                  <Input
                    value={form.verifyCode}
                    inputMode="numeric"
                    placeholder={t('profile.authBindings.codePlaceholder')}
                    aria-label={t('profile.authBindings.codePlaceholder')}
                    onChange={(e) => {
                      setDirty(true)
                      setForm((f) => ({ ...f, verifyCode: e.target.value }))
                    }}
                  />
                  <PasswordInput
                    autoComplete="new-password"
                    value={form.password}
                    placeholder={
                      emailBound
                        ? t('profile.authBindings.replaceEmailPasswordPlaceholder')
                        : t('profile.authBindings.passwordPlaceholder')
                    }
                    onChange={(e) => {
                      setDirty(true)
                      setForm((f) => ({ ...f, password: e.target.value }))
                    }}
                  />
                  <Button className="w-fit" loading={binding} onClick={() => void bindEmail()}>
                    {emailBound
                      ? t('profile.authBindings.confirmEmailReplaceAction')
                      : t('profile.authBindings.confirmEmailBindAction')}
                  </Button>
                </div>
              ) : null}
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
