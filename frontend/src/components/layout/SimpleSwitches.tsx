import * as React from 'react'
import { Languages, Moon, Sun } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { setTheme } from '@/hooks/useTheme'
import { availableLocales, setLocale, t } from '@/i18n'
import { useLocale } from '@/i18n/react'

/**
 * 公共页 / 认证页 / 安装向导使用的轻量切换按钮（只有两个选项，不需要下拉菜单）。
 * 控制台顶栏仍使用 Radix 下拉版本（LocaleSwitch / ThemeToggle）；这样首屏不必加载菜单 / Popper 相关代码。
 */
export function SimpleThemeToggle() {
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={t('ui.shell.toggleTheme')}
      onClick={() => setTheme(document.documentElement.classList.contains('dark') ? 'light' : 'dark')}
    >
      <Sun className="dark:hidden" aria-hidden />
      <Moon className="hidden dark:block" aria-hidden />
    </Button>
  )
}

export function SimpleLocaleSwitch() {
  const locale = useLocale()
  const target = availableLocales.find((l) => l.code !== locale) ?? availableLocales[0]
  return (
    <Button
      variant="ghost"
      size="sm"
      aria-label={`${t('ui.shell.language')}: ${target.name}`}
      onClick={() => void setLocale(target.code)}
    >
      <Languages aria-hidden />
      <span>{target.name}</span>
    </Button>
  )
}
