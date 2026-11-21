/**
 * /home 营销首页。三种模式（优先级与 Vue 版一致）：
 *  1. 管理员配置的 home_content：URL → iframe；否则按 HTML 原样渲染；
 *  2. compact_home_enabled：精简首页；
 *  3. 默认营销首页。
 */
import * as React from 'react'
import Link from 'next/link'
import { ArrowRight, BookOpen, Check, GaugeCircle, Layers, Minus, Route } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAppStore } from '@/stores/app'
import { useAuthStore } from '@/stores/auth'
import { useMounted } from '@/hooks/useMounted'
import { FeatureFlags, resolveFeatureFlag } from '@/utils/featureFlags'
import { sanitizeUrl } from '@/utils/url'
import { t } from '@/i18n'
import { useLocale } from '@/i18n/react'

/** home_content 是 http(s) 地址时用 iframe 展示。 */
export function isHomeContentUrl(content: string): boolean {
  const c = content.trim()
  return c.startsWith('http://') || c.startsWith('https://')
}

const COMPARISON_ROWS = ['pricing', 'models', 'management', 'stability', 'control'] as const

export function HomePage() {
  useLocale()
  const mounted = useMounted()
  const settings = useAppStore((s) => s.cachedPublicSettings)
  const storeSiteName = useAppStore((s) => s.siteName)
  const storeLogo = useAppStore((s) => s.siteLogo)
  const docUrlStore = useAppStore((s) => s.docUrl)
  const publicSettingsLoaded = useAppStore((s) => s.publicSettingsLoaded)
  const fetchPublicSettings = useAppStore((s) => s.fetchPublicSettings)
  const isAuthenticatedRaw = useAuthStore((s) => s.isAuthenticated)
  const isAdmin = useAuthStore((s) => s.isAdmin)
  const isAuthenticated = mounted && isAuthenticatedRaw

  React.useEffect(() => {
    // 注入的配置缺失时通过接口补齐
    if (!publicSettingsLoaded) void fetchPublicSettings()
  }, [publicSettingsLoaded, fetchPublicSettings])

  const siteName = settings?.site_name || storeSiteName || 'Sub2API'
  const siteLogo = sanitizeUrl(settings?.site_logo || storeLogo || '', {
    allowRelative: true,
    allowDataUrl: true
  })
  const siteSubtitle = settings?.site_subtitle || 'AI API Gateway Platform'
  const docUrl = sanitizeUrl(settings?.doc_url || docUrlStore || '')
  const homeContent = settings?.home_content || ''
  const compact = settings?.compact_home_enabled === true
  const dashboardPath = isAdmin ? '/admin/dashboard' : '/dashboard'
  const ctaHref = isAuthenticated ? dashboardPath : '/login'
  const modelPlazaOpen =
    resolveFeatureFlag(settings, FeatureFlags.modelPlaza) &&
    (isAuthenticated || settings?.model_plaza_require_auth !== true)

  if (homeContent.trim().length > 0) {
    return (
      <div className="min-h-dvh">
        {isHomeContentUrl(homeContent) ? (
          // 与 Vue 版一致：不额外限制 sandbox（内容由管理员配置）
          <iframe
            src={homeContent.trim()}
            title={siteName}
            className="h-dvh w-full border-0"
            allowFullScreen
          />
        ) : (
          // SECURITY: home_content 仅管理员可配置，按 Vue 版 v-html 行为原样渲染（脚本不会执行）；风险已接受
          <div dangerouslySetInnerHTML={{ __html: homeContent }} />
        )}
      </div>
    )
  }

  const logoSrc = siteLogo || '/logo.svg'

  if (compact) {
    return (
      <div
        data-testid="compact-home"
        className="mx-auto flex min-h-[60vh] max-w-2xl flex-col items-center justify-center px-6 py-24 text-center"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logoSrc} alt="Logo" className="mb-6 size-16 rounded-xl object-contain" />
        <h1 className="text-4xl font-semibold tracking-tight">{siteName}</h1>
        <p className="mt-3 text-lg text-muted-foreground">{siteSubtitle}</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Button asChild size="lg">
            <Link href={ctaHref}>{isAuthenticated ? t('home.goToDashboard') : t('home.login')}</Link>
          </Button>
          {modelPlazaOpen ? (
            <Button asChild size="lg" variant="outline">
              <Link href="/model-plaza">{t('nav.modelPlaza')}</Link>
            </Button>
          ) : null}
        </div>
      </div>
    )
  }

  const features = [
    { icon: Route, title: 'home.features.unifiedGateway', desc: 'home.features.unifiedGatewayDesc' },
    { icon: Layers, title: 'home.features.multiAccount', desc: 'home.features.multiAccountDesc' },
    { icon: GaugeCircle, title: 'home.features.balanceQuota', desc: 'home.features.balanceQuotaDesc' }
  ] as const
  const providers = [
    { name: t('home.providers.claude'), live: true },
    { name: 'GPT', live: true },
    { name: t('home.providers.gemini'), live: true },
    { name: t('home.providers.antigravity'), live: true },
    { name: t('home.providers.more'), live: false }
  ]
  const painPoints = ['expensive', 'complex', 'unstable', 'noControl'] as const

  return (
    <div data-testid="default-home">
      {/* Hero */}
      <section className="relative overflow-hidden border-b">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_0%,color-mix(in_oklch,var(--primary)_14%,transparent),transparent)]"
        />
        <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-4 py-16 sm:px-6 md:py-24 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-6">
            <div className="flex flex-wrap gap-2">
              {(['subscriptionToApi', 'stickySession', 'realtimeBilling'] as const).map((tag) => (
                <span
                  key={tag}
                  className="rounded-full border bg-card px-3 py-1 text-xs font-medium text-muted-foreground"
                >
                  {t(`home.tags.${tag}`)}
                </span>
              ))}
            </div>
            <div className="space-y-4">
              <h1 className="text-4xl font-semibold leading-[1.1] tracking-tight sm:text-5xl">
                {t('home.heroSubtitle')}
              </h1>
              <p className="max-w-xl text-lg text-muted-foreground">{t('home.heroDescription')}</p>
              <p className="text-sm font-medium text-primary">
                {siteName} · {siteSubtitle}
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link href={ctaHref}>
                  {isAuthenticated ? t('home.goToDashboard') : t('home.getStarted')}
                  <ArrowRight aria-hidden />
                </Link>
              </Button>
              {docUrl ? (
                <Button asChild size="lg" variant="outline">
                  <a href={docUrl} target="_blank" rel="noopener noreferrer">
                    <BookOpen aria-hidden />
                    {t('home.viewDocs')}
                  </a>
                </Button>
              ) : null}
            </div>
          </div>

          {/* 请求示例卡片 */}
          <div className="rounded-xl border bg-[oklch(0.2_0.03_268)] shadow-xl" aria-hidden>
            <div className="flex items-center gap-1.5 border-b border-white/10 px-4 py-3">
              <span className="size-2.5 rounded-full bg-[#ef4444]" />
              <span className="size-2.5 rounded-full bg-[#eab308]" />
              <span className="size-2.5 rounded-full bg-[#22c55e]" />
              <span className="ml-3 font-mono text-xs text-white/40">terminal</span>
            </div>
            <pre className="overflow-x-auto p-5 font-mono text-[13px] leading-7 text-white/85">
              <code>
                <span className="text-white/40">$ </span>
                <span className="text-[#7dd3fc]">curl</span> -X POST /v1/messages \{'\n'}
                {'    '}-H <span className="text-[#fca5a5]">&quot;x-api-key: sk-••••••••&quot;</span> \{'\n'}
                {'    '}-d{' '}
                <span className="text-[#86efac]">{'\'{"model":"claude-sonnet","max_tokens":1024}\''}</span>
                {'\n\n'}
                <span className="text-[#86efac]">✓ 200 OK</span>{' '}
                <span className="text-white/40">· 842ms · $0.0021</span>
              </code>
            </pre>
          </div>
        </div>
      </section>

      {/* 痛点 */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
        <h2 className="text-center text-2xl font-semibold tracking-tight">{t('home.painPoints.title')}</h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {painPoints.map((key) => (
            <div key={key} className="rounded-lg border bg-card p-5">
              <h3 className="font-medium">{t(`home.painPoints.items.${key}.title`)}</h3>
              <p className="mt-1.5 text-sm text-muted-foreground">{t(`home.painPoints.items.${key}.desc`)}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 方案 */}
      <section className="border-y bg-muted/30">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
          <div className="text-center">
            <h2 className="text-2xl font-semibold tracking-tight">{t('home.solutions.title')}</h2>
            <p className="mt-2 text-muted-foreground">{t('home.solutions.subtitle')}</p>
          </div>
          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {features.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="rounded-lg border bg-card p-6">
                <div className="mb-4 flex size-10 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <Icon className="size-5" aria-hidden />
                </div>
                <h3 className="font-semibold">{t(title)}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{t(desc)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 对比 */}
      <section className="mx-auto max-w-5xl px-4 py-16 sm:px-6">
        <h2 className="text-center text-2xl font-semibold tracking-tight">{t('home.comparison.title')}</h2>
        <div className="mt-8 overflow-x-auto rounded-lg border bg-card">
          <table className="w-full min-w-[34rem] text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left">
                <th scope="col" className="px-4 py-3 font-medium">
                  {t('home.comparison.headers.feature')}
                </th>
                <th scope="col" className="px-4 py-3 font-medium text-muted-foreground">
                  {t('home.comparison.headers.official')}
                </th>
                <th scope="col" className="px-4 py-3 font-medium text-primary">
                  {t('home.comparison.headers.us')}
                </th>
              </tr>
            </thead>
            <tbody>
              {COMPARISON_ROWS.map((row) => (
                <tr key={row} className="border-b last:border-0">
                  <th scope="row" className="px-4 py-3 text-left font-medium">
                    {t(`home.comparison.items.${row}.feature`)}
                  </th>
                  <td className="px-4 py-3 text-muted-foreground">
                    <Minus className="mr-1.5 inline size-3.5" aria-hidden />
                    {t(`home.comparison.items.${row}.official`)}
                  </td>
                  <td className="px-4 py-3">
                    <Check className="mr-1.5 inline size-3.5 text-success" aria-hidden />
                    {t(`home.comparison.items.${row}.us`)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 模型提供商 */}
      <section className="border-t bg-muted/30">
        <div className="mx-auto max-w-7xl px-4 py-16 text-center sm:px-6">
          <h2 className="text-2xl font-semibold tracking-tight">{t('home.providers.title')}</h2>
          <p className="mt-2 text-muted-foreground">{t('home.providers.description')}</p>
          <ul className="mt-8 flex flex-wrap justify-center gap-3">
            {providers.map((p) => (
              <li
                key={p.name}
                className="flex items-center gap-2 rounded-full border bg-card px-4 py-2 text-sm font-medium"
              >
                {p.name}
                <span
                  className={
                    p.live
                      ? 'rounded bg-success/10 px-1.5 py-0.5 text-[11px] text-success'
                      : 'rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground'
                  }
                >
                  {p.live ? t('home.providers.supported') : t('home.providers.soon')}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-3xl px-4 py-20 text-center sm:px-6">
        <h2 className="text-3xl font-semibold tracking-tight">{t('home.cta.title')}</h2>
        <p className="mt-3 text-muted-foreground">{t('home.cta.description')}</p>
        <Button asChild size="lg" className="mt-8">
          <Link href={ctaHref}>{isAuthenticated ? t('home.goToDashboard') : t('home.cta.button')}</Link>
        </Button>
      </section>
    </div>
  )
}
