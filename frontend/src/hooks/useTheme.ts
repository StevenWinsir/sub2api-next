import * as React from 'react'
import { STORAGE_KEYS } from '@/constants/storage'

export type ThemePreference = 'light' | 'dark' | 'system'

const listeners = new Set<() => void>()
const notify = () => listeners.forEach((l) => l())

function readPreference(): ThemePreference {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEYS.theme)
    return saved === 'light' || saved === 'dark' ? saved : 'system'
  } catch {
    return 'system'
  }
}

function applyTheme(pref: ThemePreference): void {
  const dark =
    pref === 'dark' || (pref === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.classList.toggle('dark', dark)
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  const mql = window.matchMedia('(prefers-color-scheme: dark)')
  const onSystemChange = () => {
    if (readPreference() === 'system') applyTheme('system')
  }
  mql.addEventListener?.('change', onSystemChange)
  window.addEventListener('storage', listener) // 其他标签切换主题
  return () => {
    listeners.delete(listener)
    mql.removeEventListener?.('change', onSystemChange)
    window.removeEventListener('storage', listener)
  }
}

export function setTheme(next: ThemePreference): void {
  try {
    if (next === 'system') window.localStorage.removeItem(STORAGE_KEYS.theme)
    else window.localStorage.setItem(STORAGE_KEYS.theme, next)
  } catch {
    /* ignore */
  }
  applyTheme(next)
  notify()
}

/**
 * 主题：沿用 `theme` 键（light / dark，缺省跟随系统），`dark` class 加在 <html> 上。
 * 首屏防闪由 public/theme-init.js 完成（不使用 next-themes 的内联脚本）。
 */
export function useTheme() {
  const preference = React.useSyncExternalStore(subscribe, readPreference, () => 'system' as ThemePreference)
  return { preference, setTheme }
}
