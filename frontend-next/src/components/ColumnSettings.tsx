import { Check, Columns3 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { t } from '@/i18n'

/** 列设置下拉：勾选即显示。 */
export function ColumnSettings({
  columns,
  isVisible,
  onToggle,
  label
}: {
  columns: { key: string; label: string }[]
  isVisible: (key: string) => boolean
  onToggle: (key: string) => void
  label?: string
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" aria-label={label ?? t('keys.columnSettings')}>
          <Columns3 aria-hidden />
          <span className="hidden md:inline">{label ?? t('keys.columnSettings')}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-80 w-52 overflow-y-auto">
        {columns.map((c) => (
          <DropdownMenuItem
            key={c.key}
            onSelect={(e) => {
              e.preventDefault()
              onToggle(c.key)
            }}
            className="justify-between"
          >
            <span>{c.label}</span>
            {isVisible(c.key) ? <Check className="size-4 text-primary" aria-hidden /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
