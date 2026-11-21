/** /admin/orders/plans：订阅套餐管理（列表 / 创建编辑 / 上下架 / 删除）。载荷与 Vue 版 PlanEditDialog 一致（features 为换行分隔字符串）。 */
import * as React from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { Plus, RefreshCw } from 'lucide-react'
import { adminAPI } from '@/api/admin'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { DataTable } from '@/components/DataTable'
import { FormField } from '@/components/FormField'
import { NativeSelect } from '@/components/NativeSelect'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { Input, Textarea } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { AdminFormDialog } from '@/features/admin/common/AdminFormDialog'
import { numOrUndef, str } from '@/features/admin/common/fieldUtils'
import { notifyError } from '@/features/admin/common/notify'
import { RowActions } from '@/features/admin/common/RowActions'
import { useAdminAction } from '@/features/admin/common/useAdminAction'
import { formatPaymentAmount } from '@/features/payment/currency'
import { t } from '@/i18n'
import { useLocale } from '@/i18n/react'
import type { SubscriptionPlan } from '@/types/payment'

export interface PlanFormValues {
  name: string
  groupId: string
  description: string
  price: string
  originalPrice: string
  currency: string
  validityDays: string
  validityUnit: string
  sortOrder: string
  forSale: boolean
  features: string
}

export function planToForm(plan: SubscriptionPlan | null): PlanFormValues {
  return {
    name: plan?.name ?? '',
    groupId: plan ? String(plan.group_id) : '',
    description: plan?.description ?? '',
    price: str(plan?.price ?? 0),
    originalPrice: str(plan?.original_price ?? 0),
    currency: plan?.currency ?? '',
    validityDays: str(plan?.validity_days ?? 30),
    validityUnit: plan?.validity_unit || 'days',
    sortOrder: str(plan?.sort_order ?? 0),
    forSale: plan?.for_sale ?? true,
    features: (plan?.features ?? []).join('\n')
  }
}

/** 校验并构造提交载荷（与 Vue 版 buildPlanPayload 一致）；失败返回 i18n 键。 */
export function buildPlanPayload(
  f: PlanFormValues
): { payload: Record<string, unknown> } | { error: string } {
  const price = numOrUndef(f.price)
  const validity = numOrUndef(f.validityDays)
  if (!f.groupId) return { error: 'payment.admin.groupRequired' }
  if (!price || price <= 0) return { error: 'payment.admin.priceRequired' }
  if (!validity || validity < 1) return { error: 'payment.admin.validityRequired' }
  return {
    payload: {
      name: f.name,
      group_id: Number(f.groupId),
      description: f.description,
      price,
      original_price: numOrUndef(f.originalPrice) || 0,
      currency: f.currency.trim().toUpperCase(),
      validity_days: validity,
      validity_unit: f.validityUnit,
      sort_order: numOrUndef(f.sortOrder) ?? 0,
      for_sale: f.forSale,
      features: f.features
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean)
        .join('\n')
    }
  }
}

function PlanDialog({
  plan,
  onClose,
  onSaved
}: {
  plan: SubscriptionPlan | null
  onClose: () => void
  onSaved: () => void
}) {
  const { busy, run } = useAdminAction()
  const groups = useQuery({
    queryKey: ['admin', 'groups', 'all-including-inactive'],
    queryFn: () => adminAPI.groups.getAllIncludingInactive()
  })
  const [f, setF] = React.useState<PlanFormValues>(() => planToForm(plan))
  const set = <K extends keyof PlanFormValues>(k: K, v: PlanFormValues[K]) => setF((p) => ({ ...p, [k]: v }))
  const subGroups = (groups.data ?? []).filter((g) => g.subscription_type === 'subscription')

  const submit = async () => {
    const built = buildPlanPayload(f)
    if ('error' in built) {
      notifyError(new Error(t(built.error)))
      return
    }
    const ok = await run(
      () =>
        plan
          ? adminAPI.payment.updatePlan(plan.id, built.payload)
          : adminAPI.payment.createPlan(built.payload),
      { success: t('common.saved'), fallback: t('common.error') }
    )
    if (ok) onSaved()
  }

  return (
    <AdminFormDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={plan ? t('payment.admin.editPlan') : t('payment.admin.createPlan')}
      onSubmit={submit}
      submitting={busy}
      size="lg"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label={t('payment.admin.planName')} required>
          <Input value={f.name} onChange={(e) => set('name', e.target.value)} />
        </FormField>
        <FormField label={t('payment.admin.group')} required>
          <NativeSelect value={f.groupId} onChange={(e) => set('groupId', e.target.value)}>
            <option value="">{t('payment.admin.selectGroup')}</option>
            {subGroups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField label={t('payment.admin.price')} required>
          <Input
            type="number"
            min={0}
            step="0.01"
            value={f.price}
            onChange={(e) => set('price', e.target.value)}
          />
        </FormField>
        <FormField label={t('payment.admin.originalPrice')}>
          <Input
            type="number"
            min={0}
            step="0.01"
            value={f.originalPrice}
            onChange={(e) => set('originalPrice', e.target.value)}
          />
        </FormField>
        <FormField label={t('payment.admin.currency')} description={t('payment.admin.currencyHint')}>
          <Input
            value={f.currency}
            onChange={(e) => set('currency', e.target.value)}
            placeholder={t('payment.admin.currencyPlaceholder')}
            maxLength={8}
          />
        </FormField>
        <FormField label={t('payment.admin.sortOrder')}>
          <Input type="number" value={f.sortOrder} onChange={(e) => set('sortOrder', e.target.value)} />
        </FormField>
        <FormField label={t('payment.admin.validity')} required>
          <Input
            type="number"
            min={1}
            value={f.validityDays}
            onChange={(e) => set('validityDays', e.target.value)}
          />
        </FormField>
        <FormField label={t('payment.admin.validityUnit')}>
          <NativeSelect value={f.validityUnit} onChange={(e) => set('validityUnit', e.target.value)}>
            <option value="days">{t('payment.admin.days')}</option>
            <option value="weeks">{t('payment.admin.weeks')}</option>
            <option value="months">{t('payment.admin.months')}</option>
          </NativeSelect>
        </FormField>
        <FormField label={t('payment.admin.planDescription')} className="sm:col-span-2">
          <Textarea rows={2} value={f.description} onChange={(e) => set('description', e.target.value)} />
        </FormField>
        <FormField
          label={t('payment.admin.features')}
          description={t('payment.admin.featuresHint')}
          className="sm:col-span-2"
        >
          <Textarea
            rows={4}
            value={f.features}
            onChange={(e) => set('features', e.target.value)}
            placeholder={t('payment.admin.featuresPlaceholder')}
          />
        </FormField>
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={f.forSale} onCheckedChange={(v) => set('forSale', v)} />
          {f.forSale ? t('payment.admin.onSale') : t('payment.admin.offSale')}
        </label>
      </div>
    </AdminFormDialog>
  )
}

type Dlg = { kind: 'form'; plan: SubscriptionPlan | null } | { kind: 'delete'; plan: SubscriptionPlan } | null

export function PlansPage() {
  const locale = useLocale()
  const qc = useQueryClient()
  const { busy, run } = useAdminAction()
  const [dlg, setDlg] = React.useState<Dlg>(null)
  const query = useQuery({
    queryKey: ['admin', 'payment', 'plans'],
    queryFn: async () => {
      const res = await adminAPI.payment.getPlans()
      // 后端以换行分隔字符串返回 features，这里解析为数组
      return (res.data ?? []).map((p) => {
        const raw = p.features as unknown as string | string[]
        return {
          ...p,
          features:
            typeof raw === 'string'
              ? raw
                  .split('\n')
                  .map((s) => s.trim())
                  .filter(Boolean)
              : (raw ?? [])
        }
      })
    }
  })
  const refresh = () => qc.invalidateQueries({ queryKey: ['admin', 'payment', 'plans'] })

  const cols = React.useMemo<ColumnDef<SubscriptionPlan, unknown>[]>(
    () => [
      {
        id: 'id',
        header: 'ID',
        cell: ({ row }) => <span className="tabular text-muted-foreground">#{row.original.id}</span>
      },
      {
        id: 'name',
        header: t('payment.admin.planName'),
        cell: ({ row }) => <span className="font-medium">{row.original.name}</span>
      },
      {
        id: 'group',
        header: t('payment.admin.group'),
        cell: ({ row }) => row.original.group_name ?? `#${row.original.group_id}`
      },
      {
        id: 'price',
        header: t('payment.admin.price'),
        cell: ({ row }) => (
          <span className="tabular">
            {formatPaymentAmount(row.original.price, row.original.currency, locale)}
          </span>
        )
      },
      {
        id: 'validity',
        header: t('payment.admin.validity'),
        cell: ({ row }) =>
          `${row.original.validity_days} ${t(`payment.admin.${row.original.validity_unit || 'days'}`)}`
      },
      {
        id: 'for_sale',
        header: t('payment.admin.forSale'),
        cell: ({ row }) => (
          <Switch
            checked={row.original.for_sale}
            aria-label={`${t('payment.admin.forSale')} ${row.original.name}`}
            onCheckedChange={async (v) => {
              const ok = await run(() => adminAPI.payment.updatePlan(row.original.id, { for_sale: v }), {})
              if (ok) void refresh()
            }}
          />
        )
      },
      {
        id: 'sort',
        header: t('payment.admin.sortOrder'),
        cell: ({ row }) => <span className="tabular">{row.original.sort_order}</span>
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">{t('common.actions')}</span>,
        cell: ({ row }) => (
          <RowActions
            actions={[
              {
                key: 'edit',
                label: t('common.edit'),
                onSelect: () => setDlg({ kind: 'form', plan: row.original })
              },
              {
                key: 'delete',
                separator: true,
                label: t('common.delete'),
                destructive: true,
                onSelect: () => setDlg({ kind: 'delete', plan: row.original })
              }
            ]}
          />
        )
      }
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 只依赖语言
    [locale]
  )

  return (
    <div>
      <PageHeader
        title={t('payment.admin.plansPageTitle')}
        description={t('payment.admin.plansPageDesc')}
        actions={
          <>
            <Button variant="outline" aria-label={t('common.refresh')} onClick={() => void refresh()}>
              <RefreshCw className={query.isFetching ? 'animate-spin' : undefined} aria-hidden />
            </Button>
            <Button onClick={() => setDlg({ kind: 'form', plan: null })}>
              <Plus aria-hidden />
              {t('payment.admin.createPlan')}
            </Button>
          </>
        }
      />
      <DataTable
        columns={cols}
        data={query.data ?? []}
        loading={query.isLoading}
        getRowId={(p) => String(p.id)}
      />
      {dlg?.kind === 'form' ? (
        <PlanDialog
          plan={dlg.plan}
          onClose={() => setDlg(null)}
          onSaved={() => {
            setDlg(null)
            void refresh()
          }}
        />
      ) : null}
      <ConfirmDialog
        open={dlg?.kind === 'delete'}
        onOpenChange={(o) => !o && setDlg(null)}
        title={t('payment.admin.deletePlan')}
        description={t('payment.admin.deletePlanConfirm')}
        destructive
        confirmText={t('common.delete')}
        loading={busy}
        onConfirm={async () => {
          if (dlg?.kind !== 'delete') return
          const p = dlg.plan
          const ok = await run(() => adminAPI.payment.deletePlan(p.id), { success: t('common.deleted') })
          if (ok) {
            setDlg(null)
            void refresh()
          }
        }}
      />
    </div>
  )
}
