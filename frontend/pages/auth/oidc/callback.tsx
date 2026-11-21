import { PendingOAuthCallbackPage } from '@/features/auth/oauth/PendingOAuthCallbackPage'

export default function Page() {
  return <PendingOAuthCallbackPage provider="oidc" providerName={'OIDC'} />
}
