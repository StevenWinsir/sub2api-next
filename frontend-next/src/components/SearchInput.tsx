import * as React from 'react'
import { Search, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { useDebouncedCallback } from '@/hooks/useDebounce'
import { cn } from '@/lib/utils'
import { t } from '@/i18n'

export interface SearchInputProps extends Omit<
  React.ComponentProps<'input'>,
  'onChange' | 'value' | 'defaultValue'
> {
  value: string
  onValueChange: (value: string) => void
  /** 防抖毫秒数（关键字搜索默认 300ms，§6.3）。 */
  debounceMs?: number
  containerClassName?: string
}

export function SearchInput({
  value,
  onValueChange,
  debounceMs = 300,
  containerClassName,
  className,
  placeholder,
  ...props
}: SearchInputProps) {
  const [local, setLocal] = React.useState(value)
  const [prevValue, setPrevValue] = React.useState(value)
  // 外部值变化时同步本地输入（渲染期派生状态，避免在 effect 里 setState）
  if (value !== prevValue) {
    setPrevValue(value)
    setLocal(value)
  }
  const emit = useDebouncedCallback(onValueChange, debounceMs)

  return (
    <div className={cn('relative', containerClassName)}>
      <Search
        className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
      <Input
        type="search"
        value={local}
        placeholder={placeholder ?? t('ui.common.search')}
        aria-label={props['aria-label'] ?? placeholder ?? t('ui.common.search')}
        className={cn('pl-8 pr-8 [&::-webkit-search-cancel-button]:hidden', className)}
        onChange={(e) => {
          setLocal(e.target.value)
          emit(e.target.value)
        }}
        {...props}
      />
      {local ? (
        <button
          type="button"
          aria-label={t('ui.common.clear')}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-0.5 text-muted-foreground hover:text-foreground"
          onClick={() => {
            setLocal('')
            onValueChange('')
          }}
        >
          <X className="size-3.5" aria-hidden />
        </button>
      ) : null}
    </div>
  )
}
