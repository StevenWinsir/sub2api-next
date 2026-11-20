import * as React from 'react'
import { Check, Copy, Globe, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useClipboard } from '@/hooks/useClipboard'
import { t } from '@/i18n'
import type { CustomEndpoint } from '@/types'

function EndpointRow({
  name,
  endpoint,
  description
}: {
  name: string
  endpoint: string
  description: string
}) {
  const { copied, copy } = useClipboard(1800)
  return (
    <li className="flex items-center gap-2 rounded-md border p-2">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{name}</p>
        <button
          type="button"
          onClick={() => void copy(endpoint, { toast: false })}
          title={copied ? t('keys.endpoints.copiedHint') : t('keys.endpoints.clickToCopy')}
          className="block max-w-full truncate font-mono text-xs text-muted-foreground hover:text-foreground"
        >
          {endpoint}
        </button>
        {description ? <p className="mt-0.5 text-xs text-muted-foreground">{description}</p> : null}
      </div>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        aria-label={t('keys.endpoints.clickToCopy')}
        onClick={() => void copy(endpoint, { toast: false })}
      >
        {copied ? <Check className="text-success" aria-hidden /> : <Copy aria-hidden />}
      </Button>
      <Button asChild size="icon" variant="ghost" aria-label={t('keys.endpoints.speedTest')}>
        <a
          href={`https://www.tcptest.cn/http/${encodeURIComponent(endpoint)}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          <Zap aria-hidden />
        </a>
      </Button>
    </li>
  )
}

/** API 接入点列表（默认地址 + 管理员配置的自定义端点），可复制与测速。 */
export function EndpointPopover({
  apiBaseUrl,
  customEndpoints
}: {
  apiBaseUrl: string
  customEndpoints: CustomEndpoint[]
}) {
  const items = [
    ...(apiBaseUrl ? [{ name: t('keys.endpoints.title'), endpoint: apiBaseUrl, description: '' }] : []),
    ...customEndpoints
  ]
  if (items.length === 0) return null
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline">
          <Globe aria-hidden />
          {t('keys.endpoints.title')}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(420px,92vw)] space-y-2">
        <ul className="space-y-2">
          {items.map((it) => (
            <EndpointRow key={it.endpoint} {...it} />
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  )
}
