import * as React from 'react'

/** 页面可见性（轮询类页面在不可见时暂停，§5.5）。 */
export function usePageVisible(): boolean {
  const [visible, setVisible] = React.useState(true)
  React.useEffect(() => {
    const update = () => setVisible(document.visibilityState !== 'hidden')
    update()
    document.addEventListener('visibilitychange', update)
    return () => document.removeEventListener('visibilitychange', update)
  }, [])
  return visible
}
