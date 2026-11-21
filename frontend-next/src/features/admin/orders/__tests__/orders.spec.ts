import { describe, expect, it } from 'vitest'
import { formatCurrencyAmounts, sumCurrencyAmounts } from '../OrdersDashboardPage'
import { buildPlanPayload, planToForm } from '../PlansPage'

describe('currency amounts', () => {
  it('formats per currency and drops zero entries', () => {
    expect(formatCurrencyAmounts({ CNY: 12, USD: 0 }, 'en')).toContain('12')
    expect(formatCurrencyAmounts({ CNY: 12, USD: 0 }, 'en')).not.toContain('·')
    expect(formatCurrencyAmounts({}, 'en')).toContain('0')
    expect(sumCurrencyAmounts({ CNY: 1, USD: 2 })).toBe(3)
  })
})

describe('plan payload', () => {
  const base = planToForm(null)
  it('validates group, price and validity in order', () => {
    expect(buildPlanPayload(base)).toEqual({ error: 'payment.admin.groupRequired' })
    expect(buildPlanPayload({ ...base, groupId: '3' })).toEqual({ error: 'payment.admin.priceRequired' })
    expect(buildPlanPayload({ ...base, groupId: '3', price: '9.9', validityDays: '0' })).toEqual({
      error: 'payment.admin.validityRequired'
    })
  })
  it('builds the snake_case payload with newline-joined features and upper-cased currency', () => {
    const r = buildPlanPayload({
      ...base,
      name: 'Pro',
      groupId: '3',
      price: '9.9',
      currency: ' nzd ',
      features: ' a \n\n b '
    })
    if ('error' in r) throw new Error(r.error)
    expect(r.payload).toMatchObject({
      name: 'Pro',
      group_id: 3,
      price: 9.9,
      currency: 'NZD',
      validity_days: 30,
      validity_unit: 'days',
      for_sale: true,
      features: 'a\nb'
    })
  })
})
