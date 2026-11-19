import * as React from 'react'
import { Bell } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAnnouncementStore } from '@/stores/announcements'
import { t } from '@/i18n'

/** 公告铃（R1 骨架：仅显示未读数；弹窗与列表在 R3 实现）。 */
export function AnnouncementBell() {
  const unread = useAnnouncementStore((s) => s.unreadCount)
  return (
    <Button variant="ghost" size="icon" className="relative" aria-label={t('ui.shell.notifications')}>
      <Bell aria-hidden />
      {unread > 0 ? (
        <span className="absolute right-1.5 top-1.5 flex size-4 items-center justify-center rounded-full bg-destructive text-[10px] font-semibold text-destructive-foreground">
          {unread > 9 ? '9+' : unread}
        </span>
      ) : null}
    </Button>
  )
}
