import * as React from 'react'
import { Menu } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { useAppStore } from '@/stores/app'
import { t } from '@/i18n'
import { CommandPalette } from './CommandPalette'
import { LocaleSwitch } from './LocaleSwitch'
import { ThemeToggle } from './ThemeToggle'
import { UserMenu } from './UserMenu'
import { Sidebar } from './Sidebar'
import { AnnouncementBell } from './AnnouncementBell'

export function Topbar({ section, breadcrumb }: { section: 'user' | 'admin'; breadcrumb?: React.ReactNode }) {
  const mobileOpen = useAppStore((s) => s.mobileOpen)
  const setMobileOpen = useAppStore((s) => s.setMobileOpen)

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b bg-background/90 px-3 backdrop-blur sm:px-5">
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden"
        onClick={() => setMobileOpen(true)}
        aria-label={t('ui.shell.openMenu')}
      >
        <Menu aria-hidden />
      </Button>
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" aria-describedby={undefined}>
          <SheetTitle className="sr-only">{t('ui.shell.openMenu')}</SheetTitle>
          <SheetDescription className="sr-only">{t('ui.shell.openMenu')}</SheetDescription>
          <Sidebar section={section} forceExpanded onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>
      <div className="min-w-0 flex-1">{breadcrumb}</div>
      <CommandPalette />
      <div className="flex items-center gap-0.5">
        <AnnouncementBell />
        <LocaleSwitch />
        <ThemeToggle />
        <UserMenu />
      </div>
    </header>
  )
}
