import * as React from 'react'
import { format } from 'date-fns'
import { CalendarDays } from 'lucide-react'
import type { DateRange } from 'react-day-picker'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { t } from '@/i18n'

export interface DateRangePickerProps {
  value?: DateRange
  onChange: (range: DateRange | undefined) => void
  className?: string
}

export function DateRangePicker({ value, onChange, className }: DateRangePickerProps) {
  const label = value?.from
    ? value.to
      ? `${format(value.from, 'yyyy-MM-dd')} – ${format(value.to, 'yyyy-MM-dd')}`
      : format(value.from, 'yyyy-MM-dd')
    : t('ui.common.pickDateRange')

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn('justify-start font-normal', !value?.from && 'text-muted-foreground', className)}
        >
          <CalendarDays aria-hidden />
          <span className="tabular">{label}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-3" align="start">
        <Calendar mode="range" numberOfMonths={2} selected={value} onSelect={onChange} />
      </PopoverContent>
    </Popover>
  )
}
