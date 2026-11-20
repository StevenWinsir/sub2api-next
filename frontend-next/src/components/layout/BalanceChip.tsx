import { Wallet } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { t } from '@/i18n'
import { useAuthStore } from '@/stores/auth'

export const formatHeaderMoney = (v: number): string => `$${(Number.isFinite(v) ? v : 0).toFixed(2)}`

/** 顶栏余额：可用余额 + 冻结金额徽标；点击查看可用 / 冻结 / 总额。 */
export function BalanceChip() {
  const user = useAuthStore((s) => s.user)
  if (!user) return null
  const available = Number(user.balance || 0)
  const frozen = Number(user.frozen_balance || 0)
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="hidden h-9 items-center gap-2 rounded-md border bg-card px-3 text-sm font-semibold transition-colors hover:bg-muted sm:flex"
          aria-label={t('common.availableBalance')}
        >
          <Wallet className="size-4 text-primary" aria-hidden />
          <span className="tabular">{formatHeaderMoney(available)}</span>
          {frozen > 0 ? (
            <span className="rounded-full bg-warning/15 px-1.5 py-0.5 text-xs font-medium text-warning">
              {`${t('common.frozenBalance')} ${formatHeaderMoney(frozen)}`}
            </span>
          ) : null}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-56 space-y-2 p-3 text-xs">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">{t('common.availableBalance')}</span>
          <span className="tabular font-medium">{formatHeaderMoney(available)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">{t('common.frozenBalance')}</span>
          <span className="tabular font-medium text-warning">{formatHeaderMoney(frozen)}</span>
        </div>
        <div className="flex items-center justify-between border-t pt-2">
          <span className="text-muted-foreground">{t('common.totalBalance')}</span>
          <span className="tabular font-semibold">{formatHeaderMoney(available + frozen)}</span>
        </div>
      </PopoverContent>
    </Popover>
  )
}
