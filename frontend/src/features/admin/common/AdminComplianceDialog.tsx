/** 管理员合规确认对话框（423 ADMIN_COMPLIANCE_REQUIRED）：强制弹出，不可通过关闭绕过。 */
import * as React from 'react'
import { ExternalLink, ShieldAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { adminComplianceMarkdown } from '@/features/legal/LegalDocumentPage'
import { getLocale, t } from '@/i18n'
import { useLocale } from '@/i18n/react'
import { useAdminComplianceStore } from '@/stores/adminCompliance'
import { useAppStore } from '@/stores/app'
import { useAuthStore } from '@/stores/auth'
import { renderMarkdownSafe } from '@/utils/markdown'

const DEFAULT_DOC_ZH = 'https://github.com/Wei-Shaw/sub2api/blob/main/docs/legal/admin-compliance.zh.md'
const DEFAULT_DOC_EN = 'https://github.com/Wei-Shaw/sub2api/blob/main/docs/legal/admin-compliance.en.md'

export function AdminComplianceDialog() {
  useLocale()
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const isAdmin = useAuthStore((s) => s.isAdmin)
  const shouldShow = useAdminComplianceStore((s) => s.shouldShow)
  const status = useAdminComplianceStore((s) => s.status)
  const submitting = useAdminComplianceStore((s) => s.submitting)
  const visible = isAuthenticated && isAdmin && shouldShow
  const locale = getLocale()
  const expected = useAdminComplianceStore.getState().getExpectedPhrase()
  const [typed, setTyped] = React.useState('')
  const [attempted, setAttempted] = React.useState(false)

  // 短语随语言变化或弹窗重新出现时重置输入（渲染期派生，避免 effect 内 setState）
  const resetKey = `${visible}:${expected}`
  const [prevKey, setPrevKey] = React.useState(resetKey)
  if (resetKey !== prevKey) {
    setPrevKey(resetKey)
    setTyped('')
    setAttempted(false)
  }

  const html = React.useMemo(() => renderMarkdownSafe(adminComplianceMarkdown(locale)), [locale])
  const documentUrl =
    locale === 'zh' ? status?.document_url_zh || DEFAULT_DOC_ZH : status?.document_url_en || DEFAULT_DOC_EN
  const canSubmit = typed.trim() === expected
  const mismatch = attempted && !canSubmit

  const submit = async () => {
    setAttempted(true)
    if (!canSubmit) return
    try {
      const next = await useAdminComplianceStore.getState().accept(typed.trim())
      if (!next.required) {
        useAppStore.getState().showSuccess(t('adminCompliance.accepted'))
        setTyped('')
        setAttempted(false)
      }
    } catch (error) {
      useAppStore
        .getState()
        .showError((error as { message?: string })?.message || t('adminCompliance.acceptFailed'))
    }
  }

  const logout = async () => {
    await useAuthStore.getState().logout()
    // 整页跳转：彻底清空内存中的会话状态（与 Vue 版一致）
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = '/login'
  }

  return (
    <Dialog open={visible}>
      <DialogContent
        className="max-w-4xl"
        onEscapeKeyDown={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        hideClose
      >
        <DialogHeader>
          <DialogTitle>{t('adminCompliance.title')}</DialogTitle>
          <DialogDescription className="sr-only">{t('adminCompliance.blockingNotice')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex gap-3 rounded-lg border border-warning/30 bg-warning/10 p-4 text-sm">
            <ShieldAlert className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden />
            <div className="space-y-1">
              <p className="font-semibold">{t('adminCompliance.blockingNotice')}</p>
              <p className="text-muted-foreground">{t('adminCompliance.riskNotice')}</p>
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_220px]">
            <section className="max-h-[40vh] min-h-48 overflow-y-auto rounded-lg border bg-card p-4">
              {/* Markdown 已经 DOMPurify 清洗 */}
              <div className="markdown-body" dangerouslySetInnerHTML={{ __html: html }} />
            </section>
            <aside className="space-y-3 rounded-lg border bg-muted/40 p-4 text-sm">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t('adminCompliance.version')}
                </p>
                <p className="mt-1 break-all font-mono">{status?.version || 'v2026.06.10'}</p>
              </div>
              <a
                href={documentUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-primary underline underline-offset-4"
              >
                <ExternalLink className="size-3.5" aria-hidden />
                {t('adminCompliance.openDocument')}
              </a>
              <p className="text-muted-foreground">{t('adminCompliance.documentSource')}</p>
            </aside>
          </div>
          <div className="space-y-2">
            <label htmlFor="admin-compliance-phrase" className="block text-sm font-semibold">
              {t('adminCompliance.inputLabel')}
            </label>
            <div className="rounded-md bg-muted px-3 py-2 font-mono text-sm">{expected}</div>
            <Input
              id="admin-compliance-phrase"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void submit()
              }}
              placeholder={t('adminCompliance.inputPlaceholder')}
              autoComplete="off"
              disabled={submitting}
              aria-invalid={mismatch || undefined}
            />
            {mismatch ? (
              <p role="alert" className="text-xs text-destructive">
                {t('adminCompliance.inputMismatch')}
              </p>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">{t('adminCompliance.legalNote')}</p>
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={submitting} onClick={() => void logout()}>
            {t('adminCompliance.logout')}
          </Button>
          <Button loading={submitting} disabled={!canSubmit} onClick={() => void submit()}>
            {t('adminCompliance.accept')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
