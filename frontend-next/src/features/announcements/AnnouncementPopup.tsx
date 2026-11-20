/** 公告弹窗：按队列展示 notify_mode=popup 的未读公告；关闭即标记已读并展示下一条。 */
import * as React from 'react'
import Router from 'next/router'
import { Megaphone } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { t } from '@/i18n'
import { useAnnouncementStore } from '@/stores/announcements'
import { formatDateTime } from '@/utils/format'
import { renderMarkdownSafe } from '@/utils/markdown'

export function AnnouncementPopup() {
  const current = useAnnouncementStore((s) => s.currentPopup)
  const dismiss = useAnnouncementStore((s) => s.dismissPopup)
  const html = React.useMemo(() => renderMarkdownSafe(current?.content ?? ''), [current?.content])
  return (
    <Dialog open={!!current} onOpenChange={(o) => !o && void dismiss()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
            <Megaphone className="size-4 text-primary" aria-hidden />
            <span className="rounded bg-destructive/12 px-1.5 py-0.5 font-medium text-destructive">
              {t('announcements.unread')}
            </span>
            {current ? <time dateTime={current.created_at}>{formatDateTime(current.created_at)}</time> : null}
          </div>
          <DialogTitle>{current?.title}</DialogTitle>
          <DialogDescription className="sr-only">{current?.title}</DialogDescription>
        </DialogHeader>
        {/* 公告内容为管理员配置的 Markdown，经 DOMPurify 清洗后渲染 */}
        <div className="markdown-body text-sm" dangerouslySetInnerHTML={{ __html: html }} />
        <DialogFooter>
          <Button onClick={() => void dismiss()}>{t('common.close')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** 全局公告宿主：路由切换时（节流）拉取公告并挂载弹窗。 */
export function AnnouncementHost() {
  React.useEffect(() => {
    const onRoute = () => void useAnnouncementStore.getState().fetchAnnouncements()
    Router.events.on('routeChangeComplete', onRoute)
    return () => Router.events.off('routeChangeComplete', onRoute)
  }, [])
  return <AnnouncementPopup />
}
