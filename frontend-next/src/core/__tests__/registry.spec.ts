import { existsSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import en from '@/i18n/locales/en'
import zh from '@/i18n/locales/zh'
import { isReservedBackendPath, matchRoute, RESERVED_PUBLIC_DIRS, ROUTES, routeToPagesFile } from '../routes'

const root = resolve(__dirname, '../../..')
const pagesDir = join(root, 'pages')

function listPageFiles(dir: string, base = ''): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    const rel = base ? `${base}/${name}` : name
    return statSync(full).isDirectory() ? listPageFiles(full, rel) : [rel]
  })
}

function lookup(messages: unknown, key: string): unknown {
  return key
    .split('.')
    .reduce<unknown>((cur, seg) => (cur as Record<string, unknown> | undefined)?.[seg], messages)
}

describe('route registry', () => {
  it('has unique paths and names', () => {
    expect(new Set(ROUTES.map((r) => r.path)).size).toBe(ROUTES.length)
    expect(new Set(ROUTES.map((r) => r.name)).size).toBe(ROUTES.length)
  })

  it('matches pages/ one-to-one (plus _app, _document, 404)', () => {
    const expected = new Set(ROUTES.map(routeToPagesFile))
    const actual = new Set(
      listPageFiles(pagesDir).filter((f) => !['_app.tsx', '_document.tsx', '404.tsx'].includes(f))
    )
    expect([...expected].filter((f) => !actual.has(f)).sort()).toEqual([])
    expect([...actual].filter((f) => !expected.has(f)).sort()).toEqual([])
  })

  it('never uses data-fetching functions in pages (keeps pages purely client-side)', async () => {
    const { readFileSync } = await import('node:fs')
    for (const file of listPageFiles(pagesDir)) {
      const source = readFileSync(join(pagesDir, file), 'utf8')
      expect(source, file).not.toMatch(/getStaticProps|getServerSideProps|getStaticPaths|getInitialProps/)
    }
  })

  it('does not collide with reserved backend paths (§3.4)', () => {
    for (const route of ROUTES) {
      // `/setup` 本身是前端页面，保留的是 `/setup/*`
      expect(isReservedBackendPath(route.path.replace(/:[^/]+/g, 'x')), route.path).toBe(false)
    }
  })

  it('keeps reserved directory names out of public/', () => {
    const publicDir = join(root, 'public')
    if (!existsSync(publicDir)) return
    const entries = readdirSync(publicDir).filter((n) => statSync(join(publicDir, n)).isDirectory())
    expect(entries.filter((n) => RESERVED_PUBLIC_DIRS.includes(n))).toEqual([])
    expect(existsSync(join(publicDir, 'logo.svg'))).toBe(true)
    expect(existsSync(join(publicDir, 'theme-init.js'))).toBe(true)
  })

  it('resolves every titleKey / descriptionKey / nav labelKey in both locales', () => {
    const missing: string[] = []
    for (const route of ROUTES) {
      const keys = [route.titleKey, route.descriptionKey, route.nav?.labelKey].filter((k): k is string => !!k)
      for (const key of keys) {
        for (const [code, messages] of [
          ['en', en],
          ['zh', zh]
        ] as const) {
          if (typeof lookup(messages, key) !== 'string') missing.push(`${code}:${key}`)
        }
      }
    }
    expect(missing).toEqual([])
  })

  it('every non-redirect route has a layout; redirects have a registered target', () => {
    for (const route of ROUTES) {
      if (route.redirectTo) {
        expect(route.layout).toBeNull()
        expect(matchRoute(route.redirectTo)?.route.redirectTo, route.path).toBeUndefined()
      } else {
        expect(route.layout, route.path).not.toBeNull()
      }
    }
  })

  it('matches static routes before dynamic ones and extracts params', () => {
    expect(matchRoute('/legal/privacy')?.params).toEqual({ documentId: 'privacy' })
    expect(matchRoute('/custom/abc')?.route.name).toBe('CustomPage')
    expect(matchRoute('/admin/users/')?.route.name).toBe('AdminUsers')
    expect(matchRoute('/nope')).toBeNull()
    expect(matchRoute('/legal')).toBeNull()
  })

  it('covers every route in Appendix A (R1 placeholder requirement)', () => {
    const appendixA = [
      '/',
      '/setup',
      '/home',
      '/login',
      '/register',
      '/email-verify',
      '/forgot-password',
      '/reset-password',
      '/auth/callback',
      '/auth/linuxdo/callback',
      '/auth/wechat/callback',
      '/auth/dingtalk/callback',
      '/auth/dingtalk/email-completion',
      '/auth/oidc/callback',
      '/auth/wechat/payment/callback',
      '/key-usage',
      '/legal/:documentId',
      '/model-plaza',
      '/oauth/mcp/authorize',
      '/dashboard',
      '/keys',
      '/batch-image',
      '/usage',
      '/redeem',
      '/affiliate',
      '/available-channels',
      '/monitor',
      '/settings/mcp',
      '/profile',
      '/subscriptions',
      '/purchase',
      '/orders',
      '/payment/qrcode',
      '/payment/result',
      '/payment/stripe',
      '/payment/airwallex',
      '/payment/stripe-popup',
      '/custom/:id',
      '/admin',
      '/admin/dashboard',
      '/admin/users',
      '/admin/groups',
      '/admin/accounts',
      '/admin/channels',
      '/admin/channels/pricing',
      '/admin/channels/monitor',
      '/admin/subscriptions',
      '/admin/proxies',
      '/admin/redeem',
      '/admin/promo-codes',
      '/admin/announcements',
      '/admin/usage',
      '/admin/affiliates',
      '/admin/affiliates/invites',
      '/admin/affiliates/rebates',
      '/admin/affiliates/transfers',
      '/admin/orders/dashboard',
      '/admin/orders',
      '/admin/orders/plans',
      '/admin/settings',
      '/admin/ops',
      '/admin/audit-logs',
      '/admin/risk-control',
      '/admin/prompt-audit',
      '/admin/plugins'
    ]
    expect(ROUTES.map((r) => r.path).sort()).toEqual([...appendixA].sort())
  })
})
