/** /available-channels：当前用户可访问的渠道 → 分组 → 支持模型与定价。 */
import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import userChannelsAPI, { type UserAvailableChannel, type UserAvailableGroup } from '@/api/channels'
import userGroupsAPI from '@/api/groups'
import { EmptyState } from '@/components/EmptyState'
import { GroupBadge } from '@/components/GroupBadge'
import { PageHeader } from '@/components/PageHeader'
import { PlatformIcon } from '@/components/PlatformIcon'
import { SearchInput } from '@/components/SearchInput'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { t } from '@/i18n'
import { useLocale } from '@/i18n/react'
import { useAppStore } from '@/stores/app'
import { extractApiErrorMessage } from '@/utils/apiError'
import { platformLabel } from '@/utils/platformColors'
import { SupportedModelChip } from './SupportedModelChip'

/**
 * 搜索过滤：命中渠道名 / 描述 → 保留整个渠道；否则按 platform / group / model 过滤 sections，
 * 有匹配的 section 才保留；全部不匹配则过滤掉该渠道。
 */
export function filterChannels(channels: UserAvailableChannel[], query: string): UserAvailableChannel[] {
  const q = query.trim().toLowerCase()
  if (!q) return channels
  return channels
    .map((ch) => {
      if (ch.name.toLowerCase().includes(q) || (ch.description || '').toLowerCase().includes(q)) return ch
      const sections = ch.platforms.filter(
        (p) =>
          p.platform.toLowerCase().includes(q) ||
          p.groups.some((g) => g.name.toLowerCase().includes(q)) ||
          p.supported_models.some((m) => m.name.toLowerCase().includes(q))
      )
      return sections.length === 0 ? null : { ...ch, platforms: sections }
    })
    .filter((ch): ch is UserAvailableChannel => ch !== null)
}

function GroupList({
  groups,
  rates,
  label,
  tooltip
}: {
  groups: UserAvailableGroup[]
  rates: Record<number, number>
  label: string
  tooltip: string
}) {
  if (groups.length === 0) return null
  return (
    <div className="space-y-1">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground" title={tooltip}>
        {label}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {groups.map((g) => (
          <GroupBadge
            key={g.id}
            name={g.name}
            platform={g.platform}
            subscriptionType={g.subscription_type}
            rateMultiplier={g.rate_multiplier}
            userRateMultiplier={rates[g.id]}
            peakRateEnabled={g.peak_rate_enabled}
            peakStart={g.peak_start}
            peakEnd={g.peak_end}
            peakRateMultiplier={g.peak_rate_multiplier}
            alwaysShowRate
          />
        ))}
      </div>
    </div>
  )
}

export function AvailableChannelsPage() {
  useLocale()
  const [search, setSearch] = React.useState('')
  const q = useQuery({
    queryKey: ['user', 'channels', 'available'],
    queryFn: async ({ signal }) => {
      try {
        // 专属倍率失败不阻塞渠道展示：降级为仅显示默认倍率
        const [list, rates] = await Promise.all([
          userChannelsAPI.getAvailable({ signal }),
          userGroupsAPI.getUserGroupRates().catch((err: unknown) => {
            console.error('Failed to load user group rates:', err)
            return {} as Record<number, number>
          })
        ])
        return { list, rates }
      } catch (err) {
        useAppStore.getState().showError(extractApiErrorMessage(err, t('common.error')))
        throw err
      }
    }
  })
  const rows = React.useMemo(() => filterChannels(q.data?.list ?? [], search), [q.data, search])
  const rates = q.data?.rates ?? {}

  return (
    <div className="space-y-4">
      <PageHeader title={t('availableChannels.title')} description={t('availableChannels.description')} />
      <SearchInput
        value={search}
        onValueChange={setSearch}
        placeholder={t('availableChannels.searchPlaceholder')}
        containerClassName="w-full sm:w-80"
      />

      {q.isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState title={t('availableChannels.empty')} />
        </Card>
      ) : (
        <div className="space-y-4">
          {rows.map((ch) => (
            <Card key={ch.name} className="overflow-hidden">
              <div className="border-b bg-muted/40 px-4 py-3">
                <h2 className="text-sm font-semibold">{ch.name}</h2>
                {ch.description ? (
                  <p className="mt-0.5 text-xs text-muted-foreground">{ch.description}</p>
                ) : null}
              </div>
              <div className="divide-y">
                {ch.platforms.map((sec) => (
                  <div key={sec.platform} className="grid gap-4 p-4 lg:grid-cols-[14rem_1fr_2fr]">
                    <div className="flex items-start gap-2">
                      <PlatformIcon platform={sec.platform} size="md" />
                      <div>
                        <p className="text-xs text-muted-foreground">
                          {t('availableChannels.columns.platform')}
                        </p>
                        <p className="text-sm font-medium">{platformLabel(sec.platform)}</p>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground">{t('availableChannels.columns.groups')}</p>
                      <GroupList
                        groups={sec.groups.filter((g) => g.is_exclusive)}
                        rates={rates}
                        label={t('availableChannels.exclusive')}
                        tooltip={t('availableChannels.exclusiveTooltip')}
                      />
                      <GroupList
                        groups={sec.groups.filter((g) => !g.is_exclusive)}
                        rates={rates}
                        label={t('availableChannels.public')}
                        tooltip={t('availableChannels.publicTooltip')}
                      />
                    </div>
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground">
                        {t('availableChannels.columns.supportedModels')}
                      </p>
                      {sec.supported_models.length === 0 ? (
                        <Badge variant="secondary">{t('availableChannels.noModels')}</Badge>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {sec.supported_models.map((m) => (
                            <SupportedModelChip
                              key={`${m.platform}:${m.name}`}
                              model={m}
                              showPlatform={false}
                              noPricingLabel={t('availableChannels.noPricing')}
                              platformHint={sec.platform}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
