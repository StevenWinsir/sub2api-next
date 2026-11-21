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
import { cn } from '@/lib/utils'
import { t } from '@/i18n'

export interface AdminFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: React.ReactNode
  description?: React.ReactNode
  /** 提交回调；省略则不渲染提交按钮（只读对话框）。 */
  onSubmit?: () => void | Promise<void>
  submitText?: string
  submitting?: boolean
  submitDisabled?: boolean
  destructive?: boolean
  size?: 'sm' | 'md' | 'lg' | 'xl'
  /** 页脚左侧的额外内容。 */
  footerExtra?: React.ReactNode
  children: React.ReactNode
}

const SIZE = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' } as const

/** 管理后台通用表单对话框：标题 + 滚动内容 + 取消/提交页脚；提交时禁止关闭，防重复提交。 */
export function AdminFormDialog({
  open,
  onOpenChange,
  title,
  description,
  onSubmit,
  submitText,
  submitting,
  submitDisabled,
  destructive,
  size = 'md',
  footerExtra,
  children
}: AdminFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(next) => (!submitting ? onOpenChange(next) : undefined)}>
      <DialogContent className={cn('w-full', SIZE[size])}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className={description ? undefined : 'sr-only'}>
            {description ?? title}
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (onSubmit && !submitting && !submitDisabled) void onSubmit()
          }}
        >
          {children}
          <DialogFooter className="items-center sm:justify-between">
            <div>{footerExtra}</div>
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <Button
                type="button"
                variant="outline"
                disabled={submitting}
                onClick={() => onOpenChange(false)}
              >
                {onSubmit ? t('common.cancel') : t('common.close')}
              </Button>
              {onSubmit ? (
                <Button
                  type="submit"
                  variant={destructive ? 'destructive' : 'default'}
                  loading={submitting}
                  disabled={submitDisabled}
                >
                  {submitText ?? t('common.save')}
                </Button>
              ) : null}
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
