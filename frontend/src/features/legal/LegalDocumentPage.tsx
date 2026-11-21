/** /legal/:documentId —— 登录协议文档与管理员合规承诺（构建期生成的 Markdown，经 DOMPurify 渲染）。 */
import * as React from 'react'
import { useRouter } from 'next/router'
import { FileText, Globe, Loader2, Settings2, ShieldCheck } from 'lucide-react'
import { LEGAL_DOCUMENTS } from '@/generated/legalDocuments'
import { useAppStore } from '@/stores/app'
import type { LoginAgreementDocument } from '@/types'
import { renderMarkdownSafe } from '@/utils/markdown'
import { t } from '@/i18n'
import { useLocale } from '@/i18n/react'

const ADMIN_COMPLIANCE_ID = 'admin-compliance'

function DocumentIcon({ title }: { title: string }) {
  const className = 'size-5'
  if (title.includes('政策') || title.includes('隐私'))
    return <ShieldCheck className={className} aria-hidden />
  if (title.includes('国家') || title.includes('地区')) return <Globe className={className} aria-hidden />
  if (title.includes('特定')) return <Settings2 className={className} aria-hidden />
  return <FileText className={className} aria-hidden />
}

/** 取当前语言的构建期文档；缺少时回退英文。 */
export function adminComplianceMarkdown(locale: string): string {
  return (
    LEGAL_DOCUMENTS[`admin-compliance.${locale === 'zh' ? 'zh' : 'en'}`] ??
    LEGAL_DOCUMENTS['admin-compliance.en'] ??
    ''
  )
}

export function LegalDocumentPage() {
  const locale = useLocale()
  const router = useRouter()
  const settings = useAppStore((s) => s.cachedPublicSettings)
  const fetchPublicSettings = useAppStore((s) => s.fetchPublicSettings)
  const [loading, setLoading] = React.useState(!settings)
  const [loadError, setLoadError] = React.useState(false)

  React.useEffect(() => {
    let cancelled = false
    void fetchPublicSettings().then((loaded) => {
      if (cancelled) return
      if (!loaded) setLoadError(true)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [fetchPublicSettings])

  const rawId = router.query.documentId
  const documentId = typeof rawId === 'string' ? rawId : Array.isArray(rawId) ? (rawId[0] ?? '') : ''
  const isAdminCompliance = documentId === ADMIN_COMPLIANCE_ID

  const current = React.useMemo<LoginAgreementDocument | null>(() => {
    if (isAdminCompliance) {
      return {
        id: ADMIN_COMPLIANCE_ID,
        title: t('adminCompliance.title'),
        content_md: adminComplianceMarkdown(locale)
      }
    }
    if (!documentId) return null
    return (settings?.login_agreement_documents ?? []).find((d) => d.id === documentId) ?? null
  }, [isAdminCompliance, documentId, settings, locale])

  const html = React.useMemo(() => renderMarkdownSafe(current?.content_md?.trim() ?? ''), [current])
  const updatedAt = isAdminCompliance ? '' : settings?.login_agreement_updated_at || ''

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      {loading || !router.isReady ? (
        <div className="flex justify-center py-20" role="status">
          <Loader2 className="size-6 animate-spin text-primary" aria-hidden />
        </div>
      ) : loadError ? (
        <section className="rounded-lg border border-destructive/30 bg-destructive/10 p-6 text-center">
          <h1 className="text-lg font-semibold">{t('legal.loadFailed')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('legal.retryLater')}</p>
        </section>
      ) : !current ? (
        <section className="flex items-start gap-3 rounded-lg border bg-card p-6">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <FileText className="size-5" aria-hidden />
          </span>
          <div>
            <h1 className="text-lg font-semibold">{t('legal.notFound')}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{t('legal.notFoundDescription')}</p>
          </div>
        </section>
      ) : (
        <article className="space-y-6">
          <header className="flex items-start gap-4 border-b pb-6">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <DocumentIcon title={current.title} />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {isAdminCompliance ? t('legal.adminCompliance') : t('legal.loginAgreement')}
              </p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight">{current.title}</h1>
              {updatedAt ? (
                <p className="mt-1 text-sm text-muted-foreground">
                  {t('legal.updatedAt', { date: updatedAt })}
                </p>
              ) : null}
            </div>
          </header>
          {html ? (
            // Markdown 已经 DOMPurify 清洗
            <div className="markdown-body" dangerouslySetInnerHTML={{ __html: html }} />
          ) : (
            <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              {t('legal.empty')}
            </div>
          )}
        </article>
      )}
    </div>
  )
}
