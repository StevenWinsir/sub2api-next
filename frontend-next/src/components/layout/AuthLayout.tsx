import * as React from 'react'
import { CheckCircle2 } from 'lucide-react'
import { useAppStore } from '@/stores/app'
import { t } from '@/i18n'
import { Brand } from './Brand'
import { LocaleSwitch } from './LocaleSwitch'
import { ThemeToggle } from './ThemeToggle'

/** 认证布局：左右分栏（品牌叙事 + 表单），移动端单栏。 */
export function AuthLayout({ children }: { children: React.ReactNode }) {
  const subtitle = useAppStore((s) => s.cachedPublicSettings?.site_subtitle)
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-[oklch(0.2_0.04_268)] p-10 text-white lg:flex">
        <Brand className="text-white" />
        <div className="max-w-md space-y-6">
          <h2 className="text-3xl font-semibold leading-tight tracking-tight">
            {subtitle || t('ui.login.brandTagline')}
          </h2>
          <ul className="space-y-3 text-sm text-white/80">
            {['ui.login.brandPoint1', 'ui.login.brandPoint2', 'ui.login.brandPoint3'].map((key) => (
              <li key={key} className="flex items-start gap-2.5">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[oklch(0.78_0.12_268)]" aria-hidden />
                {t(key)}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-xs text-white/50">© {new Date().getFullYear()}</p>
      </aside>
      <div className="flex flex-col">
        <div className="flex items-center justify-between p-4 sm:p-6">
          <Brand className="lg:invisible" />
          <div className="flex items-center gap-1">
            <LocaleSwitch />
            <ThemeToggle />
          </div>
        </div>
        <main id="main-content" className="flex flex-1 items-center justify-center px-4 pb-12 sm:px-6">
          <div className="w-full max-w-sm">{children}</div>
        </main>
      </div>
    </div>
  )
}
