import * as React from 'react'

/** 最小化外壳：居中状态卡片（OAuth 回调、支付弹窗、支付结果、安装向导）。 */
export function BlankLayout({ children }: { children: React.ReactNode }) {
  return (
    <main id="main-content" className="flex min-h-dvh items-center justify-center bg-background p-4">
      <div className="w-full max-w-xl">{children}</div>
    </main>
  )
}
