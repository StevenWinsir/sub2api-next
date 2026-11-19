import * as React from 'react'

const subscribe = () => () => {}

/** 客户端挂载标记：服务端 / 水合阶段为 false，之后为 true（useSyncExternalStore，避免 effect 里同步 setState）。 */
export function useMounted(): boolean {
  return React.useSyncExternalStore(
    subscribe,
    () => true,
    () => false
  )
}
