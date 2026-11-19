/**
 * i18n 初始化（i18next + vue-i18n 格式兼容层）。
 *
 * 约束（交接书 §5.7）：
 *  - 实例惰性创建，模块顶层不读取 localStorage / navigator（构建期预渲染在 Node 中执行）；
 *  - 语言检测与 Vue 版一致：localStorage.sub2api_locale → 浏览器语言 zh* → en；
 *  - 切换语言同步 <html lang>，并通知订阅者（标题管理、日期库等）。
 */
import i18next, { type i18n as I18nInstance, type TOptions } from 'i18next'
import { initReactI18next } from 'react-i18next'
import { STORAGE_KEYS } from '@/constants/storage'
import { applyCompat, normalizeMessages } from './compat'

export type LocaleCode = 'en' | 'zh'
type LocaleMessages = Record<string, unknown>

const DEFAULT_LOCALE: LocaleCode = 'en'

const localeLoaders: Record<LocaleCode, () => Promise<{ default: LocaleMessages }>> = {
  en: () => import('./locales/en'),
  zh: () => import('./locales/zh')
}

export const availableLocales = [
  { code: 'en', name: 'English', flag: '🇺🇸' },
  { code: 'zh', name: '中文', flag: '🇨🇳' }
] as const

export function isLocaleCode(value: unknown): value is LocaleCode {
  return value === 'en' || value === 'zh'
}

export function detectLocale(): LocaleCode {
  if (typeof window === 'undefined') return DEFAULT_LOCALE
  try {
    const saved = window.localStorage.getItem(STORAGE_KEYS.locale)
    if (isLocaleCode(saved)) return saved
  } catch {
    /* storage unavailable */
  }
  const browserLang = (typeof navigator !== 'undefined' ? navigator.language : '').toLowerCase()
  return browserLang.startsWith('zh') ? 'zh' : DEFAULT_LOCALE
}

let instance: I18nInstance | null = null
let currentLocale: LocaleCode | null = null
const loadedLocales = new Set<LocaleCode>()
const listeners = new Set<(locale: LocaleCode) => void>()

function ensureInstance(): I18nInstance {
  if (instance) return instance
  const created = i18next.createInstance()
  created.use(initReactI18next).use({
    type: 'postProcessor',
    name: 'vueI18nCompat',
    process: (value: string, _key: string | string[], options: Record<string, unknown>) =>
      applyCompat(value, options)
  })
  currentLocale = currentLocale ?? detectLocale()
  void created.init({
    lng: currentLocale,
    fallbackLng: DEFAULT_LOCALE,
    resources: {},
    keySeparator: '.',
    nsSeparator: false,
    returnNull: false,
    interpolation: { prefix: '{', suffix: '}', escapeValue: false },
    postProcess: ['vueI18nCompat'],
    react: { useSuspense: false }
  })
  instance = created
  return created
}

export function getI18n(): I18nInstance {
  return ensureInstance()
}

export function getLocale(): LocaleCode {
  if (!currentLocale) currentLocale = detectLocale()
  return currentLocale
}

export async function loadLocaleMessages(locale: LocaleCode): Promise<void> {
  if (loadedLocales.has(locale)) return
  const loaded = await localeLoaders[locale]()
  ensureInstance().addResourceBundle(locale, 'translation', normalizeMessages(loaded.default), true, true)
  loadedLocales.add(locale)
}

export function onLocaleChange(listener: (locale: LocaleCode) => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export async function initI18n(): Promise<void> {
  const current = getLocale()
  // fallback 语言先于当前语言就绪，避免缺键时回显键名
  if (current !== DEFAULT_LOCALE) await loadLocaleMessages(DEFAULT_LOCALE)
  await loadLocaleMessages(current)
  await ensureInstance().changeLanguage(current)
  document.documentElement.setAttribute('lang', current)
}

export async function setLocale(locale: string): Promise<void> {
  if (!isLocaleCode(locale)) return
  await loadLocaleMessages(locale)
  currentLocale = locale
  await ensureInstance().changeLanguage(locale)
  try {
    window.localStorage.setItem(STORAGE_KEYS.locale, locale)
  } catch {
    /* ignore */
  }
  document.documentElement.setAttribute('lang', locale)
  listeners.forEach((listener) => listener(locale))
}

/** 非 React 场景下的翻译函数。 */
export function t(key: string, options?: TOptions): string {
  const i18n = ensureInstance()
  return (options ? i18n.t(key, options) : i18n.t(key)) as string
}

export default getI18n
