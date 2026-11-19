/**
 * 侧边栏菜单构建（纯函数）。数据来自路由注册表，显隐逻辑复刻 AppSidebar.vue：
 *  功能开关（FeatureFlags，opt-in / opt-out）、简易模式、角色、自定义菜单项。
 */
import type { CustomMenuItem, PublicSettings } from '@/types'
import { FeatureFlags, resolveFeatureFlag } from '@/utils/featureFlags'
import { resolveSiteBillingMode } from '@/utils/siteBillingMode'
import { ROUTES, type NavGroup, type RouteDef } from './routes'

export interface NavContext {
  isAdmin: boolean
  isSimpleMode: boolean
  settings: Partial<PublicSettings> | null
  /** 管理端独有开关（不在公开设置里）。 */
  opsMonitoringEnabled: boolean
  adminPaymentEnabled: boolean
  /** 公开设置里的自定义菜单（用户可见）。 */
  customMenuItems: CustomMenuItem[]
  /** 管理员专属自定义菜单。 */
  adminCustomMenuItems: CustomMenuItem[]
}

export interface NavItem {
  path: string
  labelKey?: string
  label?: string
  icon: string
  /** 自定义菜单项的 SVG（经净化后渲染）。 */
  iconSvg?: string
  group: NavGroup
  external?: boolean
  children?: NavItem[]
}

export interface NavSection {
  group: NavGroup | 'custom'
  items: NavItem[]
}

function flagEnabled(def: RouteDef, ctx: NavContext): boolean {
  const flag = def.nav?.featureFlag
  if (!flag) return true
  if (flag === 'opsMonitoring') return ctx.opsMonitoringEnabled
  if (flag === 'adminPayment') return ctx.adminPaymentEnabled
  return resolveFeatureFlag(ctx.settings, FeatureFlags[flag])
}

/** 管理后台折叠分组的父级（不是真实路由）。 */
const ADMIN_PARENTS: Record<string, { icon: string; labelKey: string; group: NavGroup }> = {
  '/admin/channels': { icon: 'Network', labelKey: 'nav.channelManagement', group: 'channels' },
  '/admin/security-audit': { icon: 'ShieldCheck', labelKey: 'nav.securityAudit', group: 'security' },
  '/admin/affiliates': { icon: 'Users', labelKey: 'nav.affiliateManagement', group: 'commerce' },
  '/admin/orders': { icon: 'Receipt', labelKey: 'nav.orderManagement', group: 'commerce' }
}

export const GROUP_ORDER: Record<'user' | 'admin', NavGroup[]> = {
  user: ['overview', 'api', 'resources', 'billing', 'growth', 'account'],
  admin: ['overview', 'users', 'channels', 'commerce', 'content', 'security', 'system']
}

export const GROUP_LABEL_KEYS: Record<NavGroup, string> = {
  overview: 'ui.navGroup.overview',
  api: 'ui.navGroup.api',
  resources: 'ui.navGroup.resources',
  billing: 'ui.navGroup.billing',
  growth: 'ui.navGroup.growth',
  account: 'ui.navGroup.account',
  users: 'ui.navGroup.users',
  channels: 'ui.navGroup.channels',
  commerce: 'ui.navGroup.commerce',
  content: 'ui.navGroup.content',
  security: 'ui.navGroup.security',
  system: 'ui.navGroup.system'
}

export function purchaseLabelKey(settings: Partial<PublicSettings> | null): string {
  switch (resolveSiteBillingMode(settings as PublicSettings | null)) {
    case 'recharge_only':
      return 'nav.recharge'
    case 'subscription_only':
      return 'nav.subscribe'
    default:
      return 'nav.buySubscription'
  }
}

export function buildNavigation(section: 'user' | 'admin', ctx: NavContext): NavSection[] {
  const defs = ROUTES.filter((r) => r.nav?.section === section)
    .filter((r) => flagEnabled(r, ctx))
    .filter((r) => !(ctx.isSimpleMode && r.nav?.hideInSimpleMode))
    .sort((a, b) => a.nav!.order - b.nav!.order)

  const sections = new Map<NavGroup, NavItem[]>()
  const parents = new Map<string, NavItem>()

  for (const def of defs) {
    const nav = def.nav!
    const item: NavItem = {
      path: def.path,
      labelKey: def.name === 'PurchaseSubscription' ? purchaseLabelKey(ctx.settings) : nav.labelKey,
      icon: nav.icon,
      group: nav.group
    }
    if (nav.parent && ADMIN_PARENTS[nav.parent]) {
      let parent = parents.get(nav.parent)
      if (!parent) {
        const meta = ADMIN_PARENTS[nav.parent]
        parent = {
          path: nav.parent,
          labelKey: meta.labelKey,
          icon: meta.icon,
          group: meta.group,
          children: []
        }
        parents.set(nav.parent, parent)
        const list = sections.get(meta.group) ?? []
        list.push(parent)
        sections.set(meta.group, list)
      }
      parent.children!.push(item)
      continue
    }
    const list = sections.get(nav.group) ?? []
    list.push(item)
    sections.set(nav.group, list)
  }

  // 简易模式（管理员）：保留 API 密钥与 MCP 入口，与 Vue 版一致
  if (section === 'admin' && ctx.isSimpleMode) {
    const list = sections.get('system') ?? []
    list.unshift({ path: '/keys', labelKey: 'nav.apiKeys', icon: 'KeyRound', group: 'system' })
    if (resolveFeatureFlag(ctx.settings, FeatureFlags.mcp)) {
      list.unshift({ path: '/settings/mcp', labelKey: 'mcp.title', icon: 'Plug', group: 'system' })
    }
    sections.set('system', list)
  }

  const result: NavSection[] = GROUP_ORDER[section]
    .filter((g) => (sections.get(g)?.length ?? 0) > 0)
    .map((g) => ({ group: g, items: sections.get(g)! }))

  const customs = [
    ...ctx.customMenuItems.filter((i) => i.visibility === (section === 'admin' ? 'admin' : 'user')),
    ...(section === 'admin' ? ctx.adminCustomMenuItems.filter((i) => i.visibility === 'admin') : [])
  ].sort((a, b) => a.sort_order - b.sort_order)

  // 管理员也能看到面向用户的自定义菜单（与 Vue 版"我的账户"区一致）
  const adminSeesUserCustom =
    section === 'admin' && ctx.isAdmin ? ctx.customMenuItems.filter((i) => i.visibility === 'user') : []
  const merged = [...adminSeesUserCustom, ...customs].filter(
    (item, index, arr) => arr.findIndex((o) => o.id === item.id) === index
  )

  if (merged.length > 0) {
    result.push({
      group: 'custom',
      items: merged.map((item) => ({
        path: `/custom/${item.id}`,
        label: item.label,
        icon: 'AppWindow',
        iconSvg: item.icon_svg,
        group: 'overview' as NavGroup
      }))
    })
  }
  return result
}
