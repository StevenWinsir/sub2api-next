import * as React from 'react'
import { DayPicker } from 'react-day-picker'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

export type CalendarProps = React.ComponentProps<typeof DayPicker>

/** react-day-picker v9 封装：令牌化配色，选中态与范围态使用品牌色。 */
export function Calendar({ className, classNames, showOutsideDays = true, ...props }: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn('p-1', className)}
      classNames={{
        months: 'relative flex flex-col gap-4 sm:flex-row',
        month: 'space-y-3',
        month_caption: 'flex h-8 items-center justify-center text-sm font-medium',
        nav: 'absolute inset-x-0 top-0 flex items-center justify-between',
        button_previous: 'inline-flex size-8 items-center justify-center rounded-md hover:bg-muted',
        button_next: 'inline-flex size-8 items-center justify-center rounded-md hover:bg-muted',
        month_grid: 'border-collapse',
        weekdays: 'flex',
        weekday: 'w-9 text-center text-xs font-normal text-muted-foreground',
        week: 'mt-1 flex',
        day: 'size-9 p-0 text-center text-sm',
        day_button: 'size-9 rounded-md transition-colors hover:bg-muted aria-selected:opacity-100',
        selected: '[&>button]:bg-primary [&>button]:text-primary-foreground [&>button:hover]:bg-primary',
        range_middle: '[&>button]:rounded-none [&>button]:bg-accent [&>button]:text-accent-foreground',
        range_start: '[&>button]:rounded-r-none',
        range_end: '[&>button]:rounded-l-none',
        today: '[&>button]:font-semibold [&>button]:text-primary',
        outside: 'text-muted-foreground opacity-50',
        disabled: 'text-muted-foreground opacity-40',
        hidden: 'invisible',
        ...classNames
      }}
      components={{
        Chevron: ({ orientation }) =>
          orientation === 'left' ? (
            <ChevronLeft className="size-4" aria-hidden />
          ) : (
            <ChevronRight className="size-4" aria-hidden />
          )
      }}
      {...props}
    />
  )
}
