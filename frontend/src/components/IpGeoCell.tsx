import * as React from 'react'
import { Loader2, RefreshCw } from 'lucide-react'
import { fetchBatch, fetchOne, getEntry, getIpGeoVersion, subscribeIpGeo } from '@/utils/ipGeoLookup'
import { Button } from '@/components/ui/button'
import { t } from '@/i18n'

/** IP 归属地缓存的订阅（版本号变化触发重渲染）。 */
function useIpGeoVersion(): number {
  return React.useSyncExternalStore(subscribeIpGeo, getIpGeoVersion, () => 0)
}

/** 单个 IP 的归属地单元格：按需查询、本地缓存（沿用 sub2api:ip-geo-cache:v1）。 */
export function IpGeoCell({ ip }: { ip: string }) {
  useIpGeoVersion()
  const entry = getEntry(ip)
  const d = entry.detail
  const tip = d
    ? [
        d.organization ? `${t('usage.ipGeo.detailOrg')}: ${d.organization}` : '',
        d.timezone ? `${t('usage.ipGeo.detailTimezone')}: ${d.timezone}` : '',
        d.accuracy != null ? `${t('usage.ipGeo.detailAccuracy')}: ${d.accuracy}km` : '',
        d.latitude && d.longitude
          ? `${t('usage.ipGeo.detailCoordinates')}: ${d.latitude}, ${d.longitude}`
          : ''
      ]
        .filter(Boolean)
        .join('\n')
    : ''
  const link = 'text-xs underline decoration-dashed underline-offset-2 hover:text-foreground'
  if (entry.status === 'idle')
    return (
      <button type="button" className={`${link} text-primary`} onClick={() => void fetchOne(ip)}>
        {t('usage.ipGeo.fetch')}
      </button>
    )
  if (entry.status === 'loading')
    return (
      <span className="flex items-center gap-1 text-xs text-muted-foreground">
        <Loader2 className="size-3 animate-spin" aria-hidden /> {t('usage.ipGeo.fetching')}
      </span>
    )
  if (entry.status === 'success')
    return (
      <span className="flex items-center gap-1 text-xs text-muted-foreground">
        <span className="truncate" title={tip}>
          {entry.label}
        </span>
        <button
          type="button"
          title={t('usage.ipGeo.refreshTitle')}
          aria-label={t('usage.ipGeo.refreshTitle')}
          onClick={() => void fetchOne(ip, true)}
        >
          <RefreshCw className="size-3" aria-hidden />
        </button>
      </span>
    )
  if (entry.status === 'error')
    return (
      <button type="button" className={`${link} text-destructive`} onClick={() => void fetchOne(ip)}>
        {t('usage.ipGeo.failed')}
      </button>
    )
  return <span className="text-xs text-muted-foreground">{t('usage.ipGeo.private')}</span>
}

/** 批量查询当前页全部 IP 的归属地。 */
export function IpGeoBatchToolbar({ ips, onFailed }: { ips: string[]; onFailed?: () => void }) {
  useIpGeoVersion()
  const [loading, setLoading] = React.useState(false)
  const pending = ips.filter((ip) => {
    const s = getEntry(ip).status
    return s === 'idle' || s === 'error'
  }).length
  return (
    <div className="flex items-center justify-end gap-2 border-b px-3 py-1.5">
      {pending > 0 ? (
        <span className="text-xs text-muted-foreground">{t('usage.ipGeo.pending', { count: pending })}</span>
      ) : null}
      <Button
        size="sm"
        variant="ghost"
        disabled={loading || pending === 0}
        onClick={async () => {
          setLoading(true)
          try {
            if (!(await fetchBatch(ips))) onFailed?.()
          } finally {
            setLoading(false)
          }
        }}
      >
        {loading ? t('usage.ipGeo.batchFetching') : t('usage.ipGeo.batchFetch')}
      </Button>
    </div>
  )
}
