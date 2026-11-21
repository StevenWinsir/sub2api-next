/**
 * 设置模块里通过本地包装函数（S / A / B / U …）引用的语言包键必须在中英文都存在。
 * 通用的 usedKeys 测试只识别字面量 t('…')，这里补上包装函数调用。
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import en from '@/i18n/locales/en'
import zh from '@/i18n/locales/zh'

function has(obj: unknown, key: string): boolean {
  let cur = obj as Record<string, unknown> | string | undefined
  for (const part of key.split('.')) {
    if (cur === null || typeof cur !== 'object') return false
    cur = (cur as Record<string, unknown>)[part] as Record<string, unknown> | string | undefined
    if (cur === undefined) return false
  }
  return typeof cur === 'string'
}

const DIR = 'src/features/admin/settings'
/** 每个文件里包装函数 → 键前缀 */
const WRAPPERS: Record<string, Record<string, string>> = {
  'SettingsBlocks.tsx': { S: 'admin.settings.', U: 'adminUi.settings.' },
  'SettingsServices.tsx': { S: 'admin.settings.' },
  'SettingsEmail.tsx': { S: 'admin.settings.' },
  'SettingsSecurityPanels.tsx': { S: 'admin.settings.', A: 'adminAccessKeys.' },
  'SettingsPayment.tsx': { S: 'admin.settings.payment.', U: 'adminUi.settings.' },
  'SettingsBackup.tsx': { B: 'admin.backup.' },
  'SettingsPage.tsx': { U: 'adminUi.settings.' },
  'settingsUi.tsx': { U: 'adminUi.settings.' }
}

describe('ServiceCard field keys (sf helper)', () => {
  it('every sf(...) label / hint exists', () => {
    const src = readFileSync(join(DIR, 'SettingsServices.tsx'), 'utf8')
    const missing: string[] = []
    for (const m of src.matchAll(
      /\bsf\(\s*'[a-z0-9_]+',\s*'[a-z]+',\s*'([A-Za-z0-9]+)',\s*'([A-Za-z0-9]+)'(?:,\s*'([A-Za-z0-9]+)')?/g
    )) {
      for (const leaf of [m[2], m[3]].filter(Boolean)) {
        const key = `admin.settings.${m[1]}.${leaf}`
        if (!has(en, key)) missing.push(`en:${key}`)
        if (!has(zh, key)) missing.push(`zh:${key}`)
      }
    }
    expect([...new Set(missing)]).toEqual([])
  })
  it('settings tabs have labels', () => {
    for (const k of [
      'general',
      'agreement',
      'features',
      'security',
      'users',
      'gateway',
      'payment',
      'email',
      'backup'
    ]) {
      expect(has(en, `admin.settings.tabs.${k}`), k).toBe(true)
      expect(has(zh, `admin.settings.tabs.${k}`), k).toBe(true)
    }
  })
})

describe('settings wrapper-call keys', () => {
  for (const file of readdirSync(DIR).filter((f) => f in WRAPPERS)) {
    it(`${file}`, () => {
      const src = readFileSync(join(DIR, file), 'utf8')
      const missing: string[] = []
      for (const [fn, prefix] of Object.entries(WRAPPERS[file])) {
        const re = new RegExp(`(?<![A-Za-z0-9_.])${fn}\\(\\s*['"]([A-Za-z0-9_.]+)['"]`, 'g')
        for (const m of src.matchAll(re)) {
          const key = prefix + m[1]
          if (!has(en, key)) missing.push(`en:${key}`)
          if (!has(zh, key)) missing.push(`zh:${key}`)
        }
      }
      // 直接字面量 t('…') 与 t(`…`)（无插值）
      for (const m of src.matchAll(/\bt\(\s*['"]([A-Za-z0-9_.]+)['"]/g)) {
        if (!has(en, m[1])) missing.push(`en:${m[1]}`)
        if (!has(zh, m[1])) missing.push(`zh:${m[1]}`)
      }
      expect([...new Set(missing)]).toEqual([])
    })
  }
})
