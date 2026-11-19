/**
 * 统一生成页面标题（对应 Vue 版 router/title.ts）。
 * 优先使用 titleKey 经 i18n 翻译，fallback 到静态 title。直接写 document.title，
 * 不使用 next/head，避免与后端注入的标题互相覆盖。
 */
import { t } from '@/i18n'
import type { CustomMenuItem } from '@/types'
import type { SiteBillingMode } from '@/utils/siteBillingMode'
import { getRouteByName, matchRoute, type RouteDef } from './routes'

export function resolveDocumentTitle(routeTitle: unknown, siteName?: string, titleKey?: string): string {
  const normalizedSiteName = typeof siteName === 'string' && siteName.trim() ? siteName.trim() : 'Sub2API'

  if (typeof titleKey === 'string' && titleKey.trim()) {
    const translated = t(titleKey)
    if (translated && translated !== titleKey) {
      return `${translated} - ${normalizedSiteName}`
    }
  }
  if (typeof routeTitle === 'string' && routeTitle.trim()) {
    return `${routeTitle.trim()} - ${normalizedSiteName}`
  }
  return normalizedSiteName
}

export interface RouteTitleOptions {
  /** 站点计费模式：/purchase 的标题与描述随之切换。 */
  billingMode?: SiteBillingMode
}

export interface RouteMetaKeys {
  titleKey?: string
  descriptionKey?: string
}

export const PURCHASE_ROUTE_NAME = 'PurchaseSubscription'

export function resolveRouteMetaKeys(
  route: Pick<RouteDef, 'name' | 'titleKey' | 'descriptionKey'>,
  options: RouteTitleOptions = {}
): RouteMetaKeys {
  if (route.name === PURCHASE_ROUTE_NAME) {
    if (options.billingMode === 'recharge_only') {
      return { titleKey: 'nav.recharge', descriptionKey: 'purchase.rechargeDescription' }
    }
    if (options.billingMode === 'subscription_only') {
      return { titleKey: 'nav.subscribe', descriptionKey: 'purchase.subscriptionDescription' }
    }
  }
  return { titleKey: route.titleKey, descriptionKey: route.descriptionKey }
}

export function resolvePathDocumentTitle(
  pathname: string,
  siteName: string | undefined,
  customMenuItems: CustomMenuItem[] = [],
  options: RouteTitleOptions = {}
): string {
  const match = matchRoute(pathname)
  if (!match) return resolveDocumentTitle('Not Found', siteName)
  const { route, params } = match
  const id = typeof params.id === 'string' ? params.id : ''
  const menuItem =
    route.name === 'CustomPage' && id ? customMenuItems.find((item) => item.id === id) : undefined
  const menuTitle = menuItem?.label.trim()
  const { titleKey } = resolveRouteMetaKeys(route, options)
  return resolveDocumentTitle(menuTitle || route.title, siteName, menuTitle ? undefined : titleKey)
}

export { getRouteByName }
