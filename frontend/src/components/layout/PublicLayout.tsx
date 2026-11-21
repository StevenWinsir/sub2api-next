import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { Button } from '@/components/ui/button'
import { useAppStore } from '@/stores/app'
import { useAuthStore } from '@/stores/auth'
import { useMounted } from '@/hooks/useMounted'
import { sanitizeUrl } from '@/utils/url'
import { FeatureFlags, resolveFeatureFlag } from '@/utils/featureFlags'
import { t } from '@/i18n'
import { Brand } from './Brand'
import { SimpleLocaleSwitch, SimpleThemeToggle } from './SimpleSwitches'

/** 营销级公共布局：顶栏 + 页脚（文档、联系方式来自公开设置）。 */
export function PublicLayout({ children }: { children: React.ReactNode }) {
  const mounted = useMounted()
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const isAdmin = useAuthStore((s) => s.isAdmin)
  const docUrl = useAppStore((s) => s.docUrl)
  const contactInfo = useAppStore((s) => s.contactInfo)
  const siteName = useAppStore((s) => s.siteName)
  const settings = useAppStore((s) => s.cachedPublicSettings)
  const router = useRouter()
  const safeDoc = sanitizeUrl(docUrl || '', { allowRelative: false })
  // 管理员配置了自定义首页（iframe / HTML）时，/home 以整页方式渲染，不叠加外壳
  if (router.pathname === '/home' && (settings?.home_content || '').trim().length > 0) {
    return <main id="main-content">{children}</main>
  }
  // 模型广场的控制台内嵌形态（?embedded=1 且已登录）由页面自己套控制台外壳
  if (
    router.pathname === '/model-plaza' &&
    mounted &&
    isAuthenticated &&
    router.asPath.split('#')[0].includes('embedded=1')
  ) {
    return <>{children}</>
  }
  // 模型广场入口：功能开启，且（已登录 或 不强制登录）
  const showModelPlaza =
    resolveFeatureFlag(settings, FeatureFlags.modelPlaza) &&
    (mounted && isAuthenticated ? true : settings?.model_plaza_require_auth !== true)
  const legalDocs = (settings?.login_agreement_documents ?? []).filter((d) => d.title?.trim())

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="sticky top-0 z-30 border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4 sm:px-6">
          <Brand />
          <nav className="ml-4 hidden items-center gap-1 md:flex" aria-label="primary">
            {showModelPlaza ? (
              <Button asChild variant="ghost" size="sm">
                <Link href="/model-plaza">{t('modelPlaza.title')}</Link>
              </Button>
            ) : null}
            {safeDoc ? (
              <Button asChild variant="ghost" size="sm">
                <a href={safeDoc} target="_blank" rel="noopener noreferrer">
                  {t('ui.shell.docs')}
                </a>
              </Button>
            ) : null}
          </nav>
          <div className="ml-auto flex items-center gap-1">
            <SimpleLocaleSwitch />
            <SimpleThemeToggle />
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
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            {legalDocs.map((doc) => (
              <Link
                key={doc.id || doc.title}
                href={`/legal/${encodeURIComponent(doc.id || doc.title)}`}
                className="hover:text-foreground hover:underline"
              >
                {doc.title}
              </Link>
            ))}
            {contactInfo ? (
              <span>
                {t('ui.shell.contact')}: {contactInfo}
              </span>
            ) : null}
          </div>
        </div>
      </footer>
    </div>
  )
}
