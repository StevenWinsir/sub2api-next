import * as React from 'react'
import { useRouter } from 'next/router'

/** 导航进度条：监听 Next 路由开始 / 完成 / 出错事件（对应 useNavigationLoadingState）。 */
export function NavProgress() {
  const router = useRouter()
  const [active, setActive] = React.useState(false)

  React.useEffect(() => {
    const start = () => setActive(true)
    const end = () => setActive(false)
    router.events.on('routeChangeStart', start)
    router.events.on('routeChangeComplete', end)
    router.events.on('routeChangeError', end)
    return () => {
      router.events.off('routeChangeStart', start)
      router.events.off('routeChangeComplete', end)
      router.events.off('routeChangeError', end)
    }
  }, [router.events])

  return (
    <div
      role="progressbar"
      aria-hidden={!active}
      aria-label="loading"
      className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-0.5 overflow-hidden"
    >
      {active ? (
        <div className="h-full w-full bg-primary [animation:nav-progress_1.2s_var(--ease-standard)_infinite]" />
      ) : null}
    </div>
  )
}
