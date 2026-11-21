import * as React from 'react'
import { cn } from '@/lib/utils'

const fieldBase =
  'w-full rounded-md border border-input bg-card px-3 text-sm shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-destructive aria-[invalid=true]:ring-destructive/20'

export function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  // 字号 ≥16px 的移动端输入避免 iOS 聚焦放大：sm 以上才降到 14px
  return <input type={type} className={cn(fieldBase, 'h-9 text-base sm:text-sm', className)} {...props} />
}

export function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return <textarea className={cn(fieldBase, 'min-h-20 py-2 text-base sm:text-sm', className)} {...props} />
}

export { fieldBase }
