import * as React from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { t } from '@/i18n'

/**
 * 启动骨架：品牌占位 + 加载指示。
 * 注意：首次渲染（含构建期预渲染）不得读取任何 store / 语言，文案固定为空，保证水合一致。
 */
export function BootSkeleton({ inline = false }: { inline?: boolean }) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="loading"
      className={
        inline
          ? 'flex min-h-[40vh] items-center justify-center'
          : 'flex min-h-dvh items-center justify-center bg-background'
      }
    >
      <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden />
    </div>
  )
}

/** 防循环保护触发后的错误页（含"清除缓存并重试"）。 */
export function BootErrorContent() {
  const [busy, setBusy] = React.useState(false)
  const retry = async () => {
    setBusy(true)
    try {
      window.sessionStorage.clear()
      if ('caches' in window) {
        const keys = await caches.keys()
        await Promise.all(keys.map((k) => caches.delete(k)))
      }
      const regs = (await navigator.serviceWorker?.getRegistrations?.()) ?? []
      await Promise.all(regs.map((r) => r.unregister()))
    } catch {
      /* 尽力而为 */
    }
    window.location.replace('/home')
  }
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background p-6">
      <div className="max-w-md space-y-4 text-center">
        <h1 className="text-xl font-semibold">{t('ui.boot.errorTitle')}</h1>
        <p className="text-sm text-muted-foreground">{t('ui.boot.errorDescription')}</p>
        <Button onClick={() => void retry()} loading={busy}>
          {t('ui.boot.clearCacheRetry')}
        </Button>
      </div>
    </div>
  )
}
