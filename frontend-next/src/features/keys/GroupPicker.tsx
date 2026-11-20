import * as React from 'react'
import { Check, ChevronsUpDown } from 'lucide-react'
import { GroupBadge } from '@/components/GroupBadge'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList
} from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { t } from '@/i18n'
import { cn } from '@/lib/utils'
import type { Group } from '@/types'

export interface GroupPickerProps {
  groups: Group[]
  value: number | null
  onChange: (id: number | null) => void
  userRates?: Record<number, number>
  /** 允许选择“无分组”。 */
  allowNone?: boolean
  placeholder?: string
  className?: string
  'data-tour'?: string
  /** 自定义触发器（行内换组时使用）。 */
  trigger?: React.ReactNode
  disabled?: boolean
}

/** 分组选择器：搜索 + 分组徽章（倍率 / 订阅 / 高峰倍率）+ 描述。 */
export function GroupPicker({
  groups,
  value,
  onChange,
  userRates,
  allowNone,
  placeholder,
  className,
  trigger,
  disabled,
  ...rest
}: GroupPickerProps) {
  const [open, setOpen] = React.useState(false)
  const selected = groups.find((g) => g.id === value)
  const badge = (g: Group) => (
    <GroupBadge
      name={g.name}
      platform={g.platform}
      subscriptionType={g.subscription_type}
      rateMultiplier={g.rate_multiplier}
      userRateMultiplier={userRates?.[g.id]}
      peakRateEnabled={g.peak_rate_enabled}
      peakStart={g.peak_start}
      peakEnd={g.peak_end}
      peakRateMultiplier={g.peak_rate_multiplier}
    />
  )

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {trigger ?? (
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            data-tour={rest['data-tour']}
            className={cn('w-full justify-between font-normal', className)}
          >
            {selected ? (
              badge(selected)
            ) : (
              <span className="text-muted-foreground">{placeholder ?? t('keys.selectGroup')}</span>
            )}
            <ChevronsUpDown className="opacity-50" aria-hidden />
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-[min(380px,92vw)] p-0" align="start">
        <Command
          filter={(itemValue, search) =>
            itemValue.toLowerCase().includes(search.trim().toLowerCase()) ? 1 : 0
          }
        >
          <CommandInput placeholder={t('keys.searchGroup')} />
          <CommandList>
            <CommandEmpty>{t('keys.noGroupFound')}</CommandEmpty>
            <CommandGroup>
              {allowNone ? (
                <CommandItem
                  value="__none__"
                  onSelect={() => {
                    onChange(null)
                    setOpen(false)
                  }}
                >
                  <span className="text-muted-foreground">{t('keys.noGroup')}</span>
                  {value === null ? <Check className="ml-auto" aria-hidden /> : null}
                </CommandItem>
              ) : null}
              {groups.map((g) => (
                <CommandItem
                  key={g.id}
                  value={`${g.name} ${g.description ?? ''} ${g.id}`}
                  onSelect={() => {
                    onChange(g.id)
                    setOpen(false)
                  }}
                  className="items-start"
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    {badge(g)}
                    {g.description ? (
                      <p className="line-clamp-2 text-xs text-muted-foreground">{g.description}</p>
                    ) : null}
                  </div>
                  {value === g.id ? <Check className="mt-0.5 shrink-0" aria-hidden /> : null}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
