import * as React from 'react'
import { useRouter } from 'next/router'
import { Copy, Languages, Moon, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList
} from '@/components/ui/command'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { buildNavigation, type NavItem } from '@/core/navigation'
import { useNavContext } from '@/core/useNavContext'
import { copyText } from '@/hooks/useClipboard'
import { useTheme } from '@/hooks/useTheme'
import { useAppStore } from '@/stores/app'
import { useAuthStore } from '@/stores/auth'
import { getLocale, setLocale, t } from '@/i18n'
import { DynamicIcon } from './icons'

function flatten(items: NavItem[]): NavItem[] {
  return items.flatMap((i) => (i.children ? flatten(i.children) : [i]))
}

/** ⌘K 全局命令面板：搜索页面（来自注册表）+ 快捷动作（复制 API 地址、切换主题和语言）。 */
export function CommandPalette({ trigger = true }: { trigger?: boolean }) {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const isAdmin = useAuthStore((s) => s.isAdmin)
  const nav = useNavContext()
  const { preference, setTheme } = useTheme()

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((v) => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const pages = React.useMemo(() => {
    const sections = [...buildNavigation('user', nav), ...(isAdmin ? buildNavigation('admin', nav) : [])]
    const seen = new Set<string>()
    return sections
      .flatMap((s) => flatten(s.items))
      .filter((i) => (seen.has(i.path) ? false : (seen.add(i.path), true)))
  }, [nav, isAdmin])

  const go = (path: string) => {
    setOpen(false)
    void router.push(path)
  }

  return (
    <>
      {trigger ? (
        <Button
          variant="outline"
          size="sm"
          className="hidden w-56 justify-between text-muted-foreground md:inline-flex"
          onClick={() => setOpen(true)}
          aria-label={t('ui.shell.commandPalette')}
        >
          <span className="inline-flex items-center gap-2">
            <Search aria-hidden />
            {t('ui.shell.search')}
          </span>
          <kbd className="rounded border bg-muted px-1.5 text-[11px] font-medium">⌘K</kbd>
        </Button>
      ) : null}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent hideClose className="top-[20%] max-w-xl translate-y-0 gap-0 overflow-hidden p-0">
          <DialogTitle className="sr-only">{t('ui.shell.commandPalette')}</DialogTitle>
          <DialogDescription className="sr-only">{t('ui.shell.searchPlaceholder')}</DialogDescription>
          <Command>
            <CommandInput placeholder={t('ui.shell.searchPlaceholder')} />
            <CommandList>
              <CommandEmpty>{t('ui.shell.noResults')}</CommandEmpty>
              <CommandGroup heading={t('ui.shell.pages')}>
                {pages.map((item) => {
                  const label = item.label ?? t(item.labelKey ?? '')
                  return (
                    <CommandItem
                      key={item.path}
                      value={`${label} ${item.path}`}
                      onSelect={() => go(item.path)}
                    >
                      <DynamicIcon name={item.icon} aria-hidden />
                      {label}
                    </CommandItem>
                  )
                })}
              </CommandGroup>
              <CommandGroup heading={t('ui.shell.actions')}>
                <CommandItem
                  value="copy api base url"
                  onSelect={async () => {
                    setOpen(false)
                    const base = useAppStore.getState().apiBaseUrl || window.location.origin
                    if (await copyText(base)) useAppStore.getState().showSuccess(t('ui.shell.copied'))
                  }}
                >
                  <Copy aria-hidden />
                  {t('ui.shell.copyApiBase')}
                </CommandItem>
                <CommandItem
                  value="toggle theme"
                  onSelect={() => {
                    setTheme(preference === 'dark' ? 'light' : 'dark')
                    setOpen(false)
                  }}
                >
                  <Moon aria-hidden />
                  {t('ui.shell.toggleTheme')}
                </CommandItem>
                <CommandItem
                  value="switch language"
                  onSelect={() => {
                    void setLocale(getLocale() === 'zh' ? 'en' : 'zh')
                    setOpen(false)
                  }}
                >
                  <Languages aria-hidden />
                  {t('ui.shell.language')}
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        </DialogContent>
      </Dialog>
    </>
  )
}
