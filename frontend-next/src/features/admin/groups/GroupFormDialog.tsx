/** 分组创建 / 编辑：基础、计费（订阅限额 / 图片 / 高峰）、调度与过滤、模型白名单四个分区。 */
import * as React from 'react'
import { adminAPI } from '@/api/admin'
import { FormField } from '@/components/FormField'
import { NativeSelect } from '@/components/NativeSelect'
import { Checkbox } from '@/components/ui/checkbox'
import { Input, Textarea } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { GROUP_PLATFORM_OPTIONS } from '@/constants/platforms'
import { AdminFormDialog } from '@/features/admin/common/AdminFormDialog'
import { numOrNull, numOrUndef, str } from '@/features/admin/common/fieldUtils'
import { useAdminAction } from '@/features/admin/common/useAdminAction'
import { t } from '@/i18n'
import type { AdminGroup, CreateGroupRequest, GroupPlatform, UpdateGroupRequest } from '@/types'

interface Props {
  group: AdminGroup | null
  allGroups: AdminGroup[]
  onClose: () => void
  onSaved: () => void
}

const TOKEN_PLATFORMS = new Set(['anthropic', 'openai', 'gemini', 'antigravity', 'grok'])

function Toggle({
  label,
  hint,
  checked,
  onChange
}: {
  label: string
  hint?: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label className="flex items-start justify-between gap-4 rounded-md border bg-card p-3 text-sm">
      <span className="space-y-0.5">
        <span className="block font-medium">{label}</span>
        {hint ? <span className="block text-xs text-muted-foreground">{hint}</span> : null}
      </span>
      <Switch checked={checked} onCheckedChange={onChange} aria-label={label} />
    </label>
  )
}

export function GroupFormDialog({ group, allGroups, onClose, onSaved }: Props) {
  const editing = !!group
  const { busy, run } = useAdminAction()
  const [name, setName] = React.useState(group?.name ?? '')
  const [description, setDescription] = React.useState(group?.description ?? '')
  const [platform, setPlatform] = React.useState<GroupPlatform>(group?.platform ?? 'anthropic')
  const [rate, setRate] = React.useState(str(group?.rate_multiplier ?? 1))
  const [exclusive, setExclusive] = React.useState(group?.is_exclusive ?? false)
  const [status, setStatus] = React.useState<'active' | 'inactive'>(group?.status ?? 'active')
  const [subType, setSubType] = React.useState<'standard' | 'subscription'>(
    group?.subscription_type ?? 'standard'
  )
  const [daily, setDaily] = React.useState(str(group?.daily_limit_usd))
  const [weekly, setWeekly] = React.useState(str(group?.weekly_limit_usd))
  const [monthly, setMonthly] = React.useState(str(group?.monthly_limit_usd))
  const [rpm, setRpm] = React.useState(str(group?.rpm_limit ?? 0))
  const [claudeCodeOnly, setClaudeCodeOnly] = React.useState(group?.claude_code_only ?? false)
  const [fallbackId, setFallbackId] = React.useState(str(group?.fallback_group_id))
  const [fallbackInvalidId, setFallbackInvalidId] = React.useState(
    str(group?.fallback_group_id_on_invalid_request)
  )
  const [oauthOnly, setOauthOnly] = React.useState(group?.require_oauth_only ?? false)
  const [privacySet, setPrivacySet] = React.useState(group?.require_privacy_set ?? false)
  const [allowImage, setAllowImage] = React.useState(group?.allow_image_generation ?? false)
  const [img1k, setImg1k] = React.useState(str(group?.image_price_1k))
  const [img2k, setImg2k] = React.useState(str(group?.image_price_2k))
  const [img4k, setImg4k] = React.useState(str(group?.image_price_4k))
  const [peak, setPeak] = React.useState(group?.peak_rate_enabled ?? false)
  const [peakStart, setPeakStart] = React.useState(group?.peak_start ?? '09:00')
  const [peakEnd, setPeakEnd] = React.useState(group?.peak_end ?? '18:00')
  const [peakRate, setPeakRate] = React.useState(str(group?.peak_rate_multiplier ?? 1))
  const [allowlistOn, setAllowlistOn] = React.useState(group?.model_allowlist?.enabled ?? false)
  const [allowlist, setAllowlist] = React.useState((group?.model_allowlist?.models ?? []).join('\n'))
  const [copyFrom, setCopyFrom] = React.useState<number[]>([])
  const [error, setError] = React.useState('')

  const isSub = subType === 'subscription'
  const others = allGroups.filter((g) => g.id !== group?.id)
  const copyCandidates = others.filter((g) => g.platform === platform)

  const submit = async () => {
    if (!name.trim()) return setError(t('admin.groups.nameRequired'))
    const rateVal = numOrUndef(rate)
    if (rateVal === undefined || rateVal < 0) return setError(t('admin.groups.form.rateMultiplierHint'))
    setError('')
    const models = allowlist
      .split(/[\n,]/)
      .map((s) => s.trim())
      .filter(Boolean)
    const common = {
      name: name.trim(),
      description: description.trim() ? description.trim() : null,
      rate_multiplier: rateVal,
      is_exclusive: exclusive,
      daily_limit_usd: isSub ? numOrNull(daily) : null,
      weekly_limit_usd: isSub ? numOrNull(weekly) : null,
      monthly_limit_usd: isSub ? numOrNull(monthly) : null,
      rpm_limit: numOrUndef(rpm) ?? 0,
      claude_code_only: claudeCodeOnly,
      fallback_group_id: numOrNull(fallbackId),
      fallback_group_id_on_invalid_request: numOrNull(fallbackInvalidId),
      require_oauth_only: oauthOnly,
      require_privacy_set: privacySet,
      allow_image_generation: allowImage,
      image_price_1k: numOrNull(img1k),
      image_price_2k: numOrNull(img2k),
      image_price_4k: numOrNull(img4k),
      peak_rate_enabled: peak,
      ...(peak
        ? { peak_start: peakStart, peak_end: peakEnd, peak_rate_multiplier: numOrUndef(peakRate) ?? 1 }
        : {}),
      model_allowlist: { enabled: allowlistOn, models }
    }
    if (allowlistOn && models.length === 0)
      return setError(t('admin.groups.modelAllowlist.emptySelectionError'))
    const ok = group
      ? await run(() => adminAPI.groups.update(group.id, { ...common, status } as UpdateGroupRequest), {
          success: t('admin.groups.groupUpdatedSuccess'),
          fallback: t('admin.groups.failedToUpdate')
        })
      : await run(
          () =>
            adminAPI.groups.create({
              ...common,
              platform,
              subscription_type: subType,
              ...(copyFrom.length > 0 ? { copy_accounts_from_group_ids: copyFrom } : {})
            } as CreateGroupRequest),
          { success: t('admin.groups.groupCreatedSuccess'), fallback: t('admin.groups.failedToCreate') }
        )
    if (ok) onSaved()
  }

  return (
    <AdminFormDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={editing ? t('admin.groups.editGroup') : t('admin.groups.createGroup')}
      onSubmit={submit}
      submitting={busy}
      submitText={editing ? t('common.update') : t('common.create')}
      size="xl"
    >
      <Tabs defaultValue="basic">
        <TabsList>
          <TabsTrigger value="basic">{t('adminUi.groups.tabBasic')}</TabsTrigger>
          <TabsTrigger value="billing">{t('adminUi.groups.tabBilling')}</TabsTrigger>
          <TabsTrigger value="routing">{t('adminUi.groups.tabRouting')}</TabsTrigger>
          <TabsTrigger value="models">{t('adminUi.groups.tabModels')}</TabsTrigger>
        </TabsList>

        <TabsContent value="basic" className="grid gap-4 pt-4 sm:grid-cols-2">
          <FormField label={t('admin.groups.form.nameLabel')} required error={error}>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('admin.groups.enterGroupName')}
            />
          </FormField>
          <FormField
            label={t('admin.groups.form.platformLabel')}
            description={editing ? t('admin.groups.platformNotEditable') : t('admin.groups.platformHint')}
          >
            <NativeSelect
              value={platform}
              disabled={editing}
              onChange={(e) => {
                setPlatform(e.target.value as GroupPlatform)
                setCopyFrom([])
              }}
            >
              {GROUP_PLATFORM_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <FormField label={t('admin.groups.form.descriptionLabel')} className="sm:col-span-2">
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('admin.groups.optionalDescription')}
            />
          </FormField>
          <FormField
            label={t('admin.groups.form.rateMultiplierLabel')}
            description={t('admin.groups.form.rateMultiplierHint')}
          >
            <Input type="number" step="0.01" min={0} value={rate} onChange={(e) => setRate(e.target.value)} />
          </FormField>
          <FormField
            label={t('admin.groups.form.rpmLimit')}
            description={t('admin.groups.form.rpmLimitHint')}
          >
            <Input
              type="number"
              min={0}
              value={rpm}
              onChange={(e) => setRpm(e.target.value)}
              placeholder={t('admin.groups.form.rpmLimitPlaceholder')}
            />
          </FormField>
          <FormField
            label={t('admin.groups.subscription.type')}
            description={
              editing
                ? t('admin.groups.subscription.typeNotEditable')
                : t('admin.groups.subscription.typeHint')
            }
          >
            <NativeSelect
              value={subType}
              disabled={editing}
              onChange={(e) => setSubType(e.target.value as 'standard' | 'subscription')}
            >
              <option value="standard">{t('admin.groups.subscription.standard')}</option>
              <option value="subscription">{t('admin.groups.subscription.subscription')}</option>
            </NativeSelect>
          </FormField>
          {editing ? (
            <FormField label={t('admin.groups.form.statusLabel')}>
              <NativeSelect
                value={status}
                onChange={(e) => setStatus(e.target.value as 'active' | 'inactive')}
              >
                <option value="active">{t('common.active')}</option>
                <option value="inactive">{t('common.inactive')}</option>
              </NativeSelect>
            </FormField>
          ) : null}
          <div className="sm:col-span-2">
            <Toggle
              label={t('admin.groups.form.exclusiveLabel')}
              hint={t('admin.groups.form.exclusiveHint')}
              checked={exclusive}
              onChange={setExclusive}
            />
          </div>
          {!editing && copyCandidates.length > 0 ? (
            <FormField label={t('admin.groups.form.accountsLabel')} className="sm:col-span-2">
              <div className="flex max-h-32 flex-wrap gap-2 overflow-y-auto rounded-md border p-2">
                {copyCandidates.map((g) => (
                  <label key={g.id} className="flex items-center gap-1.5 text-sm">
                    <Checkbox
                      checked={copyFrom.includes(g.id)}
                      onCheckedChange={(v) =>
                        setCopyFrom((prev) => (v === true ? [...prev, g.id] : prev.filter((x) => x !== g.id)))
                      }
                    />
                    {g.name}
                  </label>
                ))}
              </div>
            </FormField>
          ) : null}
        </TabsContent>

        <TabsContent value="billing" className="grid gap-4 pt-4 sm:grid-cols-3">
          {isSub ? (
            <>
              <FormField label={t('admin.groups.subscription.dailyLimit')}>
                <Input
                  type="number"
                  step="0.01"
                  min={0}
                  value={daily}
                  onChange={(e) => setDaily(e.target.value)}
                  placeholder={t('admin.groups.subscription.noLimit')}
                />
              </FormField>
              <FormField label={t('admin.groups.subscription.weeklyLimit')}>
                <Input
                  type="number"
                  step="0.01"
                  min={0}
                  value={weekly}
                  onChange={(e) => setWeekly(e.target.value)}
                  placeholder={t('admin.groups.subscription.noLimit')}
                />
              </FormField>
              <FormField label={t('admin.groups.subscription.monthlyLimit')}>
                <Input
                  type="number"
                  step="0.01"
                  min={0}
                  value={monthly}
                  onChange={(e) => setMonthly(e.target.value)}
                  placeholder={t('admin.groups.subscription.noLimit')}
                />
              </FormField>
            </>
          ) : (
            <p className="text-sm text-muted-foreground sm:col-span-3">
              {t('admin.groups.subscription.typeHint')}
            </p>
          )}
          <div className="space-y-3 sm:col-span-3">
            <Toggle
              label={t('admin.groups.imagePricing.allowImageGeneration')}
              checked={allowImage}
              onChange={setAllowImage}
            />
            {allowImage ? (
              <div className="grid gap-4 sm:grid-cols-3">
                {(
                  [
                    ['1K', img1k, setImg1k],
                    ['2K', img2k, setImg2k],
                    ['4K', img4k, setImg4k]
                  ] as const
                ).map(([label, value, set]) => (
                  <FormField key={label} label={`${t('admin.groups.imagePricing.title')} ${label}`}>
                    <Input
                      type="number"
                      step="0.001"
                      min={0}
                      value={value}
                      onChange={(e) => set(e.target.value)}
                      placeholder={t('admin.groups.imagePricing.notConfigured')}
                    />
                  </FormField>
                ))}
              </div>
            ) : null}
          </div>
          {TOKEN_PLATFORMS.has(platform) || platform === 'composite' ? (
            <div className="space-y-3 sm:col-span-3">
              <Toggle
                label={t('admin.groups.peakRate.enable')}
                hint={t('admin.groups.peakRate.multiplierHint')}
                checked={peak}
                onChange={setPeak}
              />
              {peak ? (
                <div className="grid gap-4 sm:grid-cols-3">
                  <FormField label={t('admin.groups.peakRate.peakStart')}>
                    <Input type="time" value={peakStart} onChange={(e) => setPeakStart(e.target.value)} />
                  </FormField>
                  <FormField label={t('admin.groups.peakRate.peakEnd')}>
                    <Input type="time" value={peakEnd} onChange={(e) => setPeakEnd(e.target.value)} />
                  </FormField>
                  <FormField label={t('admin.groups.peakRate.peakMultiplier')}>
                    <Input
                      type="number"
                      step="0.01"
                      min={0}
                      value={peakRate}
                      onChange={(e) => setPeakRate(e.target.value)}
                    />
                  </FormField>
                </div>
              ) : null}
            </div>
          ) : null}
        </TabsContent>

        <TabsContent value="routing" className="grid gap-4 pt-4 sm:grid-cols-2">
          <div className="space-y-3 sm:col-span-2">
            <Toggle
              label={t('admin.groups.accountFilters.oauthOnly')}
              hint={
                oauthOnly
                  ? t('admin.groups.accountFilters.oauthOnlyEnabled')
                  : t('admin.groups.accountFilters.disabled')
              }
              checked={oauthOnly}
              onChange={setOauthOnly}
            />
            <Toggle
              label={t('admin.groups.accountFilters.privacySetOnly')}
              hint={
                privacySet
                  ? t('admin.groups.accountFilters.privacySetOnlyEnabled')
                  : t('admin.groups.accountFilters.disabled')
              }
              checked={privacySet}
              onChange={setPrivacySet}
            />
            {platform === 'anthropic' ? (
              <Toggle
                label={t('adminUi.groups.claudeCodeOnly')}
                checked={claudeCodeOnly}
                onChange={setClaudeCodeOnly}
              />
            ) : null}
          </div>
          <FormField label={t('adminUi.groups.fallbackGroup')}>
            <NativeSelect value={fallbackId} onChange={(e) => setFallbackId(e.target.value)}>
              <option value="">{t('common.none')}</option>
              {others.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <FormField label={t('adminUi.groups.fallbackInvalid')}>
            <NativeSelect value={fallbackInvalidId} onChange={(e) => setFallbackInvalidId(e.target.value)}>
              <option value="">{t('common.none')}</option>
              {others.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </NativeSelect>
          </FormField>
        </TabsContent>

        <TabsContent value="models" className="grid gap-4 pt-4">
          <Toggle
            label={t('admin.groups.modelAllowlist.title')}
            hint={t('admin.groups.modelAllowlist.hint')}
            checked={allowlistOn}
            onChange={setAllowlistOn}
          />
          {allowlistOn ? (
            <FormField
              label={t('admin.groups.modelAllowlist.customPlaceholder')}
              description={t('admin.groups.modelAllowlist.selectedSummary', {
                selected: allowlist.split(/[\n,]/).filter((s) => s.trim()).length,
                total: allowlist.split(/[\n,]/).filter((s) => s.trim()).length
              })}
            >
              <Textarea
                rows={8}
                value={allowlist}
                onChange={(e) => setAllowlist(e.target.value)}
                className="font-mono"
              />
            </FormField>
          ) : null}
        </TabsContent>
      </Tabs>
    </AdminFormDialog>
  )
}
