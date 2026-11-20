/** /affiliate：邀请返利（邀请码 / 链接、返利比例、可转入额度、被邀请用户）。 */
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowRightLeft, Copy, Link2 } from 'lucide-react'
import * as React from 'react'
import userAPI from '@/api/user'
import { EmptyState } from '@/components/EmptyState'
import { PageHeader } from '@/components/PageHeader'
import { StatCard } from '@/components/StatCard'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useClipboard } from '@/hooks/useClipboard'
import { t } from '@/i18n'
import { useLocale } from '@/i18n/react'
import { useAppStore } from '@/stores/app'
import { useAuthStore } from '@/stores/auth'
import { extractApiErrorMessage } from '@/utils/apiError'
import { formatCurrency, formatDateTime } from '@/utils/format'

/** 返利比例为 [0,100] 的百分数；去掉多余的 0（20.00 → "20"，12.50 → "12.5"）。 */
export function formatRebateRate(v: number | undefined): string {
  const rounded = Math.round((v ?? 0) * 100) / 100
  return Number.isInteger(rounded) ? String(rounded) : rounded.toString()
}

export function AffiliatePage() {
  useLocale()
  const queryClient = useQueryClient()
  const refreshUser = useAuthStore((s) => s.refreshUser)
  const codeCopy = useClipboard()
  const linkCopy = useClipboard()
  const [transferring, setTransferring] = React.useState(false)

  const q = useQuery({
    queryKey: ['user', 'affiliate'],
    queryFn: async () => {
      try {
        return await userAPI.getAffiliateDetail()
      } catch (error) {
        useAppStore.getState().showError(extractApiErrorMessage(error, t('affiliate.loadFailed')))
        throw error
      }
    }
  })
  const d = q.data
  // 页面仅在客户端渲染（门禁之后），可直接读取 origin
  const inviteLink = d ? `${window.location.origin}/register?aff=${encodeURIComponent(d.aff_code)}` : ''
  const rate = formatRebateRate(d?.effective_rebate_rate_percent)

  const transfer = async () => {
    if (!d || d.aff_quota <= 0 || transferring) return
    setTransferring(true)
    try {
      const resp = await userAPI.transferAffiliateQuota()
      useAppStore
        .getState()
        .showSuccess(t('affiliate.transfer.success', { amount: formatCurrency(resp.transferred_quota) }))
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['user', 'affiliate'] }),
        refreshUser().catch(() => undefined)
      ])
    } catch (error) {
      useAppStore.getState().showError(extractApiErrorMessage(error, t('affiliate.transferFailed')))
    } finally {
      setTransferring(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t('affiliate.title')} description={t('affiliate.description')} />

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          loading={q.isLoading}
          label={t('affiliate.stats.rebateRate')}
          value={`${rate}%`}
          hint={t('affiliate.stats.rebateRateHint')}
        />
        <StatCard
          loading={q.isLoading}
          label={t('affiliate.stats.invitedUsers')}
          value={(d?.aff_count ?? 0).toLocaleString()}
        />
        <StatCard
          loading={q.isLoading}
          label={t('affiliate.stats.availableQuota')}
          value={formatCurrency(d?.aff_quota ?? 0)}
          hint={
            d && d.aff_frozen_quota > 0
              ? `${t('affiliate.stats.frozenQuota')}: ${formatCurrency(d.aff_frozen_quota)}`
              : undefined
          }
        />
        <StatCard
          loading={q.isLoading}
          label={t('affiliate.stats.totalQuota')}
          value={formatCurrency(d?.aff_history_quota ?? 0)}
        />
      </section>

      {d ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t('affiliate.title')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1.5">
                  <p className="text-sm font-medium">{t('affiliate.yourCode')}</p>
                  <div className="flex gap-2">
                    <Input
                      readOnly
                      value={d.aff_code}
                      className="font-mono"
                      aria-label={t('affiliate.yourCode')}
                    />
                    <Button variant="outline" onClick={() => void codeCopy.copy(d.aff_code, { toast: true })}>
                      <Copy aria-hidden />
                      {t('affiliate.copyCode')}
                    </Button>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <p className="text-sm font-medium">{t('affiliate.inviteLink')}</p>
                  <div className="flex gap-2">
                    <Input
                      readOnly
                      value={inviteLink}
                      className="font-mono"
                      aria-label={t('affiliate.inviteLink')}
                    />
                    <Button variant="outline" onClick={() => void linkCopy.copy(inviteLink, { toast: true })}>
                      <Link2 aria-hidden />
                      {t('affiliate.copyLink')}
                    </Button>
                  </div>
                </div>
              </div>
              <div className="rounded-lg border bg-accent/50 p-4">
                <p className="text-sm font-medium">{t('affiliate.tips.title')}</p>
                <ol className="mt-2 space-y-1 text-sm text-muted-foreground">
                  <li>1. {t('affiliate.tips.line1')}</li>
                  <li>2. {t('affiliate.tips.line2', { rate: `${rate}%` })}</li>
                  <li>3. {t('affiliate.tips.line3')}</li>
                  {d.aff_frozen_quota > 0 ? <li>4. {t('affiliate.tips.line4')}</li> : null}
                </ol>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex flex-wrap items-center justify-between gap-4 p-6">
              <div>
                <h3 className="text-base font-semibold">{t('affiliate.transfer.title')}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{t('affiliate.transfer.description')}</p>
                {d.aff_quota <= 0 ? (
                  <p className="mt-2 text-sm text-warning">{t('affiliate.transfer.empty')}</p>
                ) : null}
              </div>
              <Button onClick={() => void transfer()} disabled={d.aff_quota <= 0} loading={transferring}>
                <ArrowRightLeft aria-hidden />
                {transferring ? t('affiliate.transfer.transferring') : t('affiliate.transfer.button')}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t('affiliate.invitees.title')}</CardTitle>
            </CardHeader>
            <CardContent>
              {(d.invitees ?? []).length === 0 ? (
                <EmptyState title={t('affiliate.invitees.empty')} />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b text-xs uppercase text-muted-foreground">
                        <th className="px-3 py-2 font-medium">{t('affiliate.invitees.columns.email')}</th>
                        <th className="px-3 py-2 font-medium">{t('affiliate.invitees.columns.username')}</th>
                        <th className="px-3 py-2 text-right font-medium">
                          {t('affiliate.invitees.columns.rebate')}
                        </th>
                        <th className="px-3 py-2 font-medium">{t('affiliate.invitees.columns.joinedAt')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(d.invitees ?? []).map((item) => (
                        <tr key={item.user_id} className="border-b last:border-0">
                          <td className="px-3 py-2">{item.email}</td>
                          <td className="px-3 py-2">{item.username || '-'}</td>
                          <td className="tabular px-3 py-2 text-right">
                            {formatCurrency(item.total_rebate)}
                          </td>
                          <td className="px-3 py-2 text-muted-foreground">
                            {item.created_at ? formatDateTime(item.created_at) : '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  )
}
