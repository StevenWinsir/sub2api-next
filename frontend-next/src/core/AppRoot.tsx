/**
 * AppRoot —— `_app` 的编排核心：Provider、启动序列、深链纠正、门禁、布局选择、标题管理、全局事件桥。
 *
 * 渲染原则（§5.2 / §5.3.4）：
 *  - 首次渲染只输出与构建期一致的启动骨架（品牌占位 + 加载指示），保证水合一致；
 *  - 深链纠正与门禁判定完成之前不渲染目标页面，避免受保护内容闪现；
 *  - 布局按注册表选择并持久存在，路由切换时外壳不重新挂载。
 */
import * as React from 'react'
import type { AppProps } from 'next/app'
import Router, { useRouter } from 'next/router'
import { Toaster } from '@/components/ui/sonner'
import { AuthLayout } from '@/components/layout/AuthLayout'
import { BlankLayout } from '@/components/layout/BlankLayout'
import { ConsoleLayoutLazy as ConsoleLayout } from '@/components/layout/ConsoleLayoutLazy'
import { NavProgress } from '@/components/layout/NavProgress'
import { PublicLayout } from '@/components/layout/PublicLayout'
import { AppErrorBoundary } from '@/components/AppErrorBoundary'
import { NotFoundContent } from '@/components/NotFoundContent'
import { BootErrorContent, BootSkeleton } from '@/components/BootScreens'
import { ensureLocaleScope, scopeForLayout } from '@/i18n'
import { useLocale } from '@/i18n/react'
import { useAppStore } from '@/stores/app'
import { useAuthStore } from '@/stores/auth'
import { useAdminSettingsStore } from '@/stores/adminSettings'
import { resolveSiteBillingMode } from '@/utils/siteBillingMode'
import { updateFavicon } from '@/utils/branding'
import { clearCorrectionRecord, decideBoot, isBootLoop, recordCorrection } from './bootCorrection'
import { installGlobalEventBridge } from './events'
import { evaluateRouteGate } from './gate'
import { defaultGateDeps } from './gateDeps'
import { matchRoute, type LayoutKind } from './routes'
import { checkNeedsSetup } from './setupCheck'
import { runStartup } from './startup'
import { resolvePathDocumentTitle } from './title'
import { useSessionLifecycle } from './useSessionLifecycle'

/** 深链纠正第一跳使用的内部查询标记（门禁在其存在时不运行）。 */
const BOOT_MARK = '__sub2api_boot'

const pathOf = (asPath: string) => asPath.split(/[?#]/)[0] || '/'

function LayoutSwitch({ layout, children }: { layout: LayoutKind | null; children: React.ReactNode }) {
  switch (layout) {
    case 'console-user':
      return <ConsoleLayout section="user">{children}</ConsoleLayout>
    case 'console-admin':
      return <ConsoleLayout section="admin">{children}</ConsoleLayout>
    case 'auth':
      return <AuthLayout>{children}</AuthLayout>
    case 'blank':
      return <BlankLayout>{children}</BlankLayout>
    case 'public':
      return <PublicLayout>{children}</PublicLayout>
    default:
      return <>{children}</>
  }
}

/** 安全读取 sessionStorage（隐私模式下可能抛出）。 */
function safeSession(): Storage | null {
  try {
    return window.sessionStorage
  } catch {
    return null
  }
}

export function AppRoot({ Component, pageProps }: AppProps) {
  const router = useRouter()
  const [started, setStarted] = React.useState(false)
  const [approvedPath, setApprovedPath] = React.useState<string | null>(null)
  const locale = useLocale()

  const isBootPage = router.pathname === '/'
  const asPath = router.asPath

  // 深链纠正决策：纯函数，读取真实地址（仅客户端且启动完成后；首次渲染 / 预渲染不会走到这里）
  // 第一跳进行中（地址已带内部标记，但 router.pathname 还没切换）时不再做新的纠正决策，否则会反复纠正
  const correctionInFlight = started && isBootPage && window.location.search.includes(BOOT_MARK)
  const bootDecision = started && isBootPage && !correctionInFlight ? decideBoot(window.location) : null
  const bootLoop = bootDecision?.type === 'replace' && isBootLoop(safeSession() ?? { getItem: () => null })

  // 1) 启动序列（单例）+ 全局事件桥
  React.useEffect(() => {
    let cancelled = false
    void runStartup().then(() => {
      if (!cancelled) setStarted(true)
    })
    const uninstall = installGlobalEventBridge()
    return () => {
      cancelled = true
      uninstall()
    }
  }, [])

  // 2) 深链纠正：replace 到完整原始 URL（必须保留 search 和 hash）。
  //    - 每个目标 URL 只纠正一次（ref 保证幂等：StrictMode 双执行、router 对象变化都不会重复计数）；
  //    - Next 把"与当前 asPath 完全相同（含 hash）"的 replace 当成纯 hash 变化而不跳转，
  //      而 Boot 页的 asPath 恰好就是浏览器地址，所以分两跳：先带内部标记跳到目标页面（加载页面 chunk），
  //      再 shallow replace 回完整原始 URL。标记存在期间门禁不运行（见下）。
  const correctedTo = React.useRef<string | null>(null)
  const correctionTarget = bootDecision?.type === 'replace' && !bootLoop ? bootDecision.to : null
  React.useEffect(() => {
    if (!correctionTarget || correctedTo.current) return // 每个 Boot 生命周期只纠正一次
    correctedTo.current = correctionTarget
    const storage = safeSession()
    if (storage) recordCorrection(storage)
    const { pathname } = new URL(correctionTarget, window.location.origin)
    void (async () => {
      await Router.replace(`${pathname}?${BOOT_MARK}=1`)
      await Router.replace(correctionTarget, undefined, { shallow: true })
    })()
  }, [correctionTarget])

  // 2b) Boot 页上匹配不到注册表的路径：先确认是否需要安装（需要则进入 /setup），否则就地渲染 404
  const bootNotFound = bootDecision?.type === 'not-found'
  React.useEffect(() => {
    if (!bootNotFound) return
    let cancelled = false
    void checkNeedsSetup().then((needs) => {
      if (needs && !cancelled) void Router.replace('/setup')
    })
    return () => {
      cancelled = true
    }
  }, [bootNotFound])

  // 3) 门禁：初次纠正完成后以及每次路由变化时运行
  React.useEffect(() => {
    if (!started || isBootPage || asPath.includes(BOOT_MARK)) return
    let cancelled = false
    const target = { path: pathOf(asPath), fullPath: asPath }
    void (async () => {
      // 需要安装时，任意路径都进入 /setup（先于其他门禁，避免与 /login 重定向竞态）
      if (target.path !== '/setup' && (await checkNeedsSetup())) {
        if (!cancelled) void Router.replace('/setup')
        return
      }
      const result = await evaluateRouteGate(target, defaultGateDeps)
      if (cancelled) return
      if (result.type === 'redirect') {
        void Router.replace(result.to)
      } else {
        // 控制台路由：先加载 console 语言包再渲染（标题 / 页面文案都依赖它）
        await ensureLocaleScope(scopeForLayout(matchRoute(target.path)?.route.layout))
        if (cancelled) return
        setApprovedPath(asPath)
        // 目标页面已成功落地：清除深链纠正的防循环记录
        const storage = safeSession()
        if (storage) clearCorrectionRecord(storage)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [started, isBootPage, asPath])

  // 4) 挂载后：不需要安装时加载公开设置（与 App.vue 的 onMounted 一致）
  React.useEffect(() => {
    if (!started) return
    let cancelled = false
    void (async () => {
      if (await checkNeedsSetup()) return
      if (!cancelled) await useAppStore.getState().fetchPublicSettings()
    })()
    return () => {
      cancelled = true
    }
  }, [started])

  useSessionLifecycle(started)

  // 5) 标题与 favicon：集中管理，直接写 document.title
  const siteName = useAppStore((s) => s.siteName)
  const siteLogo = useAppStore((s) => s.siteLogo)
  const settings = useAppStore((s) => s.cachedPublicSettings)
  const isAdmin = useAuthStore((s) => s.isAdmin)
  const adminCustomMenu = useAdminSettingsStore((s) => s.customMenuItems)
  const billingMode = resolveSiteBillingMode(settings)
  React.useEffect(() => {
    if (!started) return
    if (siteLogo) updateFavicon(siteLogo)
  }, [started, siteLogo])
  React.useEffect(() => {
    if (!started || isBootPage) return
    const customItems = [...(settings?.custom_menu_items ?? []), ...(isAdmin ? adminCustomMenu : [])]
    document.title = resolvePathDocumentTitle(pathOf(asPath), siteName, customItems, { billingMode })
  }, [
    started,
    isBootPage,
    asPath,
    siteName,
    settings?.custom_menu_items,
    isAdmin,
    adminCustomMenu,
    billingMode,
    locale,
    approvedPath
  ])

  // ───────── 渲染 ─────────
  let body: React.ReactNode
  if (!started) {
    body = <BootSkeleton />
  } else if (isBootPage) {
    if (bootLoop) {
      body = <BootErrorContent />
    } else if (bootDecision?.type === 'not-found') {
      // 匹配不到注册表：不跳转，直接在当前壳内渲染 404（避免硬刷新死循环）
      body = (
        <PublicLayout>
          <NotFoundContent />
        </PublicLayout>
      )
    } else {
      body = <BootSkeleton />
    }
  } else {
    const match = matchRoute(pathOf(asPath))
    const layout = match ? match.route.layout : 'public'
    const approved = approvedPath === asPath
    body = (
      <LayoutSwitch layout={layout}>
        {approved && !asPath.includes(BOOT_MARK) ? (
          // display: contents：不产生盒子，仅给 E2E / 调试提供路由名标记
          <div className="contents" data-route-name={match?.route.name}>
            <Component {...pageProps} />
          </div>
        ) : (
          <BootSkeleton inline />
        )}
      </LayoutSwitch>
    )
  }

  return (
    <>
      <NavProgress />
      <AppErrorBoundary resetKey={asPath}>{body}</AppErrorBoundary>
      <Toaster />
    </>
  )
}
