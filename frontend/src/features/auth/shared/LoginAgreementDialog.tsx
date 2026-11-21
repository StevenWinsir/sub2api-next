import * as React from 'react'
import Link from 'next/link'
import { ExternalLink, FileText, Globe, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import type { LoginAgreementDocument } from '@/types'
import { t } from '@/i18n'

const docHref = (doc: LoginAgreementDocument) => `/legal/${encodeURIComponent(doc.id || doc.title)}`

function DocIcon({ title }: { title: string }) {
  const lower = title.toLowerCase()
  if (
    lower.includes('policy') ||
    lower.includes('privacy') ||
    title.includes('政策') ||
    title.includes('隐私')
  )
    return <ShieldCheck className="size-4" aria-hidden />
  if (
    lower.includes('country') ||
    lower.includes('region') ||
    title.includes('国家') ||
    title.includes('地区')
  )
    return <Globe className="size-4" aria-hidden />
  return <FileText className="size-4" aria-hidden />
}

interface Props {
  documents: LoginAgreementDocument[]
  updatedAt: string
  onAccept: () => void
  onReject: () => void
  onOpen: () => void
}

/** 协议弹窗（modal 模式）：拒绝 / 同意；关闭按拒绝处理。仅在需要弹出时才挂载并按需加载。 */
export function LoginAgreementDialog({ documents, updatedAt, onAccept, onReject, onOpen }: Props) {
  return (
    <Dialog open onOpenChange={(v) => (v ? onOpen() : onReject())}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            {t('legal.loginAgreementPrompt.dialogTitle')}
            {updatedAt ? (
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-normal text-muted-foreground">
                {updatedAt}
              </span>
            ) : null}
          </DialogTitle>
          <DialogDescription>
            {t('legal.loginAgreementPrompt.dialogDescription', {
              date: updatedAt || t('legal.loginAgreementPrompt.recently')
            })}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          <p className="text-sm font-medium">{t('legal.loginAgreementPrompt.relatedDocuments')}</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {documents.map((doc) => (
              <Link
                key={doc.id || doc.title}
                href={docHref(doc)}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-center gap-3 rounded-md border bg-card px-3 py-3 text-sm transition-colors hover:border-primary/40 hover:bg-accent"
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                  <DocIcon title={doc.title} />
                </span>
                <span className="min-w-0 flex-1 truncate font-medium">{doc.title}</span>
                <ExternalLink className="size-4 text-muted-foreground" aria-hidden />
              </Link>
            ))}
          </div>
        </div>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button type="button" variant="outline" onClick={onReject}>
            {t('legal.loginAgreementPrompt.reject')}
          </Button>
          <Button type="button" onClick={onAccept}>
            {t('legal.loginAgreementPrompt.accept')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
