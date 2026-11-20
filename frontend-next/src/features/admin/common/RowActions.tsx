import * as React from 'react'
import { MoreHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { t } from '@/i18n'

export interface RowAction {
  key: string
  label: string
  onSelect: () => void
  icon?: React.ReactNode
  destructive?: boolean
  hidden?: boolean
  disabled?: boolean
  /** 在此项之前插入分隔线。 */
  separator?: boolean
}

/** 行内操作菜单（"…"）：键盘可达，图标按钮带 aria-label。 */
export function RowActions({ actions, label }: { actions: RowAction[]; label?: string }) {
  const visible = actions.filter((a) => !a.hidden)
  if (visible.length === 0) return null
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="size-8" aria-label={label ?? t('common.actions')}>
          <MoreHorizontal aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-40">
        {visible.map((a) => (
          <React.Fragment key={a.key}>
            {a.separator ? <DropdownMenuSeparator /> : null}
            <DropdownMenuItem
              disabled={a.disabled}
              onSelect={a.onSelect}
              className={cn(a.destructive && 'text-destructive focus:text-destructive')}
            >
              {a.icon}
              {a.label}
            </DropdownMenuItem>
          </React.Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
