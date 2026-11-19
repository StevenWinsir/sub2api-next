import * as React from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from './button'
import { cn } from '@/lib/utils'
import { t } from '@/i18n'

export interface PaginationProps {
  page: number
  pageCount: number
  onPageChange: (page: number) => void
  className?: string
}

export function Pagination({ page, pageCount, onPageChange, className }: PaginationProps) {
  return (
    <nav aria-label="pagination" className={cn('flex items-center gap-2', className)}>
      <Button
        variant="outline"
        size="icon"
        className="size-8"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
        aria-label={t('ui.table.previous')}
      >
        <ChevronLeft aria-hidden />
      </Button>
      <span className="tabular text-sm text-muted-foreground">
        {t('ui.table.pageOf', { page, total: Math.max(pageCount, 1) })}
      </span>
      <Button
        variant="outline"
        size="icon"
        className="size-8"
        disabled={page >= pageCount}
        onClick={() => onPageChange(page + 1)}
        aria-label={t('ui.table.next')}
      >
        <ChevronRight aria-hidden />
      </Button>
    </nav>
  )
}
