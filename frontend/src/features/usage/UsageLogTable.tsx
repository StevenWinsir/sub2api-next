/** 用量明细表（用户侧）：模型 / 端点 / 类型 / 计费 / Token / 费用 / 延迟 / 时间 / IP / UA / 请求 ID。 */
import * as React from 'react'
import type { ColumnDef, SortingState, Updater } from '@tanstack/react-table'
import { ArrowDown, ArrowUp, Database, ImageIcon, Info } from 'lucide-react'
import { CopyButton } from '@/components/CopyButton'
import { DataTable, type DataTableProps } from '@/components/DataTable'
import { IpGeoBatchToolbar, IpGeoCell } from '@/components/IpGeoCell'
import { Badge } from '@/components/ui/badge'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { t } from '@/i18n'
import { cn } from '@/lib/utils'
import type { UsageLog } from '@/types'
import { getBillingModeLabel, getDisplayBillingMode, isImageUsage } from '@/utils/billingMode'
import { formatDateTime, formatReasoningEffort } from '@/utils/format'
import { formatCacheTokens } from '@/utils/formatters'
import { formatImageBillingSize, hasImageInputTokens, hasImageOutputTokens } from '@/utils/imageUsage'
import {
  LATENCY_TEXT_CLASSES,
  durationSeverity,
  firstTokenSeverity,
  formatUsageOutputRate
} from '@/utils/latencyHealth'
import { resolveUsageRequestType } from '@/utils/usageRequestType'
import { billingModeVariant, formatLatency, requestTypeVariant } from './usageUi'

const SORTABLE = new Set(['model', 'created_at'])

function Detail({ rows }: { rows: [string, React.ReactNode][] }) {
  return (
    <dl className="space-y-1 text-xs">
      {rows.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-6">
          <dt className="text-muted-foreground">{k}</dt>
          <dd className="tabular font-medium">{v}</dd>
        </div>
      ))}
    </dl>
  )
}

function InfoPopover({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={label}
          className="rounded-full p-0.5 text-muted-foreground hover:text-foreground"
        >
          <Info className="size-3.5" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64" align="start">
        <p className="mb-2 text-xs font-semibold">{label}</p>
        {children}
      </PopoverContent>
    </Popover>
  )
}

export function requestTypeLabel(row: Pick<UsageLog, 'request_type' | 'stream' | 'openai_ws_mode'>): string {
  const kind = resolveUsageRequestType(row)
  const map: Record<string, string> = {
    cyber: 'usage.cyber',
    live: 'usage.live',
    ws_v2: 'usage.ws',
    stream: 'usage.stream',
    sync: 'usage.sync'
  }
  return t(map[kind] ?? 'usage.unknown')
}

export interface UsageLogTableProps {
  data: UsageLog[]
  loading: boolean
  hiddenColumns: string[]
  sorting: SortingState
  onSortingChange: (u: Updater<SortingState>) => void
  pagination: NonNullable<DataTableProps<UsageLog>['pagination']>
  onIpGeoBatchFailed?: () => void
}

export function UsageLogTable({
  data,
  loading,
  hiddenColumns,
  sorting,
  onSortingChange,
  pagination,
  onIpGeoBatchFailed
}: UsageLogTableProps) {
  const columns = React.useMemo<ColumnDef<UsageLog, unknown>[]>(() => {
    const defs: ColumnDef<UsageLog, unknown>[] = [
      {
        id: 'api_key',
        header: t('usage.apiKeyFilter'),
        cell: ({ row }) => <span className="text-sm">{row.original.api_key?.name || '-'}</span>
      },
      {
        id: 'model',
        header: t('usage.model'),
        cell: ({ row }) => <span className="break-all text-sm font-medium">{row.original.model}</span>
      },
      {
        id: 'reasoning_effort',
        header: t('usage.reasoningEffort'),
        cell: ({ row }) => (
          <span className="text-sm">{formatReasoningEffort(row.original.reasoning_effort)}</span>
        )
      },
      {
        id: 'endpoint',
        header: t('usage.endpoint'),
        cell: ({ row }) => (
          <div className="max-w-[260px] break-all text-xs">
            <span className="text-muted-foreground">{t('usage.inbound')}:</span>{' '}
            {row.original.inbound_endpoint?.trim() || '-'}
          </div>
        )
      },
      {
        id: 'ip_address',
        header: 'IP',
        cell: ({ row }) =>
          row.original.ip_address ? (
            <div>
              <span className="font-mono text-sm">{row.original.ip_address}</span>
              <IpGeoCell ip={row.original.ip_address} />
            </div>
          ) : (
            <span className="text-muted-foreground">-</span>
          )
      },
      {
        id: 'group',
        header: t('admin.usage.group'),
        cell: ({ row }) =>
          row.original.group ? (
            <Badge variant="secondary">{row.original.group.name}</Badge>
          ) : (
            <span className="text-muted-foreground">-</span>
          )
      },
      {
        id: 'stream',
        header: t('usage.type'),
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-1">
            <Badge
              variant={requestTypeVariant(resolveUsageRequestType(row.original))}
              data-testid="request-type-badge"
            >
              {requestTypeLabel(row.original)}
            </Badge>
            {row.original.native_compaction_v2 ? (
              <Badge variant="info" data-testid="native-compaction-badge">
                {t('usage.nativeCompactionV2')}
              </Badge>
            ) : null}
          </div>
        )
      },
      {
        id: 'billing_mode',
        header: t('admin.usage.billingMode'),
        cell: ({ row }) => {
          const mode = getDisplayBillingMode(row.original)
          return <Badge variant={billingModeVariant(mode)}>{getBillingModeLabel(mode, t)}</Badge>
        }
      },
      {
        id: 'tokens',
        header: t('usage.tokens'),
        cell: ({ row }) => {
          const r = row.original
          if (isImageUsage(r)) {
            return (
              <div className="flex items-center gap-1.5 text-sm">
                <ImageIcon className="size-4 text-primary" aria-hidden />
                <span className="font-medium">
                  {r.image_count}
                  {t('usage.imageUnit')}
                </span>
                <span className="text-muted-foreground">({formatImageBillingSize(r, t)})</span>
              </div>
            )
          }
          return (
            <div className="flex items-start gap-1.5">
              <div className="space-y-1 text-sm">
                <div className="flex items-center gap-3 tabular">
                  <span className="inline-flex items-center gap-1" title={t('admin.usage.inputTokens')}>
                    <ArrowDown className="size-3.5 text-success" aria-hidden />
                    {r.input_tokens?.toLocaleString() || 0}
                  </span>
                  <span className="inline-flex items-center gap-1" title={t('admin.usage.outputTokens')}>
                    <ArrowUp className="size-3.5 text-primary" aria-hidden />
                    {r.output_tokens?.toLocaleString() || 0}
                  </span>
                </div>
                {r.cache_read_tokens > 0 || r.cache_creation_tokens > 0 ? (
                  <div className="flex items-center gap-3 text-xs tabular">
                    {r.cache_read_tokens > 0 ? (
                      <span className="inline-flex items-center gap-1 text-info">
                        <Database className="size-3" aria-hidden />
                        {formatCacheTokens(r.cache_read_tokens)}
                      </span>
                    ) : null}
                    {r.cache_creation_tokens > 0 ? (
                      <span className="inline-flex items-center gap-1 text-warning">
                        <Database className="size-3" aria-hidden />
                        {formatCacheTokens(r.cache_creation_tokens)}
                        {r.cache_ttl_overridden ? (
                          <span title={t('usage.cacheTtlOverriddenHint')}>*</span>
                        ) : null}
                      </span>
                    ) : null}
                  </div>
                ) : null}
                {hasImageInputTokens(r) || hasImageOutputTokens(r) ? (
                  <div className="text-xs text-muted-foreground tabular">
                    {hasImageInputTokens(r) ? `img↓ ${r.image_input_tokens.toLocaleString()} ` : ''}
                    {hasImageOutputTokens(r) ? `img↑ ${r.image_output_tokens.toLocaleString()}` : ''}
                  </div>
                ) : null}
              </div>
              <InfoPopover label={t('usage.tokenDetails')}>
                <Detail
                  rows={[
                    [t('admin.usage.inputTokens'), r.input_tokens.toLocaleString()],
                    [t('admin.usage.outputTokens'), r.output_tokens.toLocaleString()],
                    [t('admin.usage.cacheReadTokens'), r.cache_read_tokens.toLocaleString()],
                    [t('admin.usage.cacheCreationTokens'), r.cache_creation_tokens.toLocaleString()]
                  ]}
                />
              </InfoPopover>
            </div>
          )
        }
      },
      {
        id: 'cost',
        header: t('usage.cost'),
        cell: ({ row }) => {
          const r = row.original
          return (
            <div className="flex items-center gap-1.5 text-sm">
              <div className="tabular">
                <span className="font-medium text-success" title={t('dashboard.actual')}>
                  ${r.actual_cost?.toFixed(6) || '0.000000'}
                </span>
                <span
                  className="ml-1 text-xs text-muted-foreground line-through"
                  title={t('dashboard.standard')}
                >
                  ${r.total_cost?.toFixed(6) || '0.000000'}
                </span>
              </div>
              {r.long_context_billing_applied ? (
                <Badge
                  variant="warning"
                  data-testid="long-context-billing-marker"
                  title={t('admin.usage.longContextPricingTooltip')}
                >
                  {t('admin.usage.longContext')}
                </Badge>
              ) : null}
              <InfoPopover label={t('usage.costDetails')}>
                <Detail
                  rows={[
                    [t('admin.usage.inputCost'), `$${r.input_cost.toFixed(6)}`],
                    [t('admin.usage.outputCost'), `$${r.output_cost.toFixed(6)}`],
                    [t('admin.usage.cacheReadCost'), `$${r.cache_read_cost.toFixed(6)}`],
                    [t('admin.usage.cacheCreationCost'), `$${r.cache_creation_cost.toFixed(6)}`],
                    [t('usage.rate'), `${r.rate_multiplier}x`]
                  ]}
                />
              </InfoPopover>
            </div>
          )
        }
      },
      {
        id: 'latency',
        header: t('usage.latency'),
        cell: ({ row }) => {
          const r = row.original
          return (
            <div className="grid grid-cols-[max-content_max-content] gap-x-2 gap-y-0.5 text-xs">
              <span className="text-muted-foreground">{t('usage.latencyFirstToken')}</span>
              {r.first_token_ms != null ? (
                <span
                  className={cn(
                    'tabular font-medium',
                    LATENCY_TEXT_CLASSES[firstTokenSeverity(r.first_token_ms)]
                  )}
                >
                  {formatLatency(r.first_token_ms)}
                </span>
              ) : (
                <span className="text-muted-foreground">-</span>
              )}
              <span className="text-muted-foreground">{t('usage.latencyDuration')}</span>
              <span
                className={cn(
                  'tabular font-medium',
                  LATENCY_TEXT_CLASSES[durationSeverity(r.duration_ms ?? 0)]
                )}
              >
                {formatLatency(r.duration_ms)}
              </span>
              <span className="text-muted-foreground" title={t('usage.outputTpsHint')}>
                {t('usage.outputTps')}
              </span>
              <span className="tabular" data-testid="output-tps">
                {formatUsageOutputRate(r)}
              </span>
            </div>
          )
        }
      },
      {
        id: 'created_at',
        header: t('usage.time'),
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-sm text-muted-foreground">
            {formatDateTime(row.original.created_at)}
          </span>
        )
      },
      {
        id: 'request_id',
        header: t('admin.usage.requestId'),
        cell: ({ row }) =>
          row.original.request_id ? (
            <div className="flex max-w-40 items-center gap-1">
              <span
                className="truncate font-mono text-xs text-muted-foreground"
                title={row.original.request_id}
              >
                {row.original.request_id}
              </span>
              <CopyButton value={row.original.request_id} className="size-6" />
            </div>
          ) : (
            <span className="text-muted-foreground">-</span>
          )
      },
      {
        id: 'user_agent',
        header: t('usage.userAgent'),
        cell: ({ row }) =>
          row.original.user_agent ? (
            <span
              className="block max-w-xs truncate text-sm text-muted-foreground"
              title={row.original.user_agent}
            >
              {row.original.user_agent}
            </span>
          ) : (
            <span className="text-muted-foreground">-</span>
          )
      }
    ]
    return defs.map((d) => ({ ...d, enableSorting: SORTABLE.has(d.id as string) }))
  }, [])

  const ips = React.useMemo(
    () => Array.from(new Set(data.map((r) => r.ip_address).filter((ip): ip is string => Boolean(ip)))),
    [data]
  )

  return (
    <div className="space-y-0">
      {!hiddenColumns.includes('ip_address') ? (
        <IpGeoBatchToolbar ips={ips} onFailed={onIpGeoBatchFailed} />
      ) : null}
      <DataTable
        columns={columns}
        data={data}
        loading={loading}
        getRowId={(r) => String(r.id)}
        columnVisibility={Object.fromEntries(hiddenColumns.map((k) => [k, false]))}
        sorting={sorting}
        onSortingChange={onSortingChange}
        emptyTitle={t('usage.noRecords')}
        pagination={pagination}
      />
    </div>
  )
}
