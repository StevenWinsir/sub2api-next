import * as React from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { FormField } from '@/components/FormField'
import { extractApiErrorMessage } from '@/utils/apiError'
import { t } from '@/i18n'

export interface TotpStepDialogProps {
  open: boolean
  masked?: string
  onCancel: () => void
  /** 提交验证码；抛出异常时在对话框内显示错误。 */
  onSubmit: (code: string) => Promise<void>
}

/** TOTP 二次验证弹窗（登录阶段）。内容仅在打开时挂载，因此每次打开状态都是全新的。 */
export function TotpStepDialog({ open, masked, onCancel, onSubmit }: TotpStepDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(v) => (!v ? onCancel() : undefined)}>
      <DialogContent>
        <TotpForm masked={masked} onCancel={onCancel} onSubmit={onSubmit} />
      </DialogContent>
    </Dialog>
  )
}

function TotpForm({ masked, onCancel, onSubmit }: Omit<TotpStepDialogProps, 'open'>) {
  const [code, setCode] = React.useState('')
  const [error, setError] = React.useState('')
  const [busy, setBusy] = React.useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (code.length !== 6 || busy) return
    setBusy(true)
    setError('')
    try {
      await onSubmit(code)
    } catch (err) {
      setError(extractApiErrorMessage(err, t('common.unknownError')))
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>{t('ui.login.totpTitle')}</DialogTitle>
        <DialogDescription>
          {t('ui.login.totpDescription')} {masked ? `(${masked})` : null}
        </DialogDescription>
      </DialogHeader>
      <FormField label={t('ui.login.totpCode')} error={error || undefined}>
        <Input
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          pattern="[0-9]*"
          autoFocus
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          className="text-center font-mono tracking-[0.4em]"
        />
      </FormField>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          {t('ui.common.cancel')}
        </Button>
        <Button type="submit" loading={busy} disabled={code.length !== 6}>
          {t('ui.login.totpSubmit')}
        </Button>
      </DialogFooter>
    </form>
  )
}
