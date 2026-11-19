import * as React from 'react'
import { Command as CommandPrimitive } from 'cmdk'
import { Search } from 'lucide-react'
import { cn } from '@/lib/utils'

export function Command({ className, ...props }: React.ComponentProps<typeof CommandPrimitive>) {
  return (
    <CommandPrimitive
      className={cn(
        'flex size-full flex-col overflow-hidden rounded-md bg-popover text-popover-foreground',
        className
      )}
      {...props}
    />
  )
}

export function CommandInput({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.Input>) {
  return (
    <div className="flex items-center gap-2 border-b px-3">
      <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <CommandPrimitive.Input
        className={cn(
          'flex h-11 w-full bg-transparent text-base outline-none placeholder:text-muted-foreground sm:text-sm',
          className
        )}
        {...props}
      />
    </div>
  )
}

export function CommandList({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.List>) {
  return (
    <CommandPrimitive.List
      className={cn('max-h-80 overflow-y-auto overflow-x-hidden p-1 scroll-thin', className)}
      {...props}
    />
  )
}
export function CommandEmpty(props: React.ComponentProps<typeof CommandPrimitive.Empty>) {
  return <CommandPrimitive.Empty className="py-6 text-center text-sm text-muted-foreground" {...props} />
}
export function CommandGroup({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.Group>) {
  return (
    <CommandPrimitive.Group
      className={cn(
        'overflow-hidden p-1 text-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground',
        className
      )}
      {...props}
    />
  )
}
export function CommandItem({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.Item>) {
  return (
    <CommandPrimitive.Item
      className={cn(
        'flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-2 text-sm outline-none data-[disabled=true]:opacity-50 data-[selected=true]:bg-muted [&_svg]:size-4 [&_svg]:text-muted-foreground',
        className
      )}
      {...props}
    />
  )
}
