/** 系统设置共享 UI 积木：卡片、行、字段控件、标签列表、上下文。 */
import * as React from 'react'
import { X } from 'lucide-react'
import { PasswordInput } from '@/components/PasswordInput'
import { NativeSelect } from '@/components/NativeSelect'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input, Textarea } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { t } from '@/i18n'
import { cn } from '@/lib/utils'
import type { AdminGroup } from '@/types'
import type { FieldSpec } from './settingsSpec'
import type { SettingsAux, SettingsDraft, SettingsForm } from './settingsModel'

export interface BlockCtx {
  draft: SettingsDraft
  patchForm: (p: Partial<SettingsForm>) => void
  patchAux: (p: Partial<SettingsAux>) => void
  subscriptionGroups: AdminGroup[]
}

export const U = (key: string, params?: Record<string, unknown>) => t(`adminUi.settings.${key}`, params)

export function SettingsCard({
  id,
  title,
  description,
  children
}: {
  id?: string
  title?: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <Card id={id} className="overflow-hidden">
      {title ? (
        <div className="border-b px-5 py-4 sm:px-6">
          <h2 className="text-base font-semibold">{t(title)}</h2>
          {description ? <p className="mt-1 text-sm text-muted-foreground">{t(description)}</p> : null}
        </div>
      ) : null}
      <div className="grid gap-5 p-5 sm:p-6">{children}</div>
    </Card>
  )
}

/** 开关行：左侧标题 + 说明，右侧开关。 */
export function SwitchRow({
  label,
  hint,
  checked,
  onChange,
  disabled
}: {
  label: React.ReactNode
  hint?: React.ReactNode
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
}) {
  const id = React.useId()
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <Label htmlFor={id} className="text-sm font-medium">
          {label}
        </Label>
        {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
      </div>
      <Switch id={id} checked={checked} disabled={disabled} onCheckedChange={onChange} />
    </div>
  )
}

export function LabeledField({
  label,
  hint,
  children,
  className
}: {
  label: React.ReactNode
  hint?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  const id = React.useId()
  const child = React.isValidElement<Record<string, unknown>>(children)
    ? React.cloneElement(children, { id: (children.props.id as string | undefined) ?? id })
    : children
  return (
    <div className={cn('grid gap-1.5', className)}>
      <Label htmlFor={id}>{label}</Label>
      {child}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  )
}

const labelOf = (s: FieldSpec) => t(s.label ?? `adminUi.settings.f.${s.name}`)
const hintOf = (s: FieldSpec) =>
  s.hint ? t(s.hint) : s.label ? undefined : maybe(`adminUi.settings.f.${s.name}Hint`)
function maybe(key: string): string | undefined {
  const v = t(key)
  return v === key ? undefined : v
}

/** 通用字段控件（按规格渲染）。`value` 与 `onChange` 由调用方绑定到草稿。 */
export function FieldControl({
  spec,
  value,
  onChange,
  configured
}: {
  spec: FieldSpec
  value: unknown
  onChange: (v: unknown) => void
  configured?: boolean
}) {
  const label = labelOf(spec)
  const hint = hintOf(spec)
  if (spec.kind === 'bool') {
    return <SwitchRow label={label} hint={hint} checked={Boolean(value)} onChange={onChange} />
  }
  const placeholder = spec.placeholder ? t(spec.placeholder) : undefined
  const mono = spec.mono ? 'font-mono text-[13px]' : undefined
  let control: React.ReactNode
  if (spec.kind === 'textarea') {
    control = (
      <Textarea
        rows={4}
        className={mono}
        placeholder={placeholder}
        value={String(value ?? '')}
        onChange={(e) => onChange(e.target.value)}
      />
    )
  } else if (spec.kind === 'select') {
    control = (
      <NativeSelect value={String(value ?? '')} onChange={(e) => onChange(e.target.value)}>
        {(spec.options ?? []).map((o) => (
          <option key={o.value} value={o.value}>
            {t(o.label)}
          </option>
        ))}
      </NativeSelect>
    )
  } else if (spec.kind === 'number') {
    control = (
      <Input
        type="number"
        step={spec.step}
        className={cn('max-w-xs', mono)}
        placeholder={placeholder}
        value={value === null || value === undefined ? '' : String(value)}
        onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
      />
    )
  } else if (spec.kind === 'secret') {
    control = (
      <PasswordInput
        autoComplete="new-password"
        className={mono}
        placeholder={configured ? U('secretConfiguredPlaceholder') : placeholder}
        value={String(value ?? '')}
        onChange={(e) => onChange(e.target.value)}
      />
    )
  } else {
    control = (
      <Input
        type={spec.kind === 'url' ? 'url' : 'text'}
        className={mono}
        placeholder={placeholder}
        value={String(value ?? '')}
        onChange={(e) => onChange(e.target.value)}
      />
    )
  }
  return (
    <LabeledField
      label={label}
      hint={configured ? `${U('secretConfiguredHint')}${hint ? ` ${hint}` : ''}` : hint}
    >
      {control}
    </LabeledField>
  )
}

/** 行内标签输入（回车 / 逗号添加，Backspace 删除末项，支持粘贴多值）。 */
export function TagInput({
  tags,
  onAdd,
  onRemove,
  placeholder,
  removeLabel,
  mono
}: {
  tags: string[]
  onAdd: (raw: string) => void
  onRemove: (tag: string) => void
  placeholder?: string
  removeLabel: string
  mono?: boolean
}) {
  const [draft, setDraft] = React.useState('')
  const commit = () => {
    if (draft.trim()) onAdd(draft)
    setDraft('')
  }
  return (
    <div className="flex min-h-9 flex-wrap items-center gap-1.5 rounded-md border bg-card px-2 py-1.5">
      {tags.map((tag) => (
        <Badge key={tag} variant="secondary" className={cn('gap-1 pr-1', mono && 'font-mono')}>
          {tag}
          <button
            type="button"
            aria-label={`${removeLabel}: ${tag}`}
            className="rounded-sm p-0.5 hover:bg-muted"
            onClick={() => onRemove(tag)}
          >
            <X className="size-3" aria-hidden />
          </button>
        </Badge>
      ))}
      <input
        className="min-w-32 flex-1 bg-transparent text-sm outline-none"
        value={draft}
        placeholder={placeholder}
        onChange={(e) => {
          const v = e.target.value
          if (/[,;\s]$/.test(v)) {
            onAdd(v)
            setDraft('')
          } else setDraft(v)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            commit()
          } else if (e.key === 'Backspace' && !draft && tags.length) onRemove(tags[tags.length - 1])
        }}
        onBlur={commit}
        onPaste={(e) => {
          const text = e.clipboardData.getData('text')
          if (/[\s,;]/.test(text.trim())) {
            e.preventDefault()
            onAdd(text)
          }
        }}
      />
    </div>
  )
}

export function AddButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <Button type="button" size="sm" variant="outline" className="justify-self-start" onClick={onClick}>
      {children}
    </Button>
  )
}
