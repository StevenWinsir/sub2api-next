import * as React from 'react'
import { Bell, CheckCheck } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { t } from '@/i18n'
import { cn } from '@/lib/utils'
import { useAnnouncementStore } from '@/stores/announcements'
import { useAppStore } from '@/stores/app'
import type { UserAnnouncement } from '@/types'
import { formatDateTime } from '@/utils/format'
import { renderMarkdownSafe } from '@/utils/markdown'

function AnnouncementItem({ item }: { item: UserAnnouncement }) {
  const [open, setOpen] = React.useState(false)
  const html = React.useMemo(() => (open ? renderMarkdownSafe(item.content) : ''), [open, item.content])
  const unread = !item.read_at
  return (
    <li className="px-4 py-3">
      <button
        type="button"
        className="flex w-full items-start gap-2 text-left"
        aria-expanded={open}
        onClick={() => {
          setOpen((o) => !o)
          if (unread) void useAnnouncementStore.getState().markAsRead(item.id)
        }}
      >
        <span
          className={cn('mt-1.5 size-2 shrink-0 rounded-full', unread ? 'bg-destructive' : 'bg-transparent')}
          aria-hidden
        />
        <span className="min-w-0 flex-1">
          <span
            className={cn(
              'block truncate text-sm',
              unread ? 'font-semibold' : 'font-medium text-muted-foreground'
            )}
          >
            {item.title}
          </span>
          <time className="text-xs text-muted-foreground" dateTime={item.created_at}>
            {formatDateTime(item.created_at)}
          </time>
        </span>
        <Badge variant={unread ? 'destructive' : 'secondary'}>
          {unread ? t('announcements.unread') : t('announcements.read')}
        </Badge>
      </button>
      {open ? (
        // 公告内容为管理员配置的 Markdown，经 DOMPurify 清洗后渲染
        <div
          className="markdown-body mt-2 rounded-md bg-muted/40 p-3 text-sm"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ) : null}
    </li>
  )
}

/** 公告铃：未读数徽标 + 列表（展开内容即标记已读）+ 全部已读。 */
export function AnnouncementBell() {
  const items = useAnnouncementStore((s) => s.announcements)
  const unread = useAnnouncementStore((s) => s.unreadCount)
  const loading = useAnnouncementStore((s) => s.loading)
  const markAll = useAnnouncementStore((s) => s.markAllAsRead)
  const [open, setOpen] = React.useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={t('ui.shell.notifications')}>
          <Bell aria-hidden />
          {unread > 0 ? (
            <span className="absolute right-1.5 top-1.5 flex size-4 items-center justify-center rounded-full bg-destructive text-[10px] font-semibold text-destructive-foreground">
              {unread > 9 ? '9+' : unread}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(26rem,94vw)] p-0">
        <div className="flex items-center justify-between border-b px-4 py-2.5">
          <h2 className="text-sm font-semibold">{t('announcements.title')}</h2>
          {unread > 0 ? (
            <Button
              size="sm"
              variant="ghost"
              disabled={loading}
              onClick={() => {
                markAll().catch(() => useAppStore.getState().showError(t('common.error')))
              }}
            >
              <CheckCheck aria-hidden />
              {t('announcements.markAllRead')}
            </Button>
          ) : null}
        </div>
        {items.length === 0 ? (
          <div className="px-4 py-10 text-center">
            <p className="text-sm font-medium">{t('announcements.empty')}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t('announcements.emptyDescription')}</p>
          </div>
        ) : (
          <ul className="max-h-[60vh] divide-y overflow-y-auto">
            {items.map((a) => (
              <AnnouncementItem key={a.id} item={a} />
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  )
}
