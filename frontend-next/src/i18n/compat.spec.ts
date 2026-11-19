import { beforeAll, describe, expect, it } from 'vitest'
import { applyCompat, normalizeMessage, pickPluralChoice } from './compat'
import { getI18n, loadLocaleMessages, setLocale, t } from '.'

describe('vue-i18n compatibility layer', () => {
  it("restores literal escapes {'@'} {'{'} {'}'}", () => {
    expect(normalizeMessage("user:pass{'@'}host")).toBe('user:pass@host')
    expect(applyCompat(normalizeMessage("{'{'}billing_header{'}'} stays"))).toBe('{billing_header} stays')
  })

  it('picks plural choices like vue-i18n', () => {
    expect(pickPluralChoice(['1 item', '{n} items'], 1)).toBe('1 item')
    expect(pickPluralChoice(['1 item', '{n} items'], 5)).toBe('{n} items')
    expect(pickPluralChoice(['1 item', '{n} items'], 0)).toBe('{n} items')
    expect(pickPluralChoice(['none', 'one', 'many'], 0)).toBe('none')
    expect(pickPluralChoice(['none', 'one', 'many'], 1)).toBe('one')
    expect(pickPluralChoice(['none', 'one', 'many'], 9)).toBe('many')
  })

  describe('with real locale files', () => {
    beforeAll(async () => {
      getI18n()
      await loadLocaleMessages('en')
      await loadLocaleMessages('zh')
      await setLocale('en')
    })

    it('interpolates single-brace params and does not HTML-escape', () => {
      expect(t('common.time.daysAgo', { n: 3 })).toMatch(/3/)
      expect(t('batchImage.list.selectedJobs', { count: 1 })).toBeTruthy()
    })

    it('handles plural messages by count / n', () => {
      expect(t('batchImage.list.childCount', { n: 1 })).toBe('1 subtask')
      expect(t('batchImage.list.childCount', { n: 4 })).toBe('4 subtasks')
      expect(t('announcements.newCount', { count: 2 })).toBe('2 new announcements')
    })

    it('resolves literal @ in proxy hint', () => {
      expect(t('admin.proxies.batchInputHint')).toContain('[user:pass@]host')
    })

    it('switches language and keeps fallback to English', async () => {
      await setLocale('zh')
      expect(t('ui.shell.signOut')).toBe('退出登录')
      await setLocale('en')
      expect(t('ui.shell.signOut')).toBe('Sign out')
    })

    it('returns the key for missing messages (used by title fallback)', () => {
      expect(t('no.such.key')).toBe('no.such.key')
    })
  })
})
