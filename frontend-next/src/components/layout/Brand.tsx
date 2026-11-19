import * as React from 'react'
import Link from 'next/link'
import { useAppStore } from '@/stores/app'
import { sanitizeUrl } from '@/utils/url'
import { cn } from '@/lib/utils'

/** 品牌标识：站点名与 Logo 来自公开设置；Logo 缺失时显示站点名首字母徽标（§5.8）。 */
export function Brand({
  href = '/home',
  collapsed,
  className
}: {
  href?: string
  collapsed?: boolean
  className?: string
}) {
  const siteName = useAppStore((s) => s.siteName)
  const siteLogo = useAppStore((s) => s.siteLogo)
  const logo = sanitizeUrl(siteLogo || '', { allowRelative: true, allowDataUrl: true })
  const [brokenLogo, setBrokenLogo] = React.useState<string | null>(null)
  const broken = brokenLogo === logo

  return (
    <Link
      href={href}
      className={cn('flex min-w-0 items-center gap-2.5 font-semibold tracking-tight', className)}
    >
      {logo && !broken ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logo}
          alt=""
          className="size-7 shrink-0 rounded-md object-contain"
          onError={() => setBrokenLogo(logo)}
        />
      ) : (
        <span
          aria-hidden
          className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary text-sm font-bold text-primary-foreground"
        >
          {(siteName || 'S').trim().charAt(0).toUpperCase()}
        </span>
      )}
      {collapsed ? <span className="sr-only">{siteName}</span> : <span className="truncate">{siteName}</span>}
    </Link>
  )
}
