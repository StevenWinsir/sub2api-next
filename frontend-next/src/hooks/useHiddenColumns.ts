import * as React from 'react'

export interface HiddenColumnsOptions {
  /** localStorage 键（沿用 Vue 版，如 api-key-hidden-columns）。 */
  storageKey: string
  /** 全部可切换列键（用于过滤失效键）。 */
  allKeys: string[]
  alwaysVisible?: string[]
  defaultHidden?: string[]
  /** 版本键与版本号：升级时把新默认隐藏的列追加进用户已保存的隐藏集合。 */
  versionKey?: string
  version?: number
  versionNewHidden?: Record<number, string[]>
}

function readHidden(o: HiddenColumnsOptions): string[] {
  const always = new Set(o.alwaysVisible ?? [])
  const valid = new Set(o.allKeys)
  const defaults = (o.defaultHidden ?? []).filter((k) => !always.has(k))
  try {
    const saved = localStorage.getItem(o.storageKey)
    if (!saved) {
      if (o.versionKey && o.version) localStorage.setItem(o.versionKey, String(o.version))
      return defaults
    }
    const parsed = JSON.parse(saved) as unknown
    const hidden = new Set<string>(
      (Array.isArray(parsed) ? parsed : []).filter(
        (k): k is string => typeof k === 'string' && valid.has(k) && !always.has(k)
      )
    )
    if (o.versionKey && o.version) {
      const stored = Number(localStorage.getItem(o.versionKey) ?? '1')
      if (stored < o.version) {
        for (let v = stored + 1; v <= o.version; v++) {
          for (const k of o.versionNewHidden?.[v] ?? []) {
            if (valid.has(k) && !always.has(k)) hidden.add(k)
          }
        }
        localStorage.setItem(o.storageKey, JSON.stringify([...hidden]))
        localStorage.setItem(o.versionKey, String(o.version))
      } else {
        localStorage.setItem(o.versionKey, String(o.version))
      }
    }
    return [...hidden]
  } catch (error) {
    console.error('Failed to load table columns:', error)
    return defaults
  }
}

/** 列显隐的持久化（沿用原存储键与版本迁移语义）。 */
export function useHiddenColumns(options: HiddenColumnsOptions) {
  const optionsRef = React.useRef(options)
  const [hidden, setHidden] = React.useState<string[]>([])
  const [ready, setReady] = React.useState(false)

  React.useEffect(() => {
    setHidden(readHidden(optionsRef.current))
    setReady(true)
  }, [])

  const toggle = React.useCallback((key: string) => {
    const o = optionsRef.current
    if (o.alwaysVisible?.includes(key)) return
    setHidden((prev) => {
      const next = prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
      try {
        localStorage.setItem(o.storageKey, JSON.stringify(next))
        if (o.versionKey && o.version) localStorage.setItem(o.versionKey, String(o.version))
      } catch (error) {
        console.error('Failed to save table columns:', error)
      }
      return next
    })
  }, [])

  const isVisible = React.useCallback((key: string) => !hidden.includes(key), [hidden])
  return { hidden, ready, toggle, isVisible }
}
