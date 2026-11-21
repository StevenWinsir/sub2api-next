import * as React from 'react'
import { RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { NativeSelect } from '@/components/NativeSelect'
import { cn } from '@/lib/utils'
import { t } from '@/i18n'

/** 筛选条容器：关键字、组合筛选、重置与右侧操作区。 */
export function FilterBar({
  children,
  actions,
  onReset,
  className
}: {
  children: React.ReactNode
  actions?: React.ReactNode
  onReset?: () => void
  className?: string
}) {
  return (
    <div className={cn('mb-4 flex flex-wrap items-center gap-2', className)}>
      {children}
      {onReset ? (
        <Button variant="ghost" size="sm" onClick={onReset}>
          <RotateCcw aria-hidden />
          {t('common.reset')}
        </Button>
      ) : null}
      {actions ? <div className="ml-auto flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  )
}

export interface FilterOption {
  value: string
  label: string
}

/** 简单的下拉筛选（原生 select，移动端体验最好）。 */
export function FilterSelect({
  value,
  onChange,
  options,
  label,
  className
}: {
  value: string
  onChange: (value: string) => void
  options: FilterOption[]
  label: string
  className?: string
}) {
  return (
    <div className={cn('w-40', className)}>
      <NativeSelect value={value} aria-label={label} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </NativeSelect>
    </div>
  )
}
