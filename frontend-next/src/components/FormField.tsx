import * as React from 'react'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

export interface FormFieldProps {
  label: React.ReactNode
  htmlFor?: string
  description?: React.ReactNode
  /** 就近显示的错误（含后端返回的字段级错误映射）。 */
  error?: React.ReactNode
  required?: boolean
  className?: string
  children: React.ReactNode
}

export function FormField({
  label,
  htmlFor,
  description,
  error,
  required,
  className,
  children
}: FormFieldProps) {
  const id = React.useId()
  const fieldId = htmlFor ?? id
  const describedBy = error ? `${fieldId}-error` : description ? `${fieldId}-desc` : undefined
  const child = React.isValidElement<Record<string, unknown>>(children)
    ? React.cloneElement(children, {
        id: (children.props.id as string | undefined) ?? fieldId,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': describedBy
      })
    : children

  return (
    <div className={cn('grid gap-1.5', className)}>
      <Label htmlFor={fieldId}>
        {label}
        {required ? (
          <span className="ml-0.5 text-destructive" aria-hidden>
            *
          </span>
        ) : null}
      </Label>
      {child}
      {error ? (
        <p id={`${fieldId}-error`} role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : description ? (
        <p id={`${fieldId}-desc`} className="text-xs text-muted-foreground">
          {description}
        </p>
      ) : null}
    </div>
  )
}
