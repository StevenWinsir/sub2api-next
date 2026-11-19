import * as React from 'react'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { t } from '@/i18n'

export interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: React.ReactNode
  description?: React.ReactNode
  confirmText?: string
  cancelText?: string
  destructive?: boolean
  /** 危险操作需要输入名称确认（§6.3）。 */
  requireText?: string
  loading?: boolean
  onConfirm: () => void | Promise<void>
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmText,
  cancelText,
  destructive,
  requireText,
  loading,
  onConfirm
}: ConfirmDialogProps) {
  const [typed, setTyped] = React.useState('')
  const handleOpenChange = (next: boolean) => {
    if (!next) setTyped('')
    onOpenChange(next)
  }
  const blocked = requireText ? typed !== requireText : false

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description ? <AlertDialogDescription>{description}</AlertDialogDescription> : null}
        </AlertDialogHeader>
        {requireText ? (
          <Input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={requireText}
            aria-label={requireText}
            autoComplete="off"
          />
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>{cancelText ?? t('ui.common.cancel')}</AlertDialogCancel>
          <Button
            variant={destructive ? 'destructive' : 'default'}
            loading={loading}
            disabled={blocked}
            onClick={() => void onConfirm()}
          >
            {confirmText ?? t('ui.common.confirm')}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
