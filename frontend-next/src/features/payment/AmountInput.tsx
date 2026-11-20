import * as React from 'react'
import { Input } from '@/components/ui/input'
import { t } from '@/i18n'
import { cn } from '@/lib/utils'
import type { RechargeBonusTier } from '@/types/payment'
import { formatRechargeBonusNumber, quoteRechargeBonus, type RechargeBonusMode } from '@/utils/rechargeBonus'
import { formatPaymentAmount } from './currency'

const DEFAULT_AMOUNTS = [10, 20, 50, 100, 200, 500, 1000, 2000, 5000]
const AMOUNT_PATTERN = /^\d*(\.\d{0,2})?$/

function currencyDigits(currency?: string): number {
  if (!currency) return 2
  try {
    return (
      new Intl.NumberFormat(undefined, { style: 'currency', currency }).resolvedOptions()
        .maximumFractionDigits ?? 2
    )
  } catch {
    return 2
  }
}

export interface AmountInputProps {
  value: number | null
  onChange: (value: number | null) => void
  amounts?: number[]
  /** 0 = 不限 */
  min?: number
  max?: number
  bonusTiers?: RechargeBonusTier[]
  bonusMode?: RechargeBonusMode
  multiplier?: number
  currency?: string
}

/** 金额选择：预设档位（含赠送 / 折扣价签）+ 自定义输入（最多两位小数）。 */
export function AmountInput({
  value,
  onChange,
  amounts = DEFAULT_AMOUNTS,
  min = 0,
  max = 0,
  bonusTiers = [],
  bonusMode = 'bonus',
  multiplier = 1,
  currency
}: AmountInputProps) {
  const [text, setText] = React.useState(value === null ? '' : String(value))
  const [prevValue, setPrevValue] = React.useState(value)
  // 外部值变化（如恢复流程）时同步输入框
  if (value !== prevValue) {
    setPrevValue(value)
    if (value !== null && String(value) !== text) setText(String(value))
  }

  const filtered = amounts.filter((a) => (min <= 0 || a >= min) && (max <= 0 || a <= max))
  const quote = (amt: number) =>
    quoteRechargeBonus(bonusTiers, amt, {
      multiplier,
      mode: bonusMode,
      currencyDigits: currencyDigits(currency)
    })
  const placeholder =
    min > 0 && max > 0
      ? `${min} - ${max}`
      : min > 0
        ? `≥ ${min}`
        : max > 0
          ? `≤ ${max}`
          : t('payment.enterAmount')

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium">{t('payment.amountLabel')}</p>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-5">
        {filtered.map((amt) => {
          const q = bonusTiers.length > 0 ? quote(amt) : null
          const active = value === amt
          return (
            <button
              key={amt}
              type="button"
              aria-pressed={active}
              onClick={() => {
                setText(String(amt))
                onChange(amt)
              }}
              className={cn(
                'relative flex min-h-14 flex-col items-center justify-center rounded-lg border px-2 py-2 text-sm transition-colors',
                active ? 'border-primary bg-accent' : 'bg-card hover:border-foreground/30'
              )}
            >
              {q && q.percent > 0 ? (
                <span className="absolute -top-2 right-1 rounded bg-destructive px-1.5 py-px text-[10px] font-semibold text-destructive-foreground">
                  {bonusMode === 'discount'
                    ? `${formatRechargeBonusNumber(q.percent)}% OFF`
                    : `+${formatRechargeBonusNumber(q.percent)}%`}
                </span>
              ) : null}
              <span className="tabular font-semibold">{amt}</span>
              {q && q.percent > 0 ? (
                <span className="text-[10px] text-muted-foreground">
                  {bonusMode === 'discount'
                    ? t('payment.rechargeBonus.payShort', {
                        amount: formatPaymentAmount(q.payBase, currency)
                      })
                    : t('payment.rechargeBonus.creditedShort', { amount: '$' + q.credited.toFixed(2) })}
                </span>
              ) : null}
            </button>
          )
        })}
      </div>
      <Input
        inputMode="decimal"
        value={text}
        placeholder={placeholder}
        aria-label={t('payment.enterAmount')}
        onChange={(e) => {
          const v = e.target.value
          if (!AMOUNT_PATTERN.test(v)) return
          setText(v)
          const n = parseFloat(v)
          onChange(v !== '' && !Number.isNaN(n) && n > 0 ? n : null)
        }}
      />
    </div>
  )
}
