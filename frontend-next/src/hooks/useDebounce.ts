import * as React from 'react'

/** 防抖回调：卸载时取消待执行调用，始终调用最新的 callback。 */
export function useDebouncedCallback<A extends unknown[]>(callback: (...args: A) => void, delayMs: number) {
  const ref = React.useRef(callback)
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  React.useEffect(() => {
    ref.current = callback
  })
  React.useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    []
  )

  return React.useCallback(
    (...args: A) => {
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => ref.current(...args), delayMs)
    },
    [delayMs]
  )
}

export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = React.useState(value)
  React.useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(id)
  }, [value, delayMs])
  return debounced
}
