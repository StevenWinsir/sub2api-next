/** /monitor（V1）：渠道状态卡片网格 + 时间线 + 多窗口可用率 + 详情对话框。 */
import * as React from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Activity, RefreshCw } from 'lucide-react'
import {
  list as listChannelMonitorViews,
  status as fetchDetail,
  type UserMonitorDetail,
  type UserMonitorView
} from '@/api/channelMonitor'
import { AutoRefreshButton } from '@/components/AutoRefreshButton'
import { EmptyState } from '@/components/EmptyState'
import { PageHeader } from '@/components/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { DEFAULT_INTERVAL_SECONDS, STATUS_OPERATIONAL } from '@/constants/channelMonitor'
import { useAutoRefresh } from '@/hooks/useAutoRefresh'
import { usePageVisible } from '@/hooks/usePageVisibility'
import { t } from '@/i18n'
import { useLocale } from '@/i18n/react'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/stores/app'
import { extractApiErrorMessage } from '@/utils/apiError'
import { isChannelMonitorQuotaVisible } from '@/utils/featureFlags'
import {
  TIMELINE_STATUS,
  formatLatency,
  formatMonitorModel,
  formatPercent,
  formatRelativeTime,
  hslForPct,
  providerLabel,
  statusLabel,
  statusVariant
} from './channelMonitorFormat'
import { MonitorQuotaView } from './MonitorQuotaView'

type MonitorWindow = '7d' | '15d' | '30d'
type Overall = 'operational' | 'degraded'

export function overallStatusOf(items: Pick<UserMonitorView, 'primary_status'>[]): Overall {
  if (items.length === 0) return 'operational'
  return items.every((it) => it.primary_status === STATUS_OPERATIONAL) ? 'operational' : 'degraded'
}

function Timeline({ buckets, length = 60 }: { buckets: UserMonitorView['timeline']; length?: number }) {
  // 后端按新→旧返回；反转为旧→新，最右侧为“现在”，左侧用占位补齐
  const real = [...(buckets ?? [])].slice(0, length).reverse()
  const pad = Math.max(0, length - real.length)
  return (
    <div className="flex h-8 items-end gap-px" role="img" aria-label={t('channelStatus.title')}>
      {Array.from({ length: pad }).map((_, i) => (
        <span
          key={`p${i}`}
          className={cn('w-full rounded-sm', TIMELINE_STATUS.empty.color)}
          style={{ height: `${TIMELINE_STATUS.empty.height}%` }}
        />
      ))}
      {real.map((p, i) => {
        const s = TIMELINE_STATUS[p.status] ?? TIMELINE_STATUS.empty
        return (
          <span
            key={i}
            className={cn('w-full rounded-sm', s.color)}
            style={{ height: `${s.height}%` }}
            title={`${formatRelativeTime(p.checked_at)} · ${statusLabel(p.status)} · ${formatLatency(p.latency_ms)}ms`}
          />
        )
      })}
    </div>
  )
}

function MonitorCard({
  item,
  availability,
  onClick
}: {
  item: UserMonitorView
  availability: number | null
  onClick: () => void
}) {
  const quota = isChannelMonitorQuotaVisible() && item.latest_quota
  return (
    <Card className="cursor-pointer space-y-3 p-4 transition-shadow hover:shadow-md">
      <button
        type="button"
        onClick={onClick}
        className="block w-full space-y-3 text-left"
        aria-label={item.name}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{item.name}</p>
            <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              <Badge variant="secondary">{providerLabel(item.provider)}</Badge>
              {item.group_name ? <span className="truncate">{item.group_name}</span> : null}
            </p>
          </div>
          <Badge variant={statusVariant(item.primary_status)}>{statusLabel(item.primary_status)}</Badge>
        </div>
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div>
            <p className="text-muted-foreground">{t('channelStatus.columns.primaryModel')}</p>
            <p className="truncate font-medium" title={formatMonitorModel(item.primary_model)}>
              {formatMonitorModel(item.primary_model)}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">{t('channelStatus.columns.latency')}</p>
            <p className="tabular font-medium">{formatLatency(item.primary_latency_ms)}</p>
          </div>
        </div>
        <div>
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="text-muted-foreground">{t('monitorCommon.availabilityPrefix')}</span>
            <span className="tabular font-semibold" style={{ color: hslForPct(availability) }}>
              {formatPercent(availability)}
            </span>
          </div>
          <Timeline buckets={item.timeline} />
        </div>
        {item.extra_models?.length ? (
          <p className="text-xs text-muted-foreground">
            {t('monitorCommon.extraModelsCount', { n: item.extra_models.length })}
          </p>
        ) : null}
        {quota ? <MonitorQuotaView snapshot={item.latest_quota} /> : null}
      </button>
    </Card>
  )
}

function DetailDialog({ item, onClose }: { item: UserMonitorView | null; onClose: () => void }) {
  const q = useQuery({
    queryKey: ['user', 'monitor', 'detail', item?.id],
    enabled: !!item,
    queryFn: () => fetchDetail(item!.id)
  })
  const d: UserMonitorDetail | undefined = q.data
  React.useEffect(() => {
    if (q.isError)
      useAppStore.getState().showError(extractApiErrorMessage(q.error, t('channelStatus.detailLoadError')))
  }, [q.isError, q.error])
  return (
    <Dialog open={!!item} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{item?.name || t('channelStatus.detailTitle')}</DialogTitle>
          <DialogDescription className="sr-only">{t('channelStatus.detailTitle')}</DialogDescription>
        </DialogHeader>
        {q.isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">{t('channelStatus.detailColumns.model')}</th>
                  <th className="py-2 pr-3 font-medium">{t('channelStatus.detailColumns.latestStatus')}</th>
                  <th className="py-2 pr-3 text-right font-medium">
                    {t('channelStatus.detailColumns.latestLatency')}
                  </th>
                  <th className="py-2 pr-3 text-right font-medium">
                    {t('channelStatus.detailColumns.availability7d')}
                  </th>
                  <th className="py-2 pr-3 text-right font-medium">
                    {t('channelStatus.detailColumns.availability15d')}
                  </th>
                  <th className="py-2 pr-3 text-right font-medium">
                    {t('channelStatus.detailColumns.availability30d')}
                  </th>
                  <th className="py-2 text-right font-medium">
                    {t('channelStatus.detailColumns.avgLatency7d')}
                  </th>
                </tr>
              </thead>
              <tbody className="tabular">
                {(d?.models ?? []).map((m) => (
                  <tr key={m.model} className="border-b last:border-0">
                    <td className="py-2 pr-3 font-medium">{formatMonitorModel(m.model)}</td>
                    <td className="py-2 pr-3">
                      <Badge variant={statusVariant(m.latest_status)}>{statusLabel(m.latest_status)}</Badge>
                    </td>
                    <td className="py-2 pr-3 text-right">{formatLatency(m.latest_latency_ms)}</td>
                    <td className="py-2 pr-3 text-right">{formatPercent(m.availability_7d)}</td>
                    <td className="py-2 pr-3 text-right">{formatPercent(m.availability_15d)}</td>
                    <td className="py-2 pr-3 text-right">{formatPercent(m.availability_30d)}</td>
                    <td className="py-2 text-right">{formatLatency(m.avg_latency_7d_ms)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

export function MonitorV1Page() {
  useLocale()
  const queryClient = useQueryClient()
  const visible = usePageVisible()
  const enabledFlag = useAppStore((s) => s.cachedPublicSettings?.channel_monitor_enabled)
  const [window7, setWindow] = React.useState<MonitorWindow>('7d')
  const [target, setTarget] = React.useState<UserMonitorView | null>(null)

  const list = useQuery({
    queryKey: ['user', 'monitor', 'list'],
    queryFn: async ({ signal }) => {
      try {
        return (await listChannelMonitorViews({ signal })).items || []
      } catch (err) {
        useAppStore.getState().showError(extractApiErrorMessage(err, t('channelStatus.loadError')))
        throw err
      }
    }
  })
  const items = React.useMemo(() => list.data ?? [], [list.data])

  // 非 7d 窗口的可用率来自详情接口：按窗口批量拉取并缓存
  const details = useQuery({
    queryKey: ['user', 'monitor', 'details', window7, items.map((i) => i.id)],
    enabled: window7 !== '7d' && items.length > 0,
    queryFn: async () => {
      const entries = await Promise.all(
        items.map(async (it) => {
          try {
            return [it.id, await fetchDetail(it.id)] as const
          } catch (err) {
            useAppStore.getState().showError(extractApiErrorMessage(err, t('channelStatus.detailLoadError')))
            return [it.id, null] as const
          }
        })
      )
      return Object.fromEntries(entries.filter(([, v]) => v)) as Record<number, UserMonitorDetail>
    }
  })

  const auto = useAutoRefresh({
    storageKey: 'channel-status-auto-refresh',
    intervals: [30, 60, 120],
    defaultInterval: DEFAULT_INTERVAL_SECONDS,
    defaultEnabled: true,
    onRefresh: async () => {
      await queryClient.invalidateQueries({ queryKey: ['user', 'monitor'] })
    },
    shouldPause: () => !visible || list.isFetching || enabledFlag === false
  })

  const availabilityOf = (it: UserMonitorView): number | null => {
    if (window7 === '7d') return it.availability_7d
    const d = details.data?.[it.id]
    if (!d) return null
    const row = d.models.find((m) => m.model === it.primary_model) ?? d.models[0]
    if (!row) return null
    return window7 === '15d' ? row.availability_15d : row.availability_30d
  }

  const overall = overallStatusOf(items)

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('channelStatus.title')}
        description={t('channelStatus.description')}
        actions={
          <>
            <Badge variant={overall === 'operational' ? 'success' : 'warning'} className="h-9 px-3 text-xs">
              <span
                className={cn(
                  'size-2 animate-pulse rounded-full',
                  overall === 'operational' ? 'bg-success' : 'bg-warning'
                )}
                aria-hidden
              />
              {t(`channelStatus.overall.${overall}`)}
            </Badge>
            <AutoRefreshButton
              enabled={auto.enabled}
              intervals={auto.intervals}
              intervalSeconds={auto.intervalSeconds}
              countdown={auto.countdown}
              onEnabledChange={auto.setEnabled}
              onIntervalChange={auto.setInterval}
            />
            <Button
              variant="outline"
              size="icon"
              aria-label={t('common.refresh')}
              onClick={() => {
                void list.refetch()
                auto.resetCountdown()
              }}
              disabled={list.isFetching}
            >
              <RefreshCw className={list.isFetching ? 'animate-spin' : ''} aria-hidden />
            </Button>
          </>
        }
      />

      <Tabs value={window7} onValueChange={(v) => setWindow(v as MonitorWindow)}>
        <TabsList>
          {(['7d', '15d', '30d'] as const).map((w) => (
            <TabsTrigger key={w} value={w}>
              {t(`channelStatus.windowTab.${w}`)}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {list.isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-44" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <Card>
          <EmptyState
            icon={Activity}
            title={t('channelStatus.empty.title')}
            description={t('channelStatus.empty.description')}
          />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {items.map((it) => (
            <MonitorCard
              key={it.id}
              item={it}
              availability={availabilityOf(it)}
              onClick={() => setTarget(it)}
            />
          ))}
        </div>
      )}
      <DetailDialog item={target} onClose={() => setTarget(null)} />
    </div>
  )
}
