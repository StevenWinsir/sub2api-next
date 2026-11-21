import * as React from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { fieldBase } from '@/components/ui/input'

/** 原生 <select>：移动端体验最好、可访问性最稳，适合简单的二三选一场景。 */
export function NativeSelect({ className, children, ...props }: React.ComponentProps<'select'>) {
  return (
    <div className="relative">
      <select
        className={cn(fieldBase, 'h-9 appearance-none pr-9 text-base sm:text-sm', className)}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
    </div>
  )
}
