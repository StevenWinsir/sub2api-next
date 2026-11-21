/**
 * 源码中静态 t('…') 引用的键必须在中英文语言包中都存在（覆盖 R3 用户控制台与支付相关目录）。
 * 动态键（模板字符串拼接）无法从源码证明，由类型与运行时处理。
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import en from '../locales/en'
import zh from '../locales/zh'

function has(obj: unknown, key: string): boolean {
  let cur = obj as Record<string, unknown> | string | undefined
  for (const part of key.split('.')) {
    if (cur === null || typeof cur !== 'object') return false
    cur = (cur as Record<string, unknown>)[part] as Record<string, unknown> | string | undefined
    if (cur === undefined) return false
  }
  // 必须是叶子文案（字符串），不能只是一个分组对象
  return typeof cur === 'string'
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) {
      if (name === '__tests__') continue
      walk(p, out)
    } else if (/\.(ts|tsx)$/.test(name)) out.push(p)
  }
  return out
}

const ROOTS = [
  'src/features/dashboard',
  'src/features/keys',
  'src/features/usage',
  'src/features/payment',
  'src/features/user',
  'src/features/profile',
  'src/features/channels',
  'src/features/monitor',
  'src/features/channel-monitor-v2',
  'src/components/AutoRefreshButton.tsx',
  'src/features/batch-image',
  'src/features/custom-page',
  'src/features/announcements',
  'src/features/onboarding',
  'src/features/admin',
  'src/components/IpGeoCell.tsx',
  'src/components/ColumnSettings.tsx'
]

function files(): string[] {
  const out: string[] = []
  for (const r of ROOTS) {
    try {
      if (statSync(r).isDirectory()) walk(r, out)
      else out.push(r)
    } catch {
      /* 目录尚未创建 */
    }
  }
  return out
}

describe('t() keys used by user console sources exist in both locales', () => {
  const call = /(?:\bi18n\.t|\bt)\s*\(\s*(['"])([a-zA-Z0-9_.]+)\1/g
  for (const file of files()) {
    it(file, () => {
      const src = readFileSync(file, 'utf8')
      const missing: string[] = []
      for (const m of src.matchAll(call)) {
        const key = m[2]
        if (key.endsWith('.')) continue
        if (!has(en, key)) missing.push(`en:${key}`)
        if (!has(zh, key)) missing.push(`zh:${key}`)
      }
      expect([...new Set(missing)]).toEqual([])
    })
  }
})
