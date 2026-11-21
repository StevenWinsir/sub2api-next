/** 用量页的“错误请求”标签：列表 + 详情对话框（受 allow_user_view_error_requests 控制）。 */
import * as React from 'react'
import type { ColumnDef, SortingState, Updater } from '@tanstack/react-table'
import { useQuery } from '@tanstack/react-query'
import { Eye } from 'lucide-react'
import { getMyErrorDetail } from '@/api/usage'
import { DataTable, type DataTableProps } from '@/components/DataTable'
import { IpGeoBatchToolbar, IpGeoCell } from '@/components/IpGeoCell'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { t } from '@/i18n'
import type { UserErrorRequest } from '@/types'
import { numericRequestTypeKind, requestTypeLabelKey } from '@/utils/errorBadges'
import { formatDateTime } from '@/utils/format'
import { requestTypeVariant, statusCodeVariant } from './usageUi'

export const ERROR_COLUMN_KEYS = [
  'key_name',
  'model',
  'endpoint',
  'client_ip',
  'group',
  'type',
  'platform',
  'category',
  'status',
  'message',
  'created_at',
  'user_agent'
]
const SORTABLE = new Set(['model', 'status', 'created_at'])

function DetailDialog({ id, onClose }: { id: number | null; onClose: () => void }) {
  const q = useQuery({
    queryKey: ['user', 'usage', 'error-detail', id],
    enabled: id != null,
    queryFn: () => getMyErrorDetail(id as number)
  })
  const d = q.data
  const field = (label: string, value: React.ReactNode) => (
    <div>
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm">{value}</dd>
    </div>
  )
  return (
    <Dialog open={id != null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('usage.errors.detail.title')}</DialogTitle>
          <DialogDescription className="sr-only">{t('usage.errors.detail.title')}</DialogDescription>
        </DialogHeader>
        {q.isLoading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">{t('common.loading')}</p>
        ) : q.isError ? (
          <p className="py-8 text-center text-sm text-destructive">{t('usage.errors.detail.loadFailed')}</p>
        ) : d ? (
          <div className="space-y-4">
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3">
              {field(t('usage.errors.time'), formatDateTime(d.created_at))}
              {field(t('usage.errors.model'), d.model || '-')}
              {field(t('usage.errors.endpoint'), d.inbound_endpoint || '-')}
              {field(
                t('usage.errors.status'),
                <Badge variant={statusCodeVariant(d.status_code)}>{d.status_code || '-'}</Badge>
              )}
              {field(t('usage.errors.category'), t(`usage.errors.categories.${d.category}`))}
              {field(t('usage.errors.platform'), d.platform || '-')}
              {d.upstream_status_code != null
                ? field(t('usage.errors.detail.upstreamStatus'), d.upstream_status_code)
                : null}
            </dl>
            {d.message
              ? field(t('usage.errors.message'), <span className="break-all">{d.message}</span>)
              : null}
            {d.error_body ? (
              <div>
                <p className="text-xs font-medium text-muted-foreground">
                  {t('usage.errors.detail.responseBody')}
                </p>
                <pre className="mt-1 max-h-[40vh] overflow-auto whitespace-pre-wrap break-all rounded-lg border bg-muted p-3 font-mono text-xs">
                  {d.error_body}
                </pre>
              </div>
            ) : null}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

export interface UserErrorRequestsProps {
  rows: UserErrorRequest[]
  loading: boolean
  hiddenColumns: string[]
  sorting: SortingState
  onSortingChange: (u: Updater<SortingState>) => void
  pagination: NonNullable<DataTableProps<UserErrorRequest>['pagination']>
  onIpGeoBatchFailed?: () => void
}

export function UserErrorRequests({
  rows,
  loading,
  hiddenColumns,
  sorting,
  onSortingChange,
  pagination,
  onIpGeoBatchFailed
}: UserErrorRequestsProps) {
  const [detailId, setDetailId] = React.useState<number | null>(null)
  const columns = React.useMemo<ColumnDef<UserErrorRequest, unknown>[]>(() => {
    const defs: ColumnDef<UserErrorRequest, unknown>[] = [
      {
        id: 'key_name',
        header: t('usage.errors.keyName'),
        cell: ({ row }) => (
          <span className="text-sm">
            {row.original.key_name || '-'}
            {row.original.key_deleted ? (
              <Badge variant="secondary" className="ml-1">
                {t('usage.errors.keyDeleted')}
              </Badge>
            ) : null}
          </span>
        )
      },
      {
        id: 'model',
        header: t('usage.errors.model'),
        cell: ({ row }) => <span className="break-all text-sm font-medium">{row.original.model || '-'}</span>
      },
      {
        id: 'endpoint',
        header: t('usage.errors.endpoint'),
        cell: ({ row }) => <span className="break-all text-xs">{row.original.inbound_endpoint || '-'}</span>
      },
      {
        id: 'client_ip',
        header: 'IP',
        cell: ({ row }) =>
          row.original.client_ip ? (
            <div>
              <span className="font-mono text-sm">{row.original.client_ip}</span>
              <IpGeoCell ip={row.original.client_ip} />
            </div>
          ) : (
            '-'
          )
      },
      {
        id: 'group',
        header: t('admin.usage.group'),
        cell: ({ row }) => <span className="text-sm">{row.original.group_name || '-'}</span>
      },
      {
        id: 'type',
        header: t('usage.type'),
        cell: ({ row }) => {
          const kind = numericRequestTypeKind(row.original.request_type, row.original.stream)
          return kind ? <Badge variant={requestTypeVariant(kind)}>{t(requestTypeLabelKey(kind))}</Badge> : '-'
        }
      },
      {
        id: 'platform',
        header: t('usage.errors.platform'),
        cell: ({ row }) => <span className="text-sm">{row.original.platform || '-'}</span>
      },
      {
        id: 'category',
        header: t('usage.errors.category'),
        cell: ({ row }) => (
          <span className="text-sm">{t(`usage.errors.categories.${row.original.category}`)}</span>
        )
      },
      {
        id: 'status',
        header: t('usage.errors.status'),
        cell: ({ row }) => (
          <Badge variant={statusCodeVariant(row.original.status_code)}>
            {row.original.status_code || '-'}
          </Badge>
        )
      },
      {
        id: 'message',
        header: t('usage.errors.message'),
        cell: ({ row }) => (
          <div className="flex max-w-xs items-center gap-1">
            <span className="truncate text-sm" title={row.original.message}>
              {row.original.message || '-'}
            </span>
            <Button
              size="icon"
              variant="ghost"
              className="size-7 shrink-0"
              aria-label={t('usage.errors.detail.title')}
              onClick={() => setDetailId(row.original.id)}
            >
              <Eye aria-hidden />
            </Button>
          </div>
        )
      },
      {
        id: 'created_at',
        header: t('usage.errors.time'),
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-sm text-muted-foreground">
            {formatDateTime(row.original.created_at)}
          </span>
        )
      },
      {
        id: 'user_agent',
        header: t('usage.userAgent'),
        cell: ({ row }) => (
          <span className="block max-w-xs truncate text-sm text-muted-foreground">
            {row.original.user_agent || '-'}
          </span>
        )
      }
    ]
    return defs.map((d) => ({ ...d, enableSorting: SORTABLE.has(d.id as string) }))
  }, [])
  const ips = React.useMemo(
    () => Array.from(new Set(rows.map((r) => r.client_ip).filter((ip): ip is string => Boolean(ip)))),
    [rows]
  )

  return (
    <>
      {!hiddenColumns.includes('client_ip') ? (
        <IpGeoBatchToolbar ips={ips} onFailed={onIpGeoBatchFailed} />
      ) : null}
      <DataTable
        columns={columns}
        data={rows}
        loading={loading}
        getRowId={(r) => String(r.id)}
        columnVisibility={Object.fromEntries(hiddenColumns.map((k) => [k, false]))}
        sorting={sorting}
        onSortingChange={onSortingChange}
        emptyTitle={t('usage.errors.empty')}
        pagination={pagination}
      />
      <DetailDialog id={detailId} onClose={() => setDetailId(null)} />
    </>
  )
}
