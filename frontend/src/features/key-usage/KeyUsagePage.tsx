/**
 * /key-usage —— 公开的 API Key 用量查询。Key 只在浏览器内通过网关 `GET /v1/usage` 查询（Bearer），不存储。
 * 绕过 Axios 直接 fetch 网关，与 Vue 版一致。
 */
import * as React from 'react'
import {
  CalendarDays,
  CheckCircle2,
  Clock,
  DollarSign,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  ShieldCheck
} from 'lucide-react'
import { buildGatewayUrl } from '@/api/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/stores/app'
import { FeatureFlags, resolveFeatureFlag } from '@/utils/featureFlags'
import { getLocale, t } from '@/i18n'
import { useLocale } from '@/i18n/react'
import {
  buildDateParams,
  buildDetailRows,
  buildRingItems,
  buildStatusInfo,
  buildUsageStatCells,
  fmtNum,
  usd,
  type DailyUsageDays,
  type DateRangeKey,
  type DetailIcon,
  type DetailRow,
  type RingItem,
  type UsageResult
} from './keyUsage'

const CIRCUMFERENCE = 2 * Math.PI * 68
const RING_COLORS = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)']

const TONE_BG: Record<DetailRow['tone'], string> = {
  emerald: 'bg-success/10 text-success',
  amber: 'bg-warning/10 text-warning',
  primary: 'bg-primary/10 text-primary',
  indigo: 'bg-info/10 text-info'
}
const VALUE_TONE: Record<NonNullable<DetailRow['valueTone']>, string> = {
  danger: 'text-destructive',
  warning: 'text-warning',
  success: 'text-success'
}
const DETAIL_ICON: Record<DetailIcon, React.ComponentType<{ className?: string }>> = {
  shield: ShieldCheck,
  calendar: CalendarDays,
  dollar: DollarSign,
  check: CheckCircle2
}

async function fetchUsage(key: string, query: string): Promise<UsageResult> {
  const url = buildGatewayUrl('/v1/usage') + (query ? '?' + query : '')
  const res = await fetch(url, { headers: { Authorization: 'Bearer ' + key } })
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new Error(body?.error?.message || body?.message || `${t('keyUsage.queryFailed')} (${res.status})`)
  }
  return res.json()
}

function Ring({ item, color, animated }: { item: RingItem; color: string; animated: boolean }) {
  const [eased, setEased] = React.useState(0)
  React.useEffect(() => {
    if (!animated || item.isBalance) return
    // 数字缓动到目标百分比（1s，easeOutCubic）；用户偏好减少动效时直接跳到终值
    const duration = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 0 : 1000
    const start = performance.now()
    let raf = 0
    const tick = () => {
      const p = duration === 0 ? 1 : Math.min((performance.now() - start) / duration, 1)
      setEased(Math.round((1 - Math.pow(1 - p, 3)) * item.pct))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [animated, item.pct, item.isBalance])
  const shown = animated && !item.isBalance ? eased : 0

  const offset = !animated
    ? CIRCUMFERENCE
    : item.isBalance
      ? 0
      : CIRCUMFERENCE - (Math.min(item.pct, 100) / 100) * CIRCUMFERENCE
  const Icon = item.iconType === 'clock' ? Clock : item.iconType === 'calendar' ? CalendarDays : DollarSign
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border bg-card p-6">
      <div className="relative size-40">
        <svg
          viewBox="0 0 160 160"
          className="size-full -rotate-90"
          role="img"
          aria-label={`${item.title} ${item.isBalance ? item.amount : `${item.pct}%`}`}
        >
          <circle cx="80" cy="80" r="68" fill="none" stroke="var(--muted)" strokeWidth="10" />
          <circle
            cx="80"
            cy="80"
            r="68"
            fill="none"
            stroke={color}
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={offset}
            style={{ transition: 'stroke-dashoffset 1s cubic-bezier(0.22, 1, 0.36, 1)' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <Icon className="mb-1 size-4 text-muted-foreground" aria-hidden />
          {item.isBalance ? (
            <span className="text-xl font-semibold tabular-nums">{item.amount}</span>
          ) : (
            <span className="text-3xl font-semibold tabular-nums">
              {shown}
              <span className="text-base text-muted-foreground">%</span>
            </span>
          )}
        </div>
      </div>
      <div className="text-center">
        <p className="text-sm font-medium">{item.title}</p>
        {!item.isBalance ? (
          <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">{item.amount}</p>
        ) : null}
      </div>
    </div>
  )
}

const TH = 'px-4 py-2.5 text-right font-medium whitespace-nowrap'
const TD = 'px-4 py-2.5 text-right tabular-nums'

export function KeyUsagePage() {
  useLocale()
  const locale = getLocale()
  const settings = useAppStore((s) => s.cachedPublicSettings)
  const publicSettingsLoaded = useAppStore((s) => s.publicSettingsLoaded)
  const fetchPublicSettings = useAppStore((s) => s.fetchPublicSettings)
  const showInfo = useAppStore((s) => s.showInfo)
  const showSuccess = useAppStore((s) => s.showSuccess)
  const showError = useAppStore((s) => s.showError)
  const subscriptionEnabled = resolveFeatureFlag(settings, FeatureFlags.subscription)

  const [apiKey, setApiKey] = React.useState('')
  const [keyVisible, setKeyVisible] = React.useState(false)
  const [querying, setQuerying] = React.useState(false)
  const [loading, setLoading] = React.useState(false)
  const [data, setData] = React.useState<UsageResult>(null)
  const [range, setRange] = React.useState<DateRangeKey>('today')
  const [custom, setCustom] = React.useState({ start: '', end: '' })
  const [days, setDays] = React.useState<DailyUsageDays>(30)
  const [ringAnimated, setRingAnimated] = React.useState(false)
  const [now, setNow] = React.useState(() => new Date())
  const inFlight = React.useRef(false)

  React.useEffect(() => {
    if (!publicSettingsLoaded) void fetchPublicSettings()
    // 重置倒计时每分钟刷新一次
    const id = window.setInterval(() => setNow(new Date()), 60_000)
    return () => window.clearInterval(id)
  }, [publicSettingsLoaded, fetchPublicSettings])

  const query = async (override?: { range?: DateRangeKey; days?: DailyUsageDays }) => {
    if (inFlight.current) return
    const key = apiKey.trim()
    if (!key) {
      showInfo(t('keyUsage.enterApiKey'))
      return
    }
    inFlight.current = true
    setQuerying(true)
    setLoading(true)
    setData(null)
    setRingAnimated(false)
    try {
      const params = buildDateParams(override?.range ?? range, custom, override?.days ?? days)
      const result = await fetchUsage(key, params)
      setData(result)
      setLoading(false)
      // 下一帧再触发环形动画
      requestAnimationFrame(() => window.setTimeout(() => setRingAnimated(true), 50))
      showSuccess(t('keyUsage.querySuccess'))
    } catch (err) {
      setLoading(false)
      showError((err as Error).message || t('keyUsage.queryFailedRetry'))
    } finally {
      inFlight.current = false
      setQuerying(false)
    }
  }

  const translate = React.useCallback((k: string, o?: Record<string, unknown>) => t(k, o), [])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const status = React.useMemo(() => buildStatusInfo(data, translate), [data, locale])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const rings = React.useMemo(() => buildRingItems(data, translate), [data, locale])
  const detailRows = React.useMemo(
    () => buildDetailRows(data, { t: translate, locale, subscriptionEnabled, now }),
    [data, locale, subscriptionEnabled, now, translate]
  )
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const statCells = React.useMemo(() => buildUsageStatCells(data, translate), [data, locale])
  const modelStats: Array<Record<string, number | string | null>> = data?.model_stats || []
  const dailyRows: Array<Record<string, number | string>> = Array.isArray(data?.daily_usage)
    ? data.daily_usage
    : []
  const showDaily = Boolean(data && Array.isArray(data.daily_usage))

  const ranges: Array<{ key: DateRangeKey; label: string }> = [
    { key: 'today', label: t('keyUsage.dateRangeToday') },
    { key: '7d', label: t('keyUsage.dateRange7d') },
    { key: '30d', label: t('keyUsage.dateRange30d') },
    { key: 'custom', label: t('keyUsage.dateRangeCustom') }
  ]
  const dailyOptions: Array<{ value: DailyUsageDays; label: string }> = [
    { value: 7, label: t('keyUsage.dateRange7d') },
    { value: 30, label: t('keyUsage.dateRange30d') },
    { value: 90, label: t('keyUsage.dateRange90d') }
  ]

  const ringGrid =
    rings.length === 1
      ? 'mx-auto max-w-md grid-cols-1'
      : rings.length === 2
        ? 'md:grid-cols-2'
        : 'md:grid-cols-2 lg:grid-cols-3'

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-10 sm:px-6">
      <header className="space-y-2 text-center">
        <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <KeyRound className="size-6" aria-hidden />
        </div>
        <h1 className="text-3xl font-semibold tracking-tight">{t('keyUsage.title')}</h1>
        <p className="text-muted-foreground">{t('keyUsage.subtitle')}</p>
      </header>

      <form
        className="mx-auto max-w-2xl space-y-3"
        onSubmit={(e) => {
          e.preventDefault()
          void query()
        }}
      >
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Input
              type={keyVisible ? 'text' : 'password'}
              name="api_key"
              autoComplete="off"
              spellCheck={false}
              placeholder={t('keyUsage.placeholder')}
              aria-label={t('keyUsage.title')}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="h-11 pr-10 font-mono"
            />
            <button
              type="button"
              aria-label={keyVisible ? t('ui.common.hidePassword') : t('ui.common.showPassword')}
              aria-pressed={keyVisible}
              onClick={() => setKeyVisible((v) => !v)}
              className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground hover:text-foreground"
            >
              {keyVisible ? (
                <EyeOff className="size-4" aria-hidden />
              ) : (
                <Eye className="size-4" aria-hidden />
              )}
            </button>
          </div>
          <Button type="submit" size="lg" className="h-11" loading={querying}>
            {querying ? t('keyUsage.querying') : t('keyUsage.query')}
          </Button>
        </div>
        <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
          <ShieldCheck className="size-3.5" aria-hidden /> {t('keyUsage.privacyNote')}
        </p>
      </form>

      {loading ? (
        <div className="flex justify-center py-16" role="status">
          <Loader2 className="size-8 animate-spin text-primary" aria-hidden />
        </div>
      ) : null}

      {data ? (
        <div className="space-y-8">
          {/* 日期范围 */}
          <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-muted-foreground">{t('keyUsage.dateRange')}</span>
              <div
                className="inline-flex rounded-md border bg-card p-0.5"
                role="group"
                aria-label={t('keyUsage.dateRange')}
              >
                {ranges.map((r) => (
                  <button
                    key={r.key}
                    type="button"
                    aria-pressed={range === r.key}
                    onClick={() => {
                      setRange(r.key)
                      if (r.key !== 'custom') void query({ range: r.key })
                    }}
                    className={cn(
                      'rounded px-3 py-1 text-sm transition-colors',
                      range === r.key
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
              {range === 'custom' ? (
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    type="date"
                    aria-label="start"
                    value={custom.start}
                    onChange={(e) => setCustom((c) => ({ ...c, start: e.target.value }))}
                    className="w-40"
                  />
                  <span className="text-muted-foreground">–</span>
                  <Input
                    type="date"
                    aria-label="end"
                    value={custom.end}
                    onChange={(e) => setCustom((c) => ({ ...c, end: e.target.value }))}
                    className="w-40"
                  />
                  <Button
                    type="button"
                    size="sm"
                    disabled={!custom.start || !custom.end}
                    onClick={() => void query()}
                  >
                    {t('keyUsage.apply')}
                  </Button>
                </div>
              ) : null}
            </div>
            {status ? (
              <span
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium',
                  status.isActive ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'
                )}
              >
                <span
                  className={cn('size-1.5 rounded-full', status.isActive ? 'bg-success' : 'bg-destructive')}
                />
                {status.label} · {status.statusText}
              </span>
            ) : null}
          </div>

          {/* 环形进度 */}
          {rings.length > 0 ? (
            <div className={cn('grid gap-4', ringGrid)}>
              {rings.map((ring, i) => (
                <Ring
                  key={`${ring.title}-${i}`}
                  item={ring}
                  color={RING_COLORS[i % RING_COLORS.length]}
                  animated={ringAnimated}
                />
              ))}
            </div>
          ) : null}

          {/* 详情 */}
          {detailRows.length > 0 ? (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                {t('keyUsage.detailInfo')}
              </h2>
              <div className="divide-y rounded-lg border bg-card">
                {detailRows.map((row, i) => {
                  const Icon = DETAIL_ICON[row.icon]
                  return (
                    <div key={i} className="flex items-center justify-between gap-4 px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span
                          className={cn(
                            'flex size-8 items-center justify-center rounded-lg',
                            TONE_BG[row.tone]
                          )}
                        >
                          <Icon className="size-4" aria-hidden />
                        </span>
                        <span className="text-sm">{row.label}</span>
                      </div>
                      <span
                        className={cn(
                          'text-right text-sm font-semibold tabular-nums',
                          row.valueTone && VALUE_TONE[row.valueTone]
                        )}
                      >
                        {row.value}
                      </span>
                    </div>
                  )
                })}
              </div>
            </section>
          ) : null}

          {/* Token 统计 */}
          {statCells.length > 0 ? (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                {t('keyUsage.tokenStats')}
              </h2>
              <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
                {statCells.map((cell) => (
                  <div key={cell.label} className="rounded-lg border bg-card p-3">
                    <dt className="text-xs text-muted-foreground">{cell.label}</dt>
                    <dd className="mt-1 text-lg font-semibold tabular-nums">{cell.value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ) : null}

          {/* 每日明细 */}
          {showDaily ? (
            <section className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  {t('keyUsage.dailyDetail')}
                </h2>
                <div className="inline-flex rounded-md border bg-card p-0.5" role="group">
                  {dailyOptions.map((o) => (
                    <button
                      key={o.value}
                      type="button"
                      aria-pressed={days === o.value}
                      onClick={() => {
                        if (days === o.value) return
                        setDays(o.value)
                        if (apiKey.trim()) void query({ days: o.value })
                      }}
                      className={cn(
                        'rounded px-2.5 py-1 text-xs',
                        days === o.value
                          ? 'bg-primary text-primary-foreground'
                          : 'text-muted-foreground hover:text-foreground'
                      )}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="overflow-x-auto rounded-lg border bg-card">
                <table className="w-full min-w-[40rem] text-sm">
                  <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
                    <tr>
                      <th className={cn(TH, 'text-left')}>{t('keyUsage.date')}</th>
                      <th className={TH}>{t('keyUsage.requests')}</th>
                      <th className={TH}>{t('keyUsage.inputTokens')}</th>
                      <th className={TH}>{t('keyUsage.outputTokens')}</th>
                      <th className={TH}>{t('keyUsage.cacheReadTokens')}</th>
                      <th className={TH}>{t('keyUsage.cacheWriteTokens')}</th>
                      <th className={TH}>{t('keyUsage.cost')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dailyRows.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                          {t('keyUsage.noDailyUsage')}
                        </td>
                      </tr>
                    ) : (
                      dailyRows.map((row) => (
                        <tr key={String(row.date)} className="border-b last:border-0">
                          <td className="whitespace-nowrap px-4 py-2.5 font-medium">{row.date}</td>
                          <td className={TD}>{fmtNum(row.requests as number)}</td>
                          <td className={TD}>{fmtNum(row.input_tokens as number)}</td>
                          <td className={TD}>{fmtNum(row.output_tokens as number)}</td>
                          <td className={TD}>{fmtNum(row.cache_read_tokens as number)}</td>
                          <td className={TD}>{fmtNum(row.cache_write_tokens as number)}</td>
                          <td className={cn(TD, 'font-medium')}>
                            {usd((row.actual_cost != null ? row.actual_cost : row.cost) as number)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          {/* 模型统计 */}
          {modelStats.length > 0 ? (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                {t('keyUsage.modelStats')}
              </h2>
              <div className="overflow-x-auto rounded-lg border bg-card">
                <table className="w-full min-w-[44rem] text-sm">
                  <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
                    <tr>
                      <th className={cn(TH, 'text-left')}>{t('keyUsage.model')}</th>
                      <th className={TH}>{t('keyUsage.requests')}</th>
                      <th className={TH}>{t('keyUsage.inputTokens')}</th>
                      <th className={TH}>{t('keyUsage.outputTokens')}</th>
                      <th className={TH}>{t('keyUsage.cacheCreationTokens')}</th>
                      <th className={TH}>{t('keyUsage.cacheReadTokens')}</th>
                      <th className={TH}>{t('keyUsage.totalTokens')}</th>
                      <th className={TH}>{t('keyUsage.cost')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {modelStats.map((m, i) => (
                      <tr key={`${m.model}-${i}`} className="border-b last:border-0">
                        <td className="whitespace-nowrap px-4 py-2.5 font-medium">
                          {(m.model as string) || '-'}
                        </td>
                        <td className={TD}>{fmtNum(m.requests as number)}</td>
                        <td className={TD}>{fmtNum(m.input_tokens as number)}</td>
                        <td className={TD}>{fmtNum(m.output_tokens as number)}</td>
                        <td className={TD}>{fmtNum(m.cache_creation_tokens as number)}</td>
                        <td className={TD}>{fmtNum(m.cache_read_tokens as number)}</td>
                        <td className={TD}>{fmtNum(m.total_tokens as number)}</td>
                        <td className={cn(TD, 'font-medium')}>
                          {usd((m.actual_cost != null ? m.actual_cost : m.cost) as number)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
