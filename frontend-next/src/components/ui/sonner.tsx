import { Toaster as Sonner, type ToasterProps } from 'sonner'

/** Toast 承载（sonner）。主题颜色全部走设计令牌；样式在 globals.css 中由 CSS 变量驱动。 */
export function Toaster(props: ToasterProps) {
  return (
    <Sonner
      position="top-right"
      richColors
      closeButton
      toastOptions={{
        classNames: {
          toast: '!border !bg-popover !text-popover-foreground !shadow-md'
        }
      }}
      {...props}
    />
  )
}
