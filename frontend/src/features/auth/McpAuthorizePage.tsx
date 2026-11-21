/** MCP OAuth 授权同意页：预览授权请求 → 用户选择范围与权限 → 同意 / 拒绝（管理员范围需要 step-up）。 */
import * as React from 'react'
import { useRouter } from 'next/router'
import Link from 'next/link'
import { Loader2, PlugZap, ShieldAlert } from 'lucide-react'
import { mcpAPI, type MCPAccessScope, type MCPAuthorization, type MCPConsent } from '@/api/mcp'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/NativeSelect'
import { isStepUpBlocked, isStepUpCancelled, stepUpBlockReason, useStepUp } from '@/hooks/useStepUp'
import { useAuthStore } from '@/stores/auth'
import { t } from '@/i18n'
import { useLocale } from '@/i18n/react'
import { TotpStepUpDialog } from './TotpStepUpDialog'
import { parseMcpAuthorization, validateMcpPreview } from './mcpAuthorization'

function errorMessage(error: unknown, fallback: string): string {
  const message = (error as { message?: unknown } | null)?.message
  return typeof message === 'string' && message ? message : fallback
}

/** 授权请求（query 串）变化时整体重挂载：旧请求的状态、step-up、未完成的同意都不会带到新请求上。 */
export function McpAuthorizePage() {
  const router = useRouter()
  if (!router.isReady) return null
  const search = router.asPath.split('?')[1]?.split('#')[0] ?? ''
  return <McpAuthorizeForm key={search} search={search} />
}

function McpAuthorizeForm({ search }: { search: string }) {
  useLocale()
  const isAdmin = useAuthStore((s) => s.isAdmin)
  const email = useAuthStore((s) => s.user?.email)
  const stepUp = useStepUp()
  const stepUpRef = React.useRef(stepUp)
  React.useEffect(() => {
    stepUpRef.current = stepUp
  })

  const [loading, setLoading] = React.useState(true)
  const [submitting, setSubmitting] = React.useState(false)
  const [previewError, setPreviewError] = React.useState('')
  const [submitError, setSubmitError] = React.useState('')
  const [consent, setConsent] = React.useState<MCPConsent | null>(null)
  const [scope, setScope] = React.useState<MCPAccessScope>('user')
  const [readOnly, setReadOnly] = React.useState(true)
  const authorization = React.useRef<MCPAuthorization | null>(null)
  // 卸载（含请求变化导致的重挂载）后，旧的同意请求不得再被提交
  const alive = React.useRef(true)

  React.useEffect(() => {
    alive.current = true
    let cancelled = false
    void (async () => {
      try {
        const request = parseMcpAuthorization(new URLSearchParams(search), (k) => t(k))
        const result = await mcpAPI.previewAuthorization({ ...request })
        if (cancelled) return
        validateMcpPreview(result, request, (k) => t(k))
        authorization.current = Object.freeze({ ...request })
        setConsent(result)
      } catch (error) {
        if (!cancelled) setPreviewError(errorMessage(error, t('mcp.consentLoadFailed')))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
      alive.current = false
      authorization.current = null
      stepUpRef.current.onCancel()
    }
  }, [search])

  const redirectOrigin = React.useMemo(() => (consent ? new URL(consent.redirect_uri).origin : ''), [consent])

  const decide = async (approved: boolean) => {
    if (loading || submitting || !consent || !authorization.current) return
    const expectedRedirect = new URL(consent.redirect_uri)
    const input = {
      authorization: { ...authorization.current },
      approved,
      scope: approved && isAdmin ? scope : ('user' as const),
      read_only: approved ? readOnly : true
    }
    setSubmitting(true)
    setSubmitError('')
    try {
      const action = async () => {
        if (!alive.current) throw new Error(t('mcp.invalidRequest'))
        try {
          return await mcpAPI.authorize(input)
        } catch (error) {
          // 不为已不再展示的请求弹出 step-up
          if (!alive.current) throw new Error(t('mcp.invalidRequest'))
          throw error
        }
      }
      const result = approved && input.scope === 'admin' ? await stepUp.run(action) : await action()
      if (!alive.current) return
      const destination = new URL(result.redirect_url)
      if (
        destination.origin !== expectedRedirect.origin ||
        destination.pathname !== expectedRedirect.pathname ||
        destination.username ||
        destination.password ||
        destination.hash
      ) {
        throw new Error(t('mcp.invalidRedirect'))
      }
      window.location.assign(result.redirect_url)
    } catch (error) {
      if (!alive.current) return
      if (!isStepUpCancelled(error)) {
        setSubmitError(
          isStepUpBlocked(error)
            ? stepUpBlockReason(error) === 'STEP_UP_ADMIN_API_KEY_FORBIDDEN'
              ? t('stepUp.adminApiKeyForbidden')
              : t('stepUp.notEnabled')
            : errorMessage(error, t('mcp.consentSubmitFailed'))
        )
      }
      setSubmitting(false)
    }
  }

  return (
    <section
      aria-labelledby="mcp-consent-title"
      aria-busy={loading || submitting}
      className="space-y-5 rounded-xl border bg-card p-6 shadow-sm"
    >
      <div className="flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <PlugZap className="size-5" aria-hidden />
        </div>
        <div>
          <h1 id="mcp-consent-title" className="text-lg font-semibold tracking-tight">
            {t('mcp.consentTitle')}
          </h1>
          <p className="text-sm text-muted-foreground">{t('mcp.consentDescription')}</p>
        </div>
      </div>

      {loading ? (
        <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden /> {t('mcp.consentLoading')}
        </p>
      ) : previewError ? (
        <div className="space-y-3">
          <p
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {previewError}
          </p>
          <p className="text-sm text-muted-foreground">{t('mcp.consentRetryHint')}</p>
          <Button asChild variant="outline" size="sm">
            <Link href="/settings/mcp">{t('mcp.backToConnections')}</Link>
          </Button>
        </div>
      ) : consent ? (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            void decide(true)
          }}
        >
          <div className="space-y-3 rounded-md border bg-muted/30 p-4 text-sm">
            <dl className="grid gap-3">
              <div>
                <dt className="text-xs text-muted-foreground">{t('mcp.applicationName')}</dt>
                <dd data-testid="client-name" className="font-medium">
                  {consent.client_name}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{t('mcp.clientId')}</dt>
                <dd className="truncate font-mono text-xs" title={consent.client_id}>
                  {consent.client_id}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{t('mcp.returnAddress')}</dt>
                <dd data-testid="redirect-origin" className="font-medium">
                  {redirectOrigin}
                </dd>
                <dd data-testid="redirect-uri" className="break-all font-mono text-xs text-muted-foreground">
                  {consent.redirect_uri}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{t('mcp.requestedAccess')}</dt>
                <dd>{t('mcp.requestedAccessDescription')}</dd>
                <dd className="break-all font-mono text-xs text-muted-foreground">{consent.resource}</dd>
              </div>
            </dl>
            <p className="flex items-start gap-2 text-xs text-warning">
              <ShieldAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              {t('mcp.untrustedApplicationHint')}
            </p>
          </div>

          {email ? <p className="text-sm text-muted-foreground">{t('mcp.signedInAs', { email })}</p> : null}

          <div className="grid gap-1.5">
            <Label htmlFor="mcp-consent-scope">{t('mcp.scope')}</Label>
            <NativeSelect
              id="mcp-consent-scope"
              value={scope}
              disabled={submitting}
              aria-describedby="mcp-scope-hint"
              onChange={(e) => setScope(e.target.value as MCPAccessScope)}
            >
              <option value="user">{t('mcp.userScope')}</option>
              {isAdmin ? <option value="admin">{t('mcp.adminScope')}</option> : null}
            </NativeSelect>
            <p id="mcp-scope-hint" className="text-xs text-muted-foreground">
              {scope === 'admin' ? t('mcp.adminScopeHint') : t('mcp.userScopeHint')}
            </p>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="mcp-consent-permissions">{t('mcp.permissions')}</Label>
            <NativeSelect
              id="mcp-consent-permissions"
              value={readOnly ? 'ro' : 'rw'}
              disabled={submitting}
              aria-describedby="mcp-permissions-hint"
              onChange={(e) => setReadOnly(e.target.value === 'ro')}
            >
              <option value="ro">{t('mcp.readOnly')}</option>
              <option value="rw">{t('mcp.readWrite')}</option>
            </NativeSelect>
            <p
              id="mcp-permissions-hint"
              className={readOnly ? 'text-xs text-muted-foreground' : 'text-xs text-warning'}
            >
              {readOnly ? t('mcp.readOnlyHint') : t('mcp.readWriteHint')}
            </p>
            {scope === 'admin' && !readOnly ? (
              <p data-testid="admin-write-hint" className="text-xs text-destructive">
                {t('mcp.adminWriteHint')}
              </p>
            ) : null}
          </div>

          {submitError ? (
            <p
              role="alert"
              className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {submitError}
            </p>
          ) : null}

          <div className="grid grid-cols-2 gap-3">
            <Button
              data-testid="deny"
              type="button"
              variant="outline"
              disabled={submitting}
              onClick={() => void decide(false)}
            >
              {t('mcp.deny')}
            </Button>
            <Button data-testid="approve" type="submit" loading={submitting}>
              {submitting ? t('common.processing') : t('mcp.approve')}
            </Button>
          </div>
        </form>
      ) : null}
      <TotpStepUpDialog controller={stepUp} />
    </section>
  )
}
