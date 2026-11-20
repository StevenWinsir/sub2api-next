/** /redeem：兑换码兑换 + 近期兑换记录。 */
import * as React from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Gift, Wallet, XCircle } from 'lucide-react'
import { authAPI } from '@/api/auth'
import { redeemAPI, type RedeemHistoryItem } from '@/api/redeem'
import { EmptyState } from '@/components/EmptyState'
import { PageHeader } from '@/components/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Pagination } from '@/components/ui/pagination'
import { t } from '@/i18n'
import { useLocale } from '@/i18n/react'
import { useAppStore } from '@/stores/app'
import { useAuthStore } from '@/stores/auth'
import { useSubscriptionStore } from '@/stores/subscriptions'
import { extractApiErrorMessage } from '@/utils/apiError'
import { formatDateTime } from '@/utils/format'

type RedeemResult = Awaited<ReturnType<typeof redeemAPI.redeem>> & {
  group_name?: string
  validity_days?: number
}

const isBalanceType = (type: string) => type === 'balance' || type === 'admin_balance'
const isAdminAdjustment = (type: string) => type === 'admin_balance' || type === 'admin_concurrency'

export function historyTitle(item: Pick<RedeemHistoryItem, 'type' | 'value'>): string {
  switch (item.type) {
    case 'balance':
      return t('redeem.balanceAddedRedeem')
    case 'admin_balance':
      return item.value >= 0 ? t('redeem.balanceAddedAdmin') : t('redeem.balanceDeductedAdmin')
    case 'concurrency':
      return t('redeem.concurrencyAddedRedeem')
    case 'admin_concurrency':
      return item.value >= 0 ? t('redeem.concurrencyAddedAdmin') : t('redeem.concurrencyReducedAdmin')
    case 'subscription':
      return t('redeem.subscriptionAssigned')
    default:
      return t('common.unknown')
  }
}

export function historyValue(item: RedeemHistoryItem): string {
  if (isBalanceType(item.type)) return `${item.value >= 0 ? '+' : ''}$${item.value.toFixed(2)}`
  if (item.type === 'subscription') {
    const days = item.validity_days || Math.round(item.value)
    const group = item.group?.name || ''
    return group ? `${days}${t('redeem.days')} - ${group}` : `${days}${t('redeem.days')}`
  }
  return `${item.value >= 0 ? '+' : ''}${item.value} ${t('redeem.requests')}`
}

export function RedeemPage() {
  useLocale()
  const queryClient = useQueryClient()
  const user = useAuthStore((s) => s.user)
  const refreshUser = useAuthStore((s) => s.refreshUser)
  const fetchActiveSubscriptions = useSubscriptionStore((s) => s.fetchActiveSubscriptions)
  const { showError, showSuccess, showWarning } = useAppStore.getState()
  const [code, setCode] = React.useState('')
  const [submitting, setSubmitting] = React.useState(false)
  const [result, setResult] = React.useState<RedeemResult | null>(null)
  const [error, setError] = React.useState('')
  const [page, setPage] = React.useState(1)
  const [pageSize, setPageSize] = React.useState(20)

  const history = useQuery({
    queryKey: ['user', 'redeem', 'history', page, pageSize],
    queryFn: () => redeemAPI.getHistory(page, pageSize),
    placeholderData: (p) => p
  })
  const settings = useQuery({
    queryKey: ['public-settings'],
    queryFn: () => authAPI.getPublicSettings(),
    staleTime: 300_000
  })
  const contactInfo = settings.data?.contact_info || ''

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!code.trim()) return showError(t('redeem.pleaseEnterCode'))
    setSubmitting(true)
    setError('')
    setResult(null)
    try {
      const r = await redeemAPI.redeem(code.trim())
      setResult(r)
      try {
        await refreshUser()
      } catch (err) {
        console.error('Failed to refresh user after redeem:', err)
        showWarning(t('redeem.userRefreshFailed'))
      }
      if (r.type === 'subscription') {
        try {
          await fetchActiveSubscriptions(true)
        } catch (err) {
          console.error('Failed to refresh subscriptions after redeem:', err)
          showWarning(t('redeem.subscriptionRefreshFailed'))
        }
      }
      setCode('')
      setPage(1)
      await queryClient.invalidateQueries({ queryKey: ['user', 'redeem', 'history'] })
      showSuccess(t('redeem.codeRedeemSuccess'))
    } catch (err) {
      setError(extractApiErrorMessage(err, t('redeem.failedToRedeem')))
      showError(t('redeem.redeemFailed'))
    } finally {
      setSubmitting(false)
    }
  }

  const items = history.data?.items ?? []
  const total = history.data?.total ?? 0

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title={t('redeem.title')} description={t('redeem.description')} />

      <Card className="bg-primary text-primary-foreground">
        <CardContent className="flex items-center justify-between gap-4 p-6">
          <div>
            <p className="text-sm opacity-80">{t('redeem.currentBalance')}</p>
            <p className="tabular text-3xl font-semibold">${(user?.balance ?? 0).toFixed(2)}</p>
            <p className="mt-1 text-xs opacity-80">
              {t('redeem.concurrency')}: {user?.concurrency || 0} {t('redeem.requests')}
            </p>
          </div>
          <Wallet className="size-10 opacity-60" aria-hidden />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6">
          <form onSubmit={submit} className="space-y-3">
            <label htmlFor="redeem-code" className="text-sm font-medium">
              {t('redeem.redeemCodeLabel')}
            </label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                id="redeem-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder={t('redeem.redeemCodePlaceholder')}
                autoComplete="off"
                className="h-10 font-mono"
                disabled={submitting}
              />
              <Button type="submit" size="lg" loading={submitting} disabled={!code.trim()}>
                <Gift aria-hidden />
                {submitting ? t('redeem.redeeming') : t('redeem.redeemButton')}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">{t('redeem.redeemCodeHint')}</p>
          </form>
        </CardContent>
      </Card>

      {result ? (
        <div role="status" className="flex gap-3 rounded-lg border border-success/40 bg-success/10 p-4">
          <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" aria-hidden />
          <div className="space-y-1 text-sm">
            <p className="font-medium">{t('redeem.redeemSuccess')}</p>
            {result.type === 'balance' ? (
              <p>
                {t('redeem.added')}: ${result.value.toFixed(2)}
              </p>
            ) : result.type === 'concurrency' ? (
              <p>
                {t('redeem.added')}: {result.value} {t('redeem.concurrentRequests')}
              </p>
            ) : (
              <p>
                {t('redeem.subscriptionAssigned')}
                {result.group_name ? ` - ${result.group_name}` : ''}
                {result.validity_days
                  ? ` ${t('redeem.subscriptionDays', { days: result.validity_days })}`
                  : ''}
              </p>
            )}
            {result.new_balance !== undefined ? (
              <p>
                {t('redeem.newBalance')}: <b className="tabular">${result.new_balance.toFixed(2)}</b>
              </p>
            ) : null}
            {result.new_concurrency !== undefined ? (
              <p>
                {t('redeem.newConcurrency')}:{' '}
                <b className="tabular">
                  {result.new_concurrency} {t('redeem.requests')}
                </b>
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      {error ? (
        <div
          role="alert"
          className="flex gap-3 rounded-lg border border-destructive/40 bg-destructive/10 p-4"
        >
          <XCircle className="mt-0.5 size-5 shrink-0 text-destructive" aria-hidden />
          <div className="text-sm">
            <p className="font-medium">{t('redeem.redeemFailed')}</p>
            <p className="mt-1">{error}</p>
          </div>
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">{t('redeem.aboutCodes')}</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            <li>{t('redeem.codeRule1')}</li>
            <li>{t('redeem.codeRule2')}</li>
            <li>
              {t('redeem.codeRule3')}
              {contactInfo ? <span className="ml-1 font-medium text-foreground">({contactInfo})</span> : null}
            </li>
            <li>{t('redeem.codeRule4')}</li>
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('redeem.recentActivity')}</CardTitle>
        </CardHeader>
        <CardContent>
          {history.isLoading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">{t('common.loading')}</p>
          ) : items.length === 0 ? (
            <EmptyState title={t('redeem.historyWillAppear')} />
          ) : (
            <ul className="divide-y">
              {items.map((item) => (
                <li key={item.id} className="flex items-start justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{historyTitle(item)}</p>
                    <p className="text-xs text-muted-foreground">{formatDateTime(item.used_at)}</p>
                    {isAdminAdjustment(item.type) ? (
                      <Badge variant="secondary" className="mt-1">
                        {t('redeem.adminAdjustment')}
                      </Badge>
                    ) : null}
                    {item.notes ? <p className="mt-1 text-xs text-muted-foreground">{item.notes}</p> : null}
                  </div>
                  <p
                    className={`tabular shrink-0 text-sm font-semibold ${item.value >= 0 ? 'text-success' : 'text-destructive'}`}
                  >
                    {historyValue(item)}
                  </p>
                </li>
              ))}
            </ul>
          )}
          {total > 0 ? (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t pt-3 text-sm text-muted-foreground">
              <span>
                {t('common.total')}: {total} {t('pagination.results')}
              </span>
              <label className="flex items-center gap-2">
                {t('pagination.perPage')}
                <select
                  className="h-8 rounded-md border bg-card px-2 text-sm"
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value))
                    setPage(1)
                  }}
                >
                  {[20, 50, 100].map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
              <Pagination
                page={page}
                pageCount={Math.max(1, Math.ceil(total / pageSize))}
                onPageChange={setPage}
              />
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}
