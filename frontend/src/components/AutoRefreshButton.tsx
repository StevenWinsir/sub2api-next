import { Check, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { t } from '@/i18n'

/** 自动刷新开关 + 间隔选择（含倒计时）。 */
export function AutoRefreshButton({
  enabled,
  intervals,
  intervalSeconds,
  countdown,
  onEnabledChange,
  onIntervalChange
}: {
  enabled: boolean
  intervals: readonly number[]
  intervalSeconds: number
  countdown: number
  onEnabledChange: (v: boolean) => void
  onIntervalChange: (v: number) => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" title={t('common.autoRefresh.title')}>
          <RefreshCw className={enabled ? 'text-success' : ''} aria-hidden />
          <span className="tabular hidden sm:inline">
            {enabled && countdown > 0
              ? t('common.autoRefresh.countdown', { seconds: countdown })
              : t('common.autoRefresh.title')}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          onSelect={(e) => {
            e.preventDefault()
            onEnabledChange(!enabled)
          }}
          className="justify-between"
        >
          {t('common.autoRefresh.enable')}
          {enabled ? <Check className="size-4 text-primary" aria-hidden /> : null}
        </DropdownMenuItem>
        {intervals.map((sec) => (
          <DropdownMenuItem
            key={sec}
            onSelect={(e) => {
              e.preventDefault()
              onIntervalChange(sec)
            }}
            className="justify-between"
          >
            {t('common.autoRefresh.seconds', { n: sec })}
            {intervalSeconds === sec ? <Check className="size-4 text-primary" aria-hidden /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
