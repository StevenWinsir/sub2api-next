/**
 * 自动刷新（对应 composables/useAutoRefresh）：开关与间隔持久化到 localStorage（沿用原键），
 * 1 秒节拍的倒计时；页面不可见 / 正在加载（shouldPause）时暂停，卸载时清理，StrictMode 下幂等。
 */
import * as React from 'react'

export interface UseAutoRefreshOptions {
  storageKey: string
  intervals?: readonly number[]
  defaultInterval?: number
  defaultEnabled?: boolean
  onRefresh: () => Promise<void> | void
  shouldPause?: () => boolean
}

interface Persisted {
  enabled?: boolean
  interval_seconds?: number
}

export function useAutoRefresh(options: UseAutoRefreshOptions) {
  const { storageKey, intervals = [5, 10, 15, 30] as const } = options
  const fallbackInterval = options.defaultInterval ?? intervals[intervals.length - 1]
  const [enabled, setEnabledState] = React.useState(options.defaultEnabled ?? false)
  const [intervalSeconds, setIntervalState] = React.useState(fallbackInterval)
  const [countdown, setCountdown] = React.useState(0)
  const optsRef = React.useRef(options)
  const fetching = React.useRef(false)
  const countdownRef = React.useRef(0)
  const stateRef = React.useRef({ enabled, intervalSeconds })

  React.useEffect(() => {
    optsRef.current = options
    stateRef.current = { enabled, intervalSeconds }
  })

  // 挂载后读取持久化的偏好
  React.useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey)
      if (!saved) return
      const parsed = JSON.parse(saved) as Persisted
      /* eslint-disable react-hooks/set-state-in-effect -- 水合后一次性读取 localStorage */
      setEnabledState(parsed.enabled === true)
      const iv = Number(parsed.interval_seconds)
      if (intervals.includes(iv)) setIntervalState(iv)
      /* eslint-enable react-hooks/set-state-in-effect */
    } catch {
      /* 忽略损坏的存储 */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅挂载时读取
  }, [storageKey])

  const persist = React.useCallback(
    (next: Persisted) => {
      try {
        localStorage.setItem(storageKey, JSON.stringify(next))
      } catch {
        /* 忽略 */
      }
    },
    [storageKey]
  )

  const resetCountdown = React.useCallback(() => {
    countdownRef.current = stateRef.current.intervalSeconds
    setCountdown(countdownRef.current)
  }, [])

  // 1 秒节拍
  React.useEffect(() => {
    if (!enabled) {
      countdownRef.current = 0
      return
    }
    countdownRef.current = intervalSeconds
    const id = setInterval(async () => {
      const o = optsRef.current
      if (o.shouldPause?.() || fetching.current) return
      if (countdownRef.current <= 1) {
        countdownRef.current = stateRef.current.intervalSeconds
        setCountdown(countdownRef.current)
        fetching.current = true
        try {
          await o.onRefresh()
        } finally {
          fetching.current = false
        }
        return
      }
      countdownRef.current -= 1
      setCountdown(countdownRef.current)
    }, 1000)
    return () => clearInterval(id)
  }, [enabled, intervalSeconds])

  const setEnabled = React.useCallback(
    (value: boolean) => {
      setEnabledState(value)
      persist({ enabled: value, interval_seconds: stateRef.current.intervalSeconds })
      setCountdown(value ? stateRef.current.intervalSeconds : 0)
    },
    [persist]
  )
  const setIntervalSeconds = React.useCallback(
    (seconds: number) => {
      setIntervalState(seconds)
      persist({ enabled: stateRef.current.enabled, interval_seconds: seconds })
      if (stateRef.current.enabled) setCountdown(seconds)
    },
    [persist]
  )

  return {
    enabled,
    intervalSeconds,
    countdown: enabled ? countdown : 0,
    intervals,
    setEnabled,
    setInterval: setIntervalSeconds,
    resetCountdown
  }
}
