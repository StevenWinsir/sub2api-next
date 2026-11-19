import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { ChevronRight, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { buildNavigation, GROUP_LABEL_KEYS, type NavItem } from '@/core/navigation'
import { useNavContext } from '@/core/useNavContext'
import { useAppStore } from '@/stores/app'
import { sanitizeSvg } from '@/utils/sanitize'
import { cn } from '@/lib/utils'
import { t } from '@/i18n'
import { Brand } from './Brand'
import { DynamicIcon } from './icons'

function isActive(asPath: string, path: string, exact = false): boolean {
  const current = asPath.split(/[?#]/)[0]
  return current === path || (!exact && current.startsWith(`${path}/`))
}

function ItemIcon({ item }: { item: NavItem }) {
  if (item.iconSvg) {
    // 自定义菜单 SVG 必须先经净化
    const clean = sanitizeSvg(item.iconSvg)
    if (clean)
      return (
        <span
          aria-hidden
          className="size-4 shrink-0 [&_svg]:size-4"
          dangerouslySetInnerHTML={{ __html: clean }}
        />
      )
  }
  return <DynamicIcon name={item.icon} className="size-4 shrink-0" aria-hidden />
}

function NavLink({
  item,
  collapsed,
  asPath,
  onNavigate,
  nested
}: {
  item: NavItem
  collapsed: boolean
  asPath: string
  onNavigate?: () => void
  nested?: boolean
}) {
  const label = item.label ?? t(item.labelKey ?? '')
  const active = isActive(asPath, item.path, nested)
  const link = (
    <Link
      href={item.path}
      prefetch
      aria-current={active ? 'page' : undefined}
      onClick={onNavigate}
      className={cn(
        'flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] font-medium transition-colors',
        active
          ? 'bg-accent text-accent-foreground'
          : 'text-sidebar-foreground/80 hover:bg-muted hover:text-foreground',
        collapsed && 'justify-center px-0',
        nested && 'font-normal'
      )}
    >
      <ItemIcon item={item} />
      {collapsed ? <span className="sr-only">{label}</span> : <span className="truncate">{label}</span>}
    </Link>
  )
  if (!collapsed) return link
  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  )
}

function ParentItem({
  item,
  collapsed,
  asPath,
  onNavigate
}: {
  item: NavItem
  collapsed: boolean
  asPath: string
  onNavigate?: () => void
}) {
  const childActive = item.children!.some((c) => isActive(asPath, c.path, true))
  // 用户手动展开 / 收起优先；未操作时跟随子项激活态
  const [userOpen, setUserOpen] = React.useState<boolean | null>(null)
  const open = userOpen ?? childActive
  const label = t(item.labelKey ?? '')

  if (collapsed) {
    // 折叠态：直接显示第一个子项入口
    return (
      <NavLink
        item={{ ...item.children![0], icon: item.icon, labelKey: item.labelKey }}
        collapsed
        asPath={asPath}
        onNavigate={onNavigate}
      />
    )
  }
  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setUserOpen(!open)}
        className={cn(
          'flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] font-medium transition-colors hover:bg-muted',
          childActive ? 'text-foreground' : 'text-sidebar-foreground/80'
        )}
      >
        <ItemIcon item={item} />
        <span className="flex-1 truncate text-left">{label}</span>
        <ChevronRight className={cn('size-3.5 transition-transform', open && 'rotate-90')} aria-hidden />
      </button>
      {open ? (
        <div className="ml-4 mt-0.5 space-y-0.5 border-l pl-2">
          {item.children!.map((child) => (
            <NavLink
              key={child.path}
              item={child}
              collapsed={false}
              asPath={asPath}
              onNavigate={onNavigate}
              nested
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}

export interface SidebarProps {
  section: 'user' | 'admin'
  /** 移动端抽屉内使用：始终展开。 */
  forceExpanded?: boolean
  onNavigate?: () => void
}

export function Sidebar({ section, forceExpanded, onNavigate }: SidebarProps) {
  const router = useRouter()
  const nav = useNavContext()
  const sidebarCollapsed = useAppStore((s) => s.sidebarCollapsed)
  const toggleSidebar = useAppStore((s) => s.toggleSidebar)
  const setScrollTop = useAppStore((s) => s.setSidebarScrollTop)
  const collapsed = sidebarCollapsed && !forceExpanded
  const scrollRef = React.useRef<HTMLDivElement>(null)
  const sections = React.useMemo(() => buildNavigation(section, nav), [section, nav])

  // 路由切换时外壳不重新挂载，并恢复侧栏滚动位置（对应原 sidebarScrollTop）
  React.useLayoutEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = useAppStore.getState().sidebarScrollTop
  }, [])

  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div
        className={cn(
          'flex h-14 shrink-0 items-center border-b border-sidebar-border px-3',
          collapsed && 'justify-center px-0'
        )}
      >
        <Brand href={section === 'admin' ? '/admin/dashboard' : '/dashboard'} collapsed={collapsed} />
      </div>
      <div
        ref={scrollRef}
        onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
        className="scroll-thin flex-1 space-y-5 overflow-y-auto px-2 py-4"
      >
        {sections.map((s) => (
          <div key={s.group} className="space-y-1">
            {!collapsed ? (
              <p className="px-2.5 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {s.group === 'custom' ? t('ui.navGroup.custom') : t(GROUP_LABEL_KEYS[s.group])}
              </p>
            ) : null}
            {s.items.map((item) =>
              item.children ? (
                <ParentItem
                  key={item.path}
                  item={item}
                  collapsed={collapsed}
                  asPath={router.asPath}
                  onNavigate={onNavigate}
                />
              ) : (
                <NavLink
                  key={item.path}
                  item={item}
                  collapsed={collapsed}
                  asPath={router.asPath}
                  onNavigate={onNavigate}
                />
              )
            )}
          </div>
        ))}
      </div>
      {!forceExpanded ? (
        <div className="hidden shrink-0 border-t border-sidebar-border p-2 lg:block">
          <Button
            variant="ghost"
            size={collapsed ? 'icon' : 'sm'}
            className={cn(!collapsed && 'w-full justify-start')}
            onClick={toggleSidebar}
            aria-label={collapsed ? t('ui.shell.expandSidebar') : t('ui.shell.collapseSidebar')}
          >
            {collapsed ? <PanelLeftOpen aria-hidden /> : <PanelLeftClose aria-hidden />}
            {collapsed ? null : <span>{t('ui.shell.collapseSidebar')}</span>}
          </Button>
        </div>
      ) : null}
    </div>
  )
}
