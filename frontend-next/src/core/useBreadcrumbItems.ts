import { GROUP_LABEL_KEYS } from './navigation'
import { matchRoute } from './routes'
import { resolveRouteMetaKeys } from './title'
import { useAppStore } from '@/stores/app'
import { resolveSiteBillingMode } from '@/utils/siteBillingMode'
import { useLocale } from '@/i18n/react'
import { t } from '@/i18n'

export interface Crumb {
  label: string
  href?: string
}

/** 面包屑：区块（用户控制台 / 管理后台）→ 分组 → 页面标题，数据全部来自注册表。 */
export function useBreadcrumbItems(pathname: string): Crumb[] {
  useLocale() // 语言切换时重新计算
  const settings = useAppStore((s) => s.cachedPublicSettings)
  const match = matchRoute(pathname)
  if (!match) return []
  const { route, params } = match
  const keys = resolveRouteMetaKeys(route, { billingMode: resolveSiteBillingMode(settings) })
  const pageLabel = keys.titleKey ? t(keys.titleKey) : (route.title ?? '')
  const custom =
    route.name === 'CustomPage' && params.id
      ? settings?.custom_menu_items?.find((i) => i.id === params.id)?.label
      : undefined
  const isAdmin = route.layout === 'console-admin'
  const crumbs: Crumb[] = [
    {
      label: isAdmin ? t('ui.shell.adminConsole') : t('ui.shell.userConsole'),
      href: isAdmin ? '/admin/dashboard' : '/dashboard'
    }
  ]
  if (route.nav) crumbs.push({ label: t(GROUP_LABEL_KEYS[route.nav.group]) })
  crumbs.push({ label: custom || pageLabel })
  return crumbs
}
