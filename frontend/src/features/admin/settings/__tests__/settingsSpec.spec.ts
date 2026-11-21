import { describe, expect, it } from 'vitest'
import en from '@/i18n/locales/en'
import zh from '@/i18n/locales/zh'
import { SETTINGS_SPEC, collectSpecKeys } from '../settingsSpec'
import { defaultSettingsForm } from '../settingsModel'

function has(obj: unknown, key: string): boolean {
  let cur = obj as Record<string, unknown> | string | undefined
  for (const part of key.split('.')) {
    if (cur === null || typeof cur !== 'object') return false
    cur = (cur as Record<string, unknown>)[part] as Record<string, unknown> | string | undefined
    if (cur === undefined) return false
  }
  return typeof cur === 'string'
}

describe('settings field spec', () => {
  it('every referenced locale key exists in both languages', () => {
    const missing: string[] = []
    for (const key of collectSpecKeys()) {
      if (!has(en, key)) missing.push(`en:${key}`)
      if (!has(zh, key)) missing.push(`zh:${key}`)
    }
    // 没有 hint 的字段不要求 adminUi.settings.f.<name>Hint
    expect(missing.filter((k) => !k.endsWith('Hint'))).toEqual([])
  })

  it('every field name exists in the default form', () => {
    const form = defaultSettingsForm({ terms: '', usage: '', regions: '', service: '' }) as unknown as Record<
      string,
      unknown
    >
    const unknown: string[] = []
    for (const cards of Object.values(SETTINGS_SPEC))
      for (const c of cards) for (const fl of c.fields) if (!(fl.name in form)) unknown.push(fl.name)
    expect(unknown).toEqual([])
  })
})
