import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { ChevronRight } from 'lucide-react'
import { matchRoute } from '@/core/routes'
import { useBreadcrumbItems } from '@/core/useBreadcrumbItems'

export function Breadcrumbs() {
  const router = useRouter()
  const items = useBreadcrumbItems(router.asPath.split(/[?#]/)[0])
  if (items.length === 0 || !matchRoute(router.asPath.split(/[?#]/)[0])) return null
  return (
    <nav aria-label="breadcrumb" className="min-w-0">
      <ol className="flex items-center gap-1.5 text-sm text-muted-foreground">
        {items.map((item, i) => (
          <li key={`${item.label}-${i}`} className="flex min-w-0 items-center gap-1.5">
            {i > 0 ? <ChevronRight className="size-3.5 shrink-0" aria-hidden /> : null}
            {item.href && i < items.length - 1 ? (
              <Link href={item.href} className="truncate hover:text-foreground">
                {item.label}
              </Link>
            ) : (
              <span
                aria-current={i === items.length - 1 ? 'page' : undefined}
                className="truncate font-medium text-foreground"
              >
                {item.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  )
}
