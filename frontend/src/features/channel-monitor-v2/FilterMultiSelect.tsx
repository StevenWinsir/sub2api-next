import * as React from 'react'
import { Check, ChevronDown } from 'lucide-react'
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

export interface Option {
  value: string
  label: string
}

/** 多选筛选器：搜索 + 勾选；未选择表示“全部”。 */
export function FilterMultiSelect({
  label,
  allLabel,
  options,
  value,
  onChange
}: {
  label: string
  allLabel: string
  options: Option[]
  value: string[]
  onChange: (next: string[]) => void
}) {
  const [open, setOpen] = React.useState(false)
  const selected = new Set(value)
  const summary =
    value.length === 0
      ? allLabel
      : value.length === 1
        ? (options.find((o) => o.value === value[0])?.label ?? value[0])
        : t('channelMonitorV2.filters.selectedCount', { count: value.length })
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="min-w-40 justify-between font-normal" aria-label={label}>
          <span className="truncate">
            <span className="text-muted-foreground">{label}: </span>
            {summary}
          </span>
          <ChevronDown className="opacity-50" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-0">
        <Command filter={(v, s) => (v.toLowerCase().includes(s.trim().toLowerCase()) ? 1 : 0)}>
          <CommandInput placeholder={t('ui.common.search')} />
          <CommandList>
            <CommandEmpty>{t('channelMonitorV2.filters.empty')}</CommandEmpty>
            <CommandGroup>
              {options.map((o) => (
                <CommandItem
                  key={o.value}
                  value={o.label}
                  onSelect={() => {
                    const next = new Set(selected)
                    if (next.has(o.value)) next.delete(o.value)
                    else next.add(o.value)
                    onChange([...next])
                  }}
                >
                  <span className="truncate">{o.label}</span>
                  {selected.has(o.value) ? <Check className="ml-auto" aria-hidden /> : null}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
