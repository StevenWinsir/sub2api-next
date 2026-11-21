import * as React from 'react'
import { Check, Copy } from 'lucide-react'
import { Button, type ButtonProps } from '@/components/ui/button'
import { useClipboard } from '@/hooks/useClipboard'
import { t } from '@/i18n'

export interface CopyButtonProps extends Omit<ButtonProps, 'onClick' | 'value'> {
  value: string
  /** 复制成功后是否弹 Toast（默认弹）。 */
  toast?: boolean
}

export function CopyButton({
  value,
  toast = true,
  size = 'icon',
  variant = 'ghost',
  children,
  ...props
}: CopyButtonProps) {
  const { copied, copy } = useClipboard()
  return (
    <Button
      type="button"
      size={size}
      variant={variant}
      aria-label={t('ui.common.copy')}
      onClick={() => void copy(value, { toast })}
      {...props}
    >
      {copied ? <Check className="text-success" aria-hidden /> : <Copy aria-hidden />}
      {children}
    </Button>
  )
}
