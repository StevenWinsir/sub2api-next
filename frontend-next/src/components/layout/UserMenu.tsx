import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { LayoutDashboard, LogOut, Shield, UserRound } from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { useAuthStore } from '@/stores/auth'
import { resetSessionStores } from '@/core/session'
import { t } from '@/i18n'

export function UserMenu() {
  const router = useRouter()
  const user = useAuthStore((s) => s.user)
  const isAdmin = useAuthStore((s) => s.isAdmin)
  const logout = useAuthStore((s) => s.logout)
  const name = user?.username || user?.email || ''
  const onAdmin = router.asPath.startsWith('/admin')

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-9 gap-2 px-1.5" aria-label={t('ui.shell.userMenu')}>
          <Avatar className="size-7">
            <AvatarFallback>{(name || '?').charAt(0).toUpperCase()}</AvatarFallback>
          </Avatar>
          <span className="hidden max-w-32 truncate text-sm font-medium md:inline">{name}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="truncate">{user?.email}</DropdownMenuLabel>
        {isAdmin ? (
          onAdmin ? (
            <DropdownMenuItem asChild>
              <Link href="/dashboard">
                <LayoutDashboard aria-hidden />
                {t('ui.shell.userConsole')}
              </Link>
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem asChild>
              <Link href="/admin/dashboard">
                <Shield aria-hidden />
                {t('ui.shell.adminConsole')}
              </Link>
            </DropdownMenuItem>
          )
        ) : null}
        <DropdownMenuItem asChild>
          <Link href="/profile">
            <UserRound aria-hidden />
            {t('nav.profile')}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          destructive
          onSelect={async () => {
            await logout()
            resetSessionStores()
            await router.replace('/login')
          }}
        >
          <LogOut aria-hidden />
          {t('ui.shell.signOut')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
