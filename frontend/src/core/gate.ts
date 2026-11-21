/**
 * 路由门禁（RouteGate）—— 严格按交接书 §2.5 的执行顺序复刻 Vue 版 router.beforeEach。
 *
 * 实现为"纯决策函数 + 可注入依赖"，这样所有分支都能用表驱动单元测试覆盖。
 * 返回 `allow`，或 `redirect`（调用方使用 router.replace 执行）。
 */
import type { PublicSettings } from '@/types'
import { matchRoute, routeRequiresAuth, type RouteDef } from './routes'

export type GateResult = { type: 'allow' } | { type: 'redirect'; to: string }

export interface GateTarget {
  /** 不含 query/hash 的路径。 */
  path: string
  /** 含 query/hash 的完整路径，用于登录后回跳。 */
  fullPath: string
}

export interface GateDeps {
  auth: () => {
    isAuthenticated: boolean
    isAdmin: boolean
    isSimpleMode: boolean
    hasPendingAuthSession: boolean
  }
  app: () => {
    publicSettingsLoaded: boolean
    cachedPublicSettings: PublicSettings | null
    backendModeEnabled: boolean
  }
  fetchPublicSettings: () => Promise<unknown>
  getSetupStatus: () => Promise<{ needs_setup: boolean }>
  compliance: {
    isInitialized: () => boolean
    fetchStatus: () => Promise<unknown>
    requireAcknowledgement: (metadata?: Record<string, string>) => void
  }
}

const ALLOW: GateResult = { type: 'allow' }
const redirect = (to: string): GateResult => ({ type: 'redirect', to })

// ───────── 后端模式白名单（与 Vue 版常量一致）─────────
const BACKEND_MODE_ALLOWED_PATHS = [
  '/login',
  '/key-usage',
  '/setup',
  '/payment/result',
  '/payment/airwallex',
  '/legal'
]
const BACKEND_MODE_CALLBACK_PATHS = [
  '/auth/callback',
  '/auth/linuxdo/callback',
  '/auth/dingtalk/callback',
  '/auth/dingtalk/email-completion',
  '/auth/oidc/callback',
  '/auth/wechat/callback',
  '/auth/wechat/payment/callback'
]
const BACKEND_MODE_PENDING_AUTH_PATHS = ['/register', '/email-verify']
const SIMPLE_MODE_RESTRICTED_PATHS = ['/admin/subscriptions', '/admin/redeem', '/subscriptions', '/redeem']

export function isBackendModePublicRouteAllowed(path: string, hasPendingAuthSession: boolean): boolean {
  // 与 Vue 版一致：白名单按前缀匹配（因此 /legal/xxx 通过）
  if (BACKEND_MODE_ALLOWED_PATHS.some((allowed) => path === allowed || path.startsWith(allowed))) return true
  if (BACKEND_MODE_CALLBACK_PATHS.some((callback) => path === callback)) return true
  if (hasPendingAuthSession && BACKEND_MODE_PENDING_AUTH_PATHS.some((allowed) => path === allowed))
    return true
  return false
}

export function resolveCompletedSetupRedirectPath(isAuthenticated: boolean, isAdmin: boolean): string {
  if (!isAuthenticated) return '/login'
  return isAdmin ? '/admin/dashboard' : '/dashboard'
}

export function loginRedirectTo(fullPath: string): string {
  return `/login?redirect=${encodeURIComponent(fullPath)}`
}

function homeFor(isAdmin: boolean): string {
  return isAdmin ? '/admin/dashboard' : '/dashboard'
}

async function ensurePublicSettings(deps: GateDeps): Promise<void> {
  if (deps.app().publicSettingsLoaded) return
  try {
    await deps.fetchPublicSettings()
  } catch (error) {
    console.warn('Failed to load public settings in route gate', error)
  }
}

/**
 * 对一次导航做决策。`route` 为空表示未知路径（由 404 页处理，门禁放行）。
 */
export async function evaluateRouteGate(
  target: GateTarget,
  deps: GateDeps,
  routeOverride?: RouteDef | null
): Promise<GateResult> {
  const route = routeOverride === undefined ? (matchRoute(target.path)?.route ?? null) : routeOverride
  if (!route) return ALLOW

  // 重定向型路由（/ → /home、/admin → /admin/dashboard …）：先于守卫执行，保留 query 与 hash
  if (route.redirectTo) {
    return redirect(`${route.redirectTo}${target.fullPath.slice(target.path.length)}`)
  }

  const requiresAuth = routeRequiresAuth(route)
  const requiresAdmin = route.requiresAdmin === true

  // 3. /setup：已安装则按登录态和角色重定向；查询失败则放行
  if (target.path === '/setup') {
    try {
      const status = await deps.getSetupStatus()
      if (!status.needs_setup) {
        const a = deps.auth()
        return redirect(resolveCompletedSetupRedirectPath(a.isAuthenticated, a.isAdmin))
      }
    } catch {
      /* 无法确定安装状态时保持安装页可达 */
    }
  }

  // 4. 公开路由
  if (!requiresAuth) {
    const a = deps.auth()
    if (a.isAuthenticated && (target.path === '/login' || target.path === '/register')) {
      // 后端模式下非管理员不被踢出登录页（否则会死循环）
      if (deps.app().backendModeEnabled && !a.isAdmin) return ALLOW
      return redirect(a.isAdmin ? '/admin/dashboard' : '/dashboard')
    }

    if (target.path === '/model-plaza') {
      await ensurePublicSettings(deps)
      const app = deps.app()
      const settings = app.cachedPublicSettings
      const auth = deps.auth()
      // 仅在设置成功加载且明确为 false 时拦截
      if (app.publicSettingsLoaded && settings?.model_plaza_enabled === false) {
        return redirect(auth.isAuthenticated ? homeFor(auth.isAdmin) : '/home')
      }
      if (settings?.model_plaza_require_auth === true && !auth.isAuthenticated) {
        return redirect(loginRedirectTo(target.fullPath))
      }
      if (app.backendModeEnabled && auth.isAuthenticated && !auth.isAdmin) {
        return redirect('/login')
      }
    }

    const app = deps.app()
    const auth = deps.auth()
    if (app.backendModeEnabled && !auth.isAuthenticated) {
      if (!isBackendModePublicRouteAllowed(target.path, auth.hasPendingAuthSession)) {
        return redirect('/login')
      }
    }
    return ALLOW
  }

  // 5. 受保护路由
  const auth = deps.auth()
  if (!auth.isAuthenticated) return redirect(loginRedirectTo(target.fullPath))
  if (requiresAdmin && !auth.isAdmin) return redirect('/dashboard')

  if (requiresAdmin && auth.isAdmin && !deps.compliance.isInitialized()) {
    try {
      await deps.compliance.fetchStatus()
    } catch (error) {
      const err = error as { status?: number; code?: string; metadata?: Record<string, string> }
      if (err.status === 423 && err.code === 'ADMIN_COMPLIANCE_ACK_REQUIRED') {
        deps.compliance.requireAcknowledgement(err.metadata)
      }
    }
  }

  // 6. 功能开关（仅"加载成功且明确为 false"才拦截；加载失败视为未知并放行）
  if (
    (route.requiresPayment || route.requiresRiskControl || route.requiresSubscription) &&
    !deps.app().publicSettingsLoaded
  ) {
    await ensurePublicSettings(deps)
  }
  const app = deps.app()
  const settings = app.cachedPublicSettings
  const isAdmin = deps.auth().isAdmin
  if (route.requiresPayment && app.publicSettingsLoaded && settings?.payment_enabled === false) {
    return redirect(homeFor(isAdmin))
  }
  if (route.requiresRiskControl && app.publicSettingsLoaded && settings?.risk_control_enabled === false) {
    return redirect(isAdmin ? '/admin/settings' : '/dashboard')
  }
  if (route.requiresSubscription && app.publicSettingsLoaded && settings?.subscription_enabled === false) {
    return redirect(homeFor(isAdmin))
  }

  // 7. 简易模式
  const latestAuth = deps.auth()
  if (latestAuth.isSimpleMode) {
    if (SIMPLE_MODE_RESTRICTED_PATHS.some((p) => target.path.startsWith(p))) {
      return redirect(homeFor(latestAuth.isAdmin))
    }
  }

  // 8. 后端模式：管理员全放行，非管理员仅白名单
  if (deps.app().backendModeEnabled) {
    const a = deps.auth()
    if (a.isAuthenticated && a.isAdmin) return ALLOW
    if (!isBackendModePublicRouteAllowed(target.path, a.hasPendingAuthSession)) {
      return redirect('/login')
    }
  }

  return ALLOW
}
