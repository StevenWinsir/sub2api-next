import * as React from 'react'
import { Loader2, LockKeyhole } from 'lucide-react'
import { totpAPI } from '@/api/totp'
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
import type { StepUpController } from '@/hooks/useStepUp'
import { useAppStore } from '@/stores/app'
import { t } from '@/i18n'
import { useLocale } from '@/i18n/react'

/** 敏感操作的 TOTP step-up 弹窗：输入满 6 位自动提交，成功后通知 controller 重放原操作。 */
export function TotpStepUpDialog({ controller }: { controller: StepUpController }) {
  return (
    <Dialog open={controller.visible} onOpenChange={(open) => (!open ? controller.onCancel() : undefined)}>
      <DialogContent className="max-w-sm">
        <StepUpForm controller={controller} />
      </DialogContent>
    </Dialog>
  )
}

function StepUpForm({ controller }: { controller: StepUpController }) {
  useLocale()
  const showError = useAppStore((s) => s.showError)
  const [code, setCode] = React.useState('')
  const [verifying, setVerifying] = React.useState(false)
  const inputRef = React.useRef<HTMLInputElement>(null)

  const submit = React.useCallback(
    async (otp: string) => {
      setVerifying(true)
      try {
        await totpAPI.stepUp(otp)
        setVerifying(false)
        setCode('')
        controller.onVerified()
      } catch (err) {
        setVerifying(false)
        showError((err as { message?: string })?.message || t('stepUp.verifyFailed'))
        setCode('')
        inputRef.current?.focus()
      }
    },
    [controller, showError]
  )

  const onChange = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 6)
    setCode(digits)
    if (digits.length === 6 && !verifying) void submit(digits)
  }

  return (
    <>
      <DialogHeader className="items-center text-center">
        <div className="mb-1 flex size-11 items-center justify-center rounded-full bg-primary/10 text-primary">
          <LockKeyhole className="size-5" aria-hidden />
        </div>
        <DialogTitle>{t('stepUp.title')}</DialogTitle>
        <DialogDescription>{t('stepUp.hint')}</DialogDescription>
      </DialogHeader>
      <div className="grid gap-2">
        <Input
          ref={inputRef}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          autoFocus
          aria-label={t('stepUp.title')}
          placeholder="000000"
          className="h-12 text-center font-mono text-xl tracking-[0.5em]"
          value={code}
          disabled={verifying}
          onChange={(e) => onChange(e.target.value)}
        />
        {verifying ? (
          <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground" role="status">
            <Loader2 className="size-4 animate-spin" aria-hidden /> {t('common.verifying')}
          </p>
        ) : null}
      </div>
      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          disabled={verifying}
          onClick={controller.onCancel}
          className="w-full"
        >
          {t('common.cancel')}
        </Button>
      </DialogFooter>
    </>
  )
}
