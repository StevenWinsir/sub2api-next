import { describe, expect, it, vi } from 'vitest'
import type { PublicSettings } from '@/types'
import { evaluateRouteGate, isBackendModePublicRouteAllowed, loginRedirectTo, type GateDeps } from '../gate'

interface Scenario {
  loggedIn?: boolean
  admin?: boolean
  simple?: boolean
  pending?: boolean
  backendMode?: boolean
  settingsLoaded?: boolean
  /** fetchPublicSettings 成功后写入的设置；undefined 表示加载失败 */
  fetched?: Partial<PublicSettings> | null
  settings?: Partial<PublicSettings> | null
  needsSetup?: boolean | 'error'
  complianceInitialized?: boolean
  complianceError?: { status: number; code: string; metadata?: Record<string, string> }
}

function makeDeps(s: Scenario = {}) {
  const state = {
    loaded: s.settingsLoaded ?? true,
    settings: (s.settings ?? {}) as Partial<PublicSettings> | null
  }
  const fetchPublicSettings = vi.fn(async () => {
    if (s.fetched === undefined || s.fetched === null) throw new Error('network')
    state.settings = s.fetched
    state.loaded = true
  })
  const requireAcknowledgement = vi.fn()
  const fetchStatus = vi.fn(async () => {
    if (s.complianceError) throw s.complianceError
  })
  const deps: GateDeps = {
    auth: () => ({
      isAuthenticated: !!s.loggedIn,
      isAdmin: !!s.admin,
      isSimpleMode: !!s.simple,
      hasPendingAuthSession: !!s.pending
    }),
    app: () => ({
      publicSettingsLoaded: state.loaded,
      cachedPublicSettings: state.settings as PublicSettings | null,
      backendModeEnabled: !!s.backendMode
    }),
    fetchPublicSettings,
    getSetupStatus: async () => {
      if (s.needsSetup === 'error') throw new Error('down')
      return { needs_setup: s.needsSetup ?? false }
    },
    compliance: {
      isInitialized: () => !!s.complianceInitialized,
      fetchStatus,
      requireAcknowledgement
    }
  }
  return { deps, fetchPublicSettings, fetchStatus, requireAcknowledgement }
}

const go = (path: string, s?: Scenario) => {
  const { deps } = makeDeps(s)
  return evaluateRouteGate({ path: path.split(/[?#]/)[0], fullPath: path }, deps)
}
const allow = { type: 'allow' }
const to = (p: string) => ({ type: 'redirect', to: p })

describe('route gate · §2.5 step 3: /setup', () => {
  it('redirects to /login when installed and signed out', async () => {
    expect(await go('/setup', { needsSetup: false })).toEqual(to('/login'))
  })
  it('redirects by role when installed and signed in', async () => {
    expect(await go('/setup', { needsSetup: false, loggedIn: true })).toEqual(to('/dashboard'))
    expect(await go('/setup', { needsSetup: false, loggedIn: true, admin: true })).toEqual(
      to('/admin/dashboard')
    )
  })
  it('allows when installation is still needed', async () => {
    expect(await go('/setup', { needsSetup: true })).toEqual(allow)
  })
  it('allows when the setup status query fails', async () => {
    expect(await go('/setup', { needsSetup: 'error' })).toEqual(allow)
  })
})

describe('route gate · §2.5 step 4: public routes', () => {
  it('allows anonymous access to public pages', async () => {
    for (const p of ['/home', '/login', '/register', '/key-usage', '/legal/privacy', '/payment/result']) {
      expect(await go(p)).toEqual(allow)
    }
  })

  it('redirects a signed-in user away from /login and /register', async () => {
    expect(await go('/login', { loggedIn: true })).toEqual(to('/dashboard'))
    expect(await go('/register', { loggedIn: true, admin: true })).toEqual(to('/admin/dashboard'))
  })

  it('backend mode: signed-in non-admin stays on /login (avoids redirect loop)', async () => {
    expect(await go('/login', { loggedIn: true, backendMode: true })).toEqual(allow)
    expect(await go('/login', { loggedIn: true, admin: true, backendMode: true })).toEqual(
      to('/admin/dashboard')
    )
  })

  describe('/model-plaza', () => {
    it('blocks only when settings loaded and explicitly disabled', async () => {
      expect(await go('/model-plaza', { settings: { model_plaza_enabled: false } })).toEqual(to('/home'))
      expect(await go('/model-plaza', { settings: { model_plaza_enabled: false }, loggedIn: true })).toEqual(
        to('/dashboard')
      )
      expect(
        await go('/model-plaza', { settings: { model_plaza_enabled: false }, loggedIn: true, admin: true })
      ).toEqual(to('/admin/dashboard'))
    })
    it('allows when enabled', async () => {
      expect(await go('/model-plaza', { settings: { model_plaza_enabled: true } })).toEqual(allow)
    })
    it('requires login when model_plaza_require_auth is set (carries redirect)', async () => {
      expect(
        await go('/model-plaza?tab=x', {
          settings: { model_plaza_enabled: true, model_plaza_require_auth: true }
        })
      ).toEqual(to(loginRedirectTo('/model-plaza?tab=x')))
      expect(
        await go('/model-plaza', {
          settings: { model_plaza_enabled: true, model_plaza_require_auth: true },
          loggedIn: true
        })
      ).toEqual(allow)
    })
    it('loads public settings first when not loaded; a load failure is fail-open', async () => {
      const failing = makeDeps({ settingsLoaded: false, fetched: null })
      const result = await evaluateRouteGate({ path: '/model-plaza', fullPath: '/model-plaza' }, failing.deps)
      expect(failing.fetchPublicSettings).toHaveBeenCalledTimes(1)
      expect(result).toEqual(allow)

      const disabled = makeDeps({ settingsLoaded: false, fetched: { model_plaza_enabled: false } })
      expect(
        await evaluateRouteGate({ path: '/model-plaza', fullPath: '/model-plaza' }, disabled.deps)
      ).toEqual(to('/home'))
    })
    it('backend mode: signed-in non-admin is sent to /login; anonymous hits the whitelist', async () => {
      expect(
        await go('/model-plaza', {
          settings: { model_plaza_enabled: true },
          backendMode: true,
          loggedIn: true
        })
      ).toEqual(to('/login'))
      expect(
        await go('/model-plaza', { settings: { model_plaza_enabled: true }, backendMode: true })
      ).toEqual(to('/login'))
    })
  })

  describe('backend mode whitelist for anonymous users', () => {
    const anon = { backendMode: true }
    it('allows whitelisted pages and OAuth callbacks', async () => {
      for (const p of [
        '/login',
        '/key-usage',
        '/setup',
        '/payment/result',
        '/payment/airwallex',
        '/legal/terms',
        '/auth/callback',
        '/auth/linuxdo/callback',
        '/auth/wechat/callback',
        '/auth/wechat/payment/callback',
        '/auth/dingtalk/callback',
        '/auth/dingtalk/email-completion',
        '/auth/oidc/callback'
      ]) {
        expect(await go(p, { ...anon, needsSetup: true })).toEqual(allow)
      }
    })
    it('blocks other public pages', async () => {
      for (const p of ['/home', '/register', '/forgot-password', '/payment/stripe']) {
        expect(await go(p, anon)).toEqual(to('/login'))
      }
    })
    it('allows /register and /email-verify only with a pending auth session', async () => {
      expect(await go('/register', { ...anon, pending: true })).toEqual(allow)
      expect(await go('/email-verify', { ...anon, pending: true })).toEqual(allow)
      expect(await go('/email-verify', anon)).toEqual(to('/login'))
    })
  })
})

describe('route gate · §2.5 step 5: protected routes', () => {
  it('redirects anonymous users to /login with the original full path', async () => {
    expect(await go('/keys?page=2#x')).toEqual(to(loginRedirectTo('/keys?page=2#x')))
    expect(await go('/admin/users')).toEqual(to(loginRedirectTo('/admin/users')))
  })
  it('sends non-admins away from admin routes', async () => {
    expect(await go('/admin/users', { loggedIn: true })).toEqual(to('/dashboard'))
  })
  it('allows users and admins to their routes', async () => {
    expect(await go('/keys', { loggedIn: true })).toEqual(allow)
    expect(await go('/admin/users', { loggedIn: true, admin: true })).toEqual(allow)
  })
  it('admin entering admin routes fetches compliance status once; 423 enters pending state', async () => {
    const ok = makeDeps({ loggedIn: true, admin: true })
    await evaluateRouteGate({ path: '/admin/users', fullPath: '/admin/users' }, ok.deps)
    expect(ok.fetchStatus).toHaveBeenCalledTimes(1)

    const done = makeDeps({ loggedIn: true, admin: true, complianceInitialized: true })
    await evaluateRouteGate({ path: '/admin/users', fullPath: '/admin/users' }, done.deps)
    expect(done.fetchStatus).not.toHaveBeenCalled()

    const blocked = makeDeps({
      loggedIn: true,
      admin: true,
      complianceError: { status: 423, code: 'ADMIN_COMPLIANCE_ACK_REQUIRED', metadata: { version: 'v1' } }
    })
    const result = await evaluateRouteGate({ path: '/admin/users', fullPath: '/admin/users' }, blocked.deps)
    expect(blocked.requireAcknowledgement).toHaveBeenCalledWith({ version: 'v1' })
    expect(result).toEqual(allow)
  })
  it('non-423 compliance errors do not block navigation', async () => {
    const deps = makeDeps({ loggedIn: true, admin: true, complianceError: { status: 500, code: 'X' } })
    expect(await evaluateRouteGate({ path: '/admin/users', fullPath: '/admin/users' }, deps.deps)).toEqual(
      allow
    )
    expect(deps.requireAcknowledgement).not.toHaveBeenCalled()
  })
})

describe('route gate · §2.5 step 6: feature flags (fail-open)', () => {
  const user = { loggedIn: true }
  const admin = { loggedIn: true, admin: true }
  const cases: Array<[string, string, keyof PublicSettings, { user: string; admin: string }]> = [
    ['payment', '/purchase', 'payment_enabled', { user: '/dashboard', admin: '/admin/dashboard' }],
    ['payment (orders)', '/orders', 'payment_enabled', { user: '/dashboard', admin: '/admin/dashboard' }],
    [
      'payment (admin orders)',
      '/admin/orders',
      'payment_enabled',
      { user: '/dashboard', admin: '/admin/dashboard' }
    ],
    [
      'risk control',
      '/admin/risk-control',
      'risk_control_enabled',
      { user: '/dashboard', admin: '/admin/settings' }
    ],
    [
      'risk control (audit)',
      '/admin/prompt-audit',
      'risk_control_enabled',
      { user: '/dashboard', admin: '/admin/settings' }
    ],
    [
      'subscription',
      '/subscriptions',
      'subscription_enabled',
      { user: '/dashboard', admin: '/admin/dashboard' }
    ]
  ]

  for (const [label, path, key, redirects] of cases) {
    describe(label, () => {
      it('blocks when loaded and explicitly false', async () => {
        const isAdminRoute = path.startsWith('/admin')
        const who = isAdminRoute ? admin : user
        expect(await go(path, { ...who, settings: { [key]: false } })).toEqual(
          to(isAdminRoute ? redirects.admin : redirects.user)
        )
        if (!isAdminRoute) {
          expect(await go(path, { ...admin, settings: { [key]: false } })).toEqual(to(redirects.admin))
        }
      })
      it('allows when true', async () => {
        const who = path.startsWith('/admin') ? admin : user
        expect(await go(path, { ...who, settings: { [key]: true } })).toEqual(allow)
      })
      it('allows when the value is absent', async () => {
        const who = path.startsWith('/admin') ? admin : user
        expect(await go(path, { ...who, settings: {} })).toEqual(allow)
      })
      it('fails open when settings fail to load (unknown state is not a toggle)', async () => {
        const who = path.startsWith('/admin') ? admin : user
        const d = makeDeps({ ...who, settingsLoaded: false, fetched: null })
        const result = await evaluateRouteGate({ path, fullPath: path }, d.deps)
        expect(d.fetchPublicSettings).toHaveBeenCalledTimes(1)
        expect(result).toEqual(allow)
      })
      it('loads settings first and then blocks if they turn out to be disabled', async () => {
        const who = path.startsWith('/admin') ? admin : user
        const d = makeDeps({ ...who, settingsLoaded: false, fetched: { [key]: false } })
        const result = await evaluateRouteGate({ path, fullPath: path }, d.deps)
        expect(result.type).toBe('redirect')
      })
    })
  }

  it('does not load settings for routes without feature gates', async () => {
    const d = makeDeps({ ...user, settingsLoaded: false, fetched: {} })
    await evaluateRouteGate({ path: '/keys', fullPath: '/keys' }, d.deps)
    expect(d.fetchPublicSettings).not.toHaveBeenCalled()
  })
})

describe('route gate · §2.5 step 7: simple mode', () => {
  it('blocks restricted paths (prefix match)', async () => {
    for (const p of ['/redeem', '/subscriptions', '/admin/subscriptions', '/admin/redeem']) {
      const admin = p.startsWith('/admin')
      expect(await go(p, { loggedIn: true, admin, simple: true })).toEqual(
        to(admin ? '/admin/dashboard' : '/dashboard')
      )
    }
  })
  it('does not affect other paths or standard mode', async () => {
    expect(await go('/keys', { loggedIn: true, simple: true })).toEqual(allow)
    expect(await go('/redeem', { loggedIn: true })).toEqual(allow)
  })
})

describe('route gate · §2.5 step 8: backend mode for signed-in users', () => {
  it('admins pass everywhere', async () => {
    expect(await go('/admin/users', { loggedIn: true, admin: true, backendMode: true })).toEqual(allow)
  })
  it('non-admins are limited to the whitelist', async () => {
    expect(await go('/keys', { loggedIn: true, backendMode: true })).toEqual(to('/login'))
    expect(await go('/dashboard', { loggedIn: true, backendMode: true })).toEqual(to('/login'))
  })
})

describe('route gate · other', () => {
  it('lets unknown paths through (rendered as 404)', async () => {
    expect(await go('/definitely/not/a/route')).toEqual(allow)
  })
  it('applies redirect-type routes before guards and keeps query/hash', async () => {
    expect(await go('/admin', { loggedIn: true, admin: true })).toEqual(to('/admin/dashboard'))
    expect(await go('/admin/channels?x=1#h', { loggedIn: true, admin: true })).toEqual(
      to('/admin/channels/pricing?x=1#h')
    )
    expect(await go('/admin/affiliates', { loggedIn: true, admin: true })).toEqual(
      to('/admin/affiliates/invites')
    )
    expect(await go('/')).toEqual(to('/home'))
  })
  it('isBackendModePublicRouteAllowed matches the Vue prefix semantics', () => {
    expect(isBackendModePublicRouteAllowed('/legal/anything', false)).toBe(true)
    expect(isBackendModePublicRouteAllowed('/login', false)).toBe(true)
    expect(isBackendModePublicRouteAllowed('/home', false)).toBe(false)
  })
})
