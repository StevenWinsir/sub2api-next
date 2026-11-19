import * as React from 'react'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'
import { Breadcrumbs } from './Breadcrumbs'
import { QueryProvider } from '@/core/QueryProvider'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useAppStore } from '@/stores/app'
import { cn } from '@/lib/utils'
import { t } from '@/i18n'

export interface ConsoleLayoutProps {
  section: 'user' | 'admin'
  children: React.ReactNode
}

/** 控制台统一外壳：顶栏 + 可折叠侧栏 + 面包屑 + 内容区。在 _app 中持久存在，路由切换时不重新挂载。 */
export function ConsoleLayout({ section, children }: ConsoleLayoutProps) {
  const collapsed = useAppStore((s) => s.sidebarCollapsed)
  return (
    <QueryProvider>
      <TooltipProvider>
        <div className="min-h-dvh bg-background">
          <a
            href="#main-content"
            className="sr-only z-[70] rounded-md bg-primary px-3 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
          >
            {t('ui.shell.skipToContent')}
          </a>
          <aside
            className={cn(
              'fixed inset-y-0 left-0 z-40 hidden border-r border-sidebar-border transition-[width] duration-[var(--duration-base)] lg:block',
              collapsed ? 'w-16' : 'w-60'
            )}
          >
            <Sidebar section={section} />
          </aside>
          <div
            className={cn(
              'flex min-h-dvh flex-col transition-[padding] duration-[var(--duration-base)]',
              collapsed ? 'lg:pl-16' : 'lg:pl-60'
            )}
          >
            <Topbar section={section} breadcrumb={<Breadcrumbs />} />
            <main id="main-content" className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
              <div className={cn('mx-auto w-full', section === 'admin' ? 'max-w-none' : 'max-w-7xl')}>
                {children}
              </div>
            </main>
          </div>
        </div>
      </TooltipProvider>
    </QueryProvider>
  )
}
