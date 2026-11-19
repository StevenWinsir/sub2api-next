import * as React from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { useAppStore } from '@/stores/app'
import { useAuthStore } from '@/stores/auth'
import { useMounted } from '@/hooks/useMounted'
import { sanitizeUrl } from '@/utils/url'
import { t } from '@/i18n'
import { Brand } from './Brand'
import { LocaleSwitch } from './LocaleSwitch'
import { ThemeToggle } from './ThemeToggle'

/** 营销级公共布局：顶栏 + 页脚（文档、联系方式来自公开设置）。 */
export function PublicLayout({ children }: { children: React.ReactNode }) {
  const mounted = useMounted()
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const isAdmin = useAuthStore((s) => s.isAdmin)
  const docUrl = useAppStore((s) => s.docUrl)
  const contactInfo = useAppStore((s) => s.contactInfo)
  const siteName = useAppStore((s) => s.siteName)
  const safeDoc = sanitizeUrl(docUrl || '', { allowRelative: false })

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="sticky top-0 z-30 border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4 sm:px-6">
          <Brand />
          <nav className="ml-4 hidden items-center gap-1 md:flex" aria-label="primary">
            <Button asChild variant="ghost" size="sm">
              <Link href="/model-plaza">{t('modelPlaza.title')}</Link>
            </Button>
            {safeDoc ? (
              <Button asChild variant="ghost" size="sm">
                <a href={safeDoc} target="_blank" rel="noopener noreferrer">
                  {t('ui.shell.docs')}
                </a>
              </Button>
            ) : null}
          </nav>
          <div className="ml-auto flex items-center gap-1">
            <LocaleSwitch />
            <ThemeToggle />
            {mounted && isAuthenticated ? (
              <Button asChild size="sm">
                <Link href={isAdmin ? '/admin/dashboard' : '/dashboard'}>{t('nav.dashboard')}</Link>
              </Button>
            ) : (
              <Button asChild size="sm">
                <Link href="/login">{t('home.login')}</Link>
              </Button>
            )}
          </div>
        </div>
      </header>
      <main id="main-content" className="flex-1">
        {children}
      </main>
      <footer className="border-t">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-6 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <span>
            © {new Date().getFullYear()} {siteName}
          </span>
          {contactInfo ? (
            <span>
              {t('ui.shell.contact')}: {contactInfo}
            </span>
          ) : null}
        </div>
      </footer>
    </div>
  )
}
