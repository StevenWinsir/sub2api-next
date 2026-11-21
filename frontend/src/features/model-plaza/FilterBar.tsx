import * as React from 'react'
import { Search, X } from 'lucide-react'
import { PlatformIcon } from '@/components/PlatformIcon'
import { cn } from '@/lib/utils'
import { platformAccentColor } from '@/utils/platformColors'
import { t } from '@/i18n'
import { groupEnabled, platformEnabled, rateEnabled, type GroupOption, type PlazaFilters } from './pricing'

interface Props {
  platforms: string[]
  groups: Array<GroupOption & { name: string }>
  rates: number[]
  filters: PlazaFilters
  onChange: (next: Partial<PlazaFilters>) => void
}

function Chip({
  active,
  disabled,
  accent,
  onClick,
  children
}: {
  active: boolean
  disabled?: boolean
  accent?: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      style={accent && !active ? ({ '--chip-accent': accent } as React.CSSProperties) : undefined}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40',
        active
          ? 'border-primary bg-primary text-primary-foreground'
          : 'bg-card text-muted-foreground enabled:hover:border-ring/50 enabled:hover:text-foreground',
        accent && !active && 'text-[color-mix(in_srgb,var(--chip-accent)_75%,var(--foreground))]'
      )}
    >
      {children}
    </button>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-4">
      <span className="w-14 shrink-0 pt-1 text-xs font-medium text-muted-foreground">{label}</span>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  )
}

/** 一级平台 → 二级分组 → 三级倍率 → 模型名搜索；某选项在其他维度当前选择下无命中时置灰。 */
export function FilterBar({ platforms, groups, rates, filters, onChange }: Props) {
  return (
    <div className="space-y-3 rounded-lg border bg-card p-4">
      <Row label={t('modelPlaza.filters.platformLabel')}>
        {['all', ...platforms].map((p) => (
          <Chip
            key={p}
            active={filters.platform === p}
            disabled={p !== 'all' && !platformEnabled(groups, filters, p)}
            accent={p === 'all' ? undefined : platformAccentColor(p)}
            onClick={() => onChange({ platform: p })}
          >
            {p !== 'all' ? <PlatformIcon platform={p} size="xs" /> : null}
            {p === 'all' ? t('modelPlaza.filters.all') : p}
          </Chip>
        ))}
      </Row>
      <Row label={t('modelPlaza.filters.groupLabel')}>
        <Chip active={filters.groupId === 'all'} onClick={() => onChange({ groupId: 'all' })}>
          {t('modelPlaza.filters.all')}
        </Chip>
        {groups.map((g) => (
          <Chip
            key={g.id}
            active={filters.groupId === g.id}
            disabled={!groupEnabled(filters, g)}
            accent={platformAccentColor(g.platform)}
            onClick={() => onChange({ groupId: g.id })}
          >
            {g.name}
          </Chip>
        ))}
      </Row>
      <Row label={t('modelPlaza.filters.rateLabel')}>
        <Chip active={filters.rate === 'all'} onClick={() => onChange({ rate: 'all' })}>
          {t('modelPlaza.filters.all')}
        </Chip>
        {rates.map((r) => (
          <Chip
            key={r}
            active={filters.rate === r}
            disabled={!rateEnabled(groups, filters, r)}
            onClick={() => onChange({ rate: r })}
          >
            {r}x
          </Chip>
        ))}
      </Row>
      <Row label={t('modelPlaza.filters.modelLabel')}>
        <div className="relative w-full min-w-56 sm:w-72">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <input
            type="search"
            value={filters.search}
            placeholder={t('modelPlaza.filters.searchPlaceholder')}
            aria-label={t('modelPlaza.filters.modelLabel')}
            onChange={(e) => onChange({ search: e.target.value })}
            className="h-8 w-full rounded-md border border-input bg-card pl-8 pr-8 text-base shadow-xs focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 sm:text-sm [&::-webkit-search-cancel-button]:hidden"
          />
          {filters.search ? (
            <button
              type="button"
              aria-label={t('ui.common.clear')}
              onClick={() => onChange({ search: '' })}
              className="absolute right-1.5 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" aria-hidden />
            </button>
          ) : null}
        </div>
      </Row>
    </div>
  )
}
