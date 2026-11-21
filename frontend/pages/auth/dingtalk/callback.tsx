import { PendingOAuthCallbackPage } from '@/features/auth/oauth/PendingOAuthCallbackPage'
import { t } from '@/i18n'

export default function Page() {
  return <PendingOAuthCallbackPage provider="dingtalk" providerName={t('auth.dingtalkProviderName')} />
}
