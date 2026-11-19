/** LinuxDo / OIDC / 微信 / 钉钉 的 OAuth 回调页（共用视图；流程见 usePendingOAuthFlow）。 */
import * as React from 'react'
import Link from 'next/link'
import { AlertCircle, Loader2, UserRound } from 'lucide-react'
import { getAuthToken } from '@/api/auth'
import { PasswordInput } from '@/components/PasswordInput'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { t } from '@/i18n'
import { useLocale } from '@/i18n/react'
import { PendingOAuthCreateAccountForm } from './PendingOAuthCreateAccountForm'
import { usePendingOAuthFlow, type OAuthProvider } from './usePendingOAuthFlow'

interface Props {
  provider: OAuthProvider
  providerName: string
}

export function PendingOAuthCallbackPage({ provider, providerName: initialName }: Props) {
  useLocale()
  const { state: s, patch, ns, actions } = usePendingOAuthFlow(provider, initialName)
  const providerName = s.providerName
  const isWechat = provider === 'wechat'
  // getAuthToken 读取 localStorage：此页面只在门禁通过后的客户端渲染
  const hasCurrentAuthToken = isWechat && typeof window !== 'undefined' && Boolean(getAuthToken())
  const showBackToChooser = isWechat && (s.step === 'create' || s.step === 'bind')
  const hasStep = s.step !== 'none'
  const busy = s.submitting

  return (
    <div className="space-y-6" data-testid={`${provider}-callback`}>
      <div className="space-y-1.5 text-center">
        {s.processing ? <Loader2 className="mx-auto size-6 animate-spin text-primary" aria-hidden /> : null}
        <h1 className="text-xl font-semibold tracking-tight">
          {t(`auth.${ns}.callbackTitle`, { providerName })}
        </h1>
        <p className="text-sm text-muted-foreground">
          {s.processing ? t(`auth.${ns}.callbackProcessing`, { providerName }) : t(`auth.${ns}.callbackHint`)}
        </p>
      </div>

      {s.errorMessage ? (
        <div
          role="alert"
          className="space-y-3 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm"
        >
          <p className="flex items-start gap-2 text-destructive">
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>{s.errorMessage}</span>
          </p>
          <Button asChild variant="outline" size="sm" className="w-full">
            <Link href="/login">{t(`auth.${ns}.backToLogin`)}</Link>
          </Button>
        </div>
      ) : null}

      {hasStep ? (
        <div className="space-y-4 rounded-lg border bg-card p-4">
          {s.adoptionRequired && (s.suggestedDisplayName || s.suggestedAvatarUrl) ? (
            <div className="space-y-3 rounded-md border bg-muted/40 p-3">
              <div>
                <p className="text-sm font-medium">
                  {t('auth.oauthFlow.profileDetailsTitle', { providerName })}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t('auth.oauthFlow.profileDetailsDescription', { providerName })}
                </p>
              </div>
              {s.suggestedDisplayName ? (
                <label className="flex cursor-pointer items-start gap-2.5 text-sm">
                  <Checkbox
                    checked={s.adoptDisplayName}
                    onCheckedChange={(v) => patch({ adoptDisplayName: v === true })}
                    className="mt-0.5"
                  />
                  <span>
                    <span className="block font-medium">{t('auth.oauthFlow.useDisplayName')}</span>
                    <span className="block text-muted-foreground">{s.suggestedDisplayName}</span>
                  </span>
                </label>
              ) : null}
              {s.suggestedAvatarUrl ? (
                <label className="flex cursor-pointer items-center gap-2.5 text-sm">
                  <Checkbox
                    checked={s.adoptAvatar}
                    onCheckedChange={(v) => patch({ adoptAvatar: v === true })}
                  />
                  {/* eslint-disable-next-line @next/next/no-img-element -- 第三方头像地址，静态导出下不走图片优化 */}
                  <img
                    src={s.suggestedAvatarUrl}
                    alt={t('auth.oauthFlow.avatarAlt', { providerName })}
                    className="size-10 rounded-full border object-cover"
                    referrerPolicy="no-referrer"
                  />
                  <span className="min-w-0">
                    <span className="block font-medium">{t('auth.oauthFlow.useAvatar')}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {s.suggestedAvatarUrl}
                    </span>
                  </span>
                </label>
              ) : null}
            </div>
          ) : null}

          {s.step === 'invitation' ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {t(`auth.${ns}.invitationRequired`, { providerName })}
              </p>
              <Input
                placeholder={t('auth.invitationCodePlaceholder')}
                aria-label={t('auth.invitationCodeLabel')}
                value={s.invitationCode}
                disabled={busy}
                onChange={(e) => patch({ invitationCode: e.target.value })}
                onKeyDown={(e) => e.key === 'Enter' && actions.submitInvitation()}
              />
              <Button
                className="w-full"
                loading={busy}
                disabled={!s.invitationCode.trim()}
                onClick={actions.submitInvitation}
              >
                {busy ? t(`auth.${ns}.completing`) : t(`auth.${ns}.completeRegistration`)}
              </Button>
              {isWechat ? (
                <div className="space-y-2 rounded-md border bg-muted/40 p-3">
                  <p className="text-sm font-medium">{t('auth.alreadyHaveAccount')}</p>
                  <p className="text-xs text-muted-foreground">
                    {hasCurrentAuthToken
                      ? t('auth.oauthFlow.bindCurrentAccountDescription', { providerName })
                      : t('auth.oauthFlow.signInThenBindDescription', { providerName })}
                  </p>
                  {!hasCurrentAuthToken ? (
                    <Input
                      type="email"
                      data-testid="existing-account-email"
                      placeholder={t('auth.emailPlaceholder')}
                      aria-label={t('auth.emailLabel')}
                      value={s.existingAccountEmail}
                      disabled={busy}
                      onChange={(e) => patch({ existingAccountEmail: e.target.value })}
                    />
                  ) : null}
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    data-testid="existing-account-submit"
                    disabled={busy}
                    onClick={actions.handleExistingAccountBinding}
                  >
                    {hasCurrentAuthToken ? t('auth.oauthFlow.bindCurrentAccount') : t('auth.signIn')}
                  </Button>
                </div>
              ) : null}
            </div>
          ) : s.step === 'adoption' ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {t('auth.oauthFlow.reviewProfileBeforeContinue', { providerName })}
              </p>
              <Button className="w-full" loading={busy} onClick={actions.continueLogin}>
                {busy ? t('common.processing') : t('auth.continue')}
              </Button>
            </div>
          ) : s.step === 'choose' ? (
            <div className="space-y-3">
              <div>
                <p className="text-sm font-medium">{t('auth.oauthFlow.chooseHowToContinue')}</p>
                <p className="text-xs text-muted-foreground">
                  {s.pendingEmail
                    ? t('auth.oauthFlow.suggestedEmail', { email: s.pendingEmail })
                    : t('auth.oauthFlow.chooseAccountActionHint')}
                </p>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <Button variant="outline" disabled={busy} onClick={() => actions.switchToBind()}>
                  {t('auth.oauthFlow.bindExistingAccount')}
                </Button>
                <Button disabled={busy} onClick={actions.switchToCreate}>
                  {t('auth.oauthFlow.createNewAccount')}
                </Button>
              </div>
            </div>
          ) : s.step === 'create' ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">{t('auth.oauthFlow.createAccountHint')}</p>
              <PendingOAuthCreateAccountForm
                testIdPrefix={provider}
                initialEmail={s.pendingEmail}
                isSubmitting={busy}
                errorMessage={s.accountActionError}
                onSubmit={actions.createAccount}
                onSwitchToBind={actions.switchToBind}
              />
              {showBackToChooser ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full"
                  onClick={() => patch({ step: 'choose' })}
                >
                  {t('auth.oauthFlow.backToOptions')}
                </Button>
              ) : null}
            </div>
          ) : s.step === 'bind' ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {isWechat
                  ? t('auth.oauthFlow.bindSignInToExistingAccount', { providerName })
                  : t('auth.oauthFlow.bindLoginHint', { providerName })}
              </p>
              {hasCurrentAuthToken ? (
                <div className="space-y-2 rounded-md border bg-muted/40 p-3">
                  <p className="flex items-center gap-1.5 text-sm font-medium">
                    <UserRound className="size-4" aria-hidden /> {t('auth.oauthFlow.bindCurrentAccountTitle')}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t('auth.oauthFlow.bindCurrentAccountDescription', { providerName })}
                  </p>
                  <Button className="w-full" loading={busy} onClick={actions.bindCurrentAccount}>
                    {busy ? t('common.processing') : t('auth.oauthFlow.bindCurrentAccount')}
                  </Button>
                </div>
              ) : (
                <div className="grid gap-2.5">
                  <Input
                    type="email"
                    data-testid={`${provider}-bind-login-email`}
                    placeholder={t('auth.emailPlaceholder')}
                    aria-label={t('auth.emailLabel')}
                    value={s.bindEmail}
                    disabled={busy}
                    onChange={(e) => patch({ bindEmail: e.target.value })}
                    onKeyDown={(e) => e.key === 'Enter' && actions.bindLogin()}
                  />
                  <PasswordInput
                    data-testid={`${provider}-bind-login-password`}
                    placeholder={t('auth.passwordPlaceholder')}
                    aria-label={t('auth.passwordLabel')}
                    value={s.bindPassword}
                    disabled={busy}
                    onChange={(e) => patch({ bindPassword: e.target.value })}
                    onKeyDown={(e) => e.key === 'Enter' && actions.bindLogin()}
                  />
                  <Button
                    data-testid={`${provider}-bind-login-submit`}
                    loading={busy}
                    disabled={!s.bindEmail.trim() || !s.bindPassword}
                    onClick={actions.bindLogin}
                  >
                    {busy ? t('common.processing') : t('auth.oauthFlow.logInAndBind')}
                  </Button>
                </div>
              )}
              {s.canReturnToCreate ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full"
                  disabled={busy}
                  onClick={actions.switchToCreate}
                >
                  {t('auth.oauthFlow.useDifferentEmail')}
                </Button>
              ) : null}
              {showBackToChooser ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full"
                  onClick={() => patch({ step: 'choose' })}
                >
                  {t('auth.oauthFlow.backToOptions')}
                </Button>
              ) : null}
            </div>
          ) : s.step === 'totp' ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {t('auth.oauthFlow.totpHint', {
                  providerName,
                  account: s.totpMasked || t('auth.oauthFlow.yourAccount')
                })}
              </p>
              <Input
                data-testid={`${provider}-bind-login-totp`}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="123456"
                aria-label={t('auth.verificationCode')}
                className="text-center font-mono tracking-[0.4em]"
                value={s.totpCode}
                disabled={busy}
                onChange={(e) => patch({ totpCode: e.target.value.replace(/\D/g, '').slice(0, 6) })}
                onKeyDown={(e) => e.key === 'Enter' && actions.submitTotp()}
              />
              <Button
                className="w-full"
                data-testid={`${provider}-bind-login-totp-submit`}
                loading={busy}
                disabled={s.totpCode.trim().length !== 6}
                onClick={actions.submitTotp}
              >
                {busy ? t('common.processing') : t('auth.oauthFlow.verifyAndContinue')}
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
