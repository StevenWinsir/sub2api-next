/** /profile：个人资料（基本信息 / 身份绑定 / 密码 / 余额提醒 / TOTP / Passkey）。 */
import * as React from 'react'
import { MessageCircle } from 'lucide-react'
import { isWeChatWebOAuthEnabled } from '@/api/auth'
import { Card } from '@/components/ui/card'
import { t } from '@/i18n'
import { useLocale } from '@/i18n/react'
import { useAppStore } from '@/stores/app'
import { useAuthStore } from '@/stores/auth'
import type { UserAuthProvider } from '@/types'
import { IdentityBindings } from './IdentityBindings'
import { ProfileBalanceNotifyCard, ProfileInfoCard, ProfilePasswordCard } from './ProfileCards'
import { ProfilePasskeyCard, ProfileTotpCard } from './SecurityCards'

export function ProfilePage() {
  useLocale()
  const user = useAuthStore((s) => s.user)
  const refreshUser = useAuthStore((s) => s.refreshUser)
  const settings = useAppStore((s) => s.cachedPublicSettings)
  const fetchPublicSettings = useAppStore((s) => s.fetchPublicSettings)

  React.useEffect(() => {
    void refreshUser().catch((error) => console.error('Failed to refresh profile:', error))
    void fetchPublicSettings().catch((error) => console.error('Failed to load settings:', error))
  }, [refreshUser, fetchPublicSettings])

  const oidcName = settings?.oidc_oauth_provider_name || 'OIDC'
  const labels = {
    email: t('profile.authBindings.providers.email'),
    linuxdo: t('profile.authBindings.providers.linuxdo'),
    dingtalk: t('profile.authBindings.providers.dingtalk'),
    oidc: t('profile.authBindings.providers.oidc', { providerName: oidcName }),
    wechat: t('profile.authBindings.providers.wechat'),
    github: 'GitHub',
    google: 'Google'
  } as Record<UserAuthProvider, string>

  return (
    <div data-testid="profile-shell" className="mx-auto max-w-[950px] space-y-6">
      <ProfileInfoCard user={user} providerLabels={labels}>
        <IdentityBindings
          user={user}
          linuxdoEnabled={settings?.linuxdo_oauth_enabled ?? false}
          dingtalkEnabled={settings?.dingtalk_oauth_enabled ?? false}
          oidcEnabled={settings?.oidc_oauth_enabled ?? false}
          oidcProviderName={oidcName}
          wechatEnabled={settings ? isWeChatWebOAuthEnabled(settings) : false}
          wechatOpenEnabled={
            typeof settings?.wechat_oauth_open_enabled === 'boolean'
              ? settings.wechat_oauth_open_enabled
              : undefined
          }
          wechatMpEnabled={
            typeof settings?.wechat_oauth_mp_enabled === 'boolean'
              ? settings.wechat_oauth_mp_enabled
              : undefined
          }
        />
      </ProfileInfoCard>

      {settings?.contact_info ? (
        <Card className="flex items-center gap-4 border-primary/30 bg-accent/50 p-6">
          <span className="flex size-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <MessageCircle className="size-5" aria-hidden />
          </span>
          <div>
            <h3 className="font-semibold">{t('common.contactSupport')}</h3>
            <p className="text-sm font-medium">{settings.contact_info}</p>
          </div>
        </Card>
      ) : null}

      <ProfilePasswordCard />
      {user && (settings?.balance_low_notify_enabled ?? false) ? (
        <ProfileBalanceNotifyCard
          key={user.id}
          user={user}
          systemDefaultThreshold={settings?.balance_low_notify_threshold ?? 0}
        />
      ) : null}
      <ProfileTotpCard />
      <ProfilePasskeyCard enabled={settings?.passkey_enabled === true} />
    </div>
  )
}
