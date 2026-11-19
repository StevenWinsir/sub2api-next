import * as React from 'react'
import Link from 'next/link'
import { ShieldCheck } from 'lucide-react'
import dynamic from 'next/dynamic'
import { Button } from '@/components/ui/button'
import type { LoginAgreementDocument } from '@/types'
import { t } from '@/i18n'
import { useLocale } from '@/i18n/react'

interface Props {
  accepted: boolean
  documents: LoginAgreementDocument[]
  mode: 'modal' | 'checkbox'
  updatedAt?: string
  open: boolean
  onAccept: () => void
  onReject: () => void
  onOpen: () => void
}

const docHref = (doc: LoginAgreementDocument) => `/legal/${encodeURIComponent(doc.id || doc.title)}`

/** 协议弹窗（含 Radix Dialog / 焦点陷阱等）按需加载：只有真正需要弹出时才下载。 */
const LoginAgreementDialog = dynamic(
  () => import('./LoginAgreementDialog').then((m) => m.LoginAgreementDialog),
  { ssr: false }
)

/** 登录 / 注册协议同意：checkbox 模式内联勾选；modal 模式弹窗（拒绝 / 同意）。 */
export function LoginAgreementPrompt({
  accepted,
  documents,
  mode,
  updatedAt = '',
  open,
  onAccept,
  onReject,
  onOpen
}: Props) {
  useLocale()
  const docs = documents.filter((d) => d.title.trim())
  if (docs.length === 0) return null

  return (
    <>
      {mode === 'checkbox' ? (
        <div className="flex items-start gap-2.5">
          <input
            id="login-agreement-consent"
            type="checkbox"
            checked={accepted}
            className="mt-0.5 size-4 shrink-0 accent-[var(--primary)]"
            onChange={(e) => (e.target.checked ? onAccept() : onReject())}
          />
          <p className="text-[13px] leading-5 text-muted-foreground">
            <label htmlFor="login-agreement-consent" className="cursor-pointer text-foreground">
              {t('legal.loginAgreementPrompt.checkboxPrefix')}
            </label>
            {docs.map((doc, i) => (
              <React.Fragment key={doc.id || doc.title}>
                <Link
                  href={docHref(doc)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-primary underline-offset-4 hover:underline"
                >
                  {doc.title}
                </Link>
                {i < docs.length - 1 ? t('legal.loginAgreementPrompt.documentSeparator') : null}
              </React.Fragment>
            ))}
          </p>
        </div>
      ) : !accepted ? (
        <div className="flex items-start gap-3 rounded-md border border-primary/20 bg-primary/5 p-3 text-sm">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="font-medium">{t('legal.loginAgreementPrompt.noticeTitle')}</p>
            <p className="mt-1 text-muted-foreground">{t('legal.loginAgreementPrompt.noticeDescription')}</p>
          </div>
          <Button type="button" size="sm" onClick={onOpen}>
            {t('legal.loginAgreementPrompt.viewTerms')}
          </Button>
        </div>
      ) : null}

      {open ? (
        <LoginAgreementDialog
          documents={docs}
          updatedAt={updatedAt}
          onAccept={onAccept}
          onReject={onReject}
          onOpen={onOpen}
        />
      ) : null}
    </>
  )
}
