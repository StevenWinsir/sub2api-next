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

/**
 * 语言包按 scope 分块（首屏 JS 预算）：
 *  - core：首屏加载（公共页、认证页、安装向导）；
 *  - console：admin.* / adminAccessKeys.*（体量最大），控制台布局（用户 / 管理）渲染前按需加载。
 */
export type LocaleScope = 'core' | 'console'

const localeLoaders: Record<LocaleScope, Record<LocaleCode, () => Promise<{ default: LocaleMessages }>>> = {
  core: {
    en: () => import('./locales/en/core'),
    zh: () => import('./locales/zh/core')
  },
  console: {
    en: () => import('./locales/en/console'),
    zh: () => import('./locales/zh/console')
  }
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
const loadedBundles = new Set<string>() // `${scope}:${locale}`
const requestedScopes = new Set<LocaleScope>(['core'])
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

export async function loadLocaleMessages(locale: LocaleCode, scope: LocaleScope = 'core'): Promise<void> {
  const id = `${scope}:${locale}`
  if (loadedBundles.has(id)) return
  const loaded = await localeLoaders[scope][locale]()
  ensureInstance().addResourceBundle(locale, 'translation', normalizeMessages(loaded.default), true, true)
  loadedBundles.add(id)
}

/** 确保某个 scope 的当前语言包已就绪（切换语言时也会随之加载）。 */
export async function ensureLocaleScope(scope: LocaleScope): Promise<void> {
  requestedScopes.add(scope)
  await loadLocaleMessages(getLocale(), scope)
}

/** 路由布局所需的 scope：控制台布局（用户 / 管理）需要 console 语言包。 */
export function scopeForLayout(layout: string | null | undefined): LocaleScope {
  return layout === 'console-admin' || layout === 'console-user' ? 'console' : 'core'
}

export function onLocaleChange(listener: (locale: LocaleCode) => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export async function initI18n(): Promise<void> {
  const current = getLocale()
  // 只加载当前语言（首屏 JS 预算）：中英键集合一致由 localeKeyCompleteness 测试保证，fallback 只兜底已加载的英文
  await loadLocaleMessages(current)
  await ensureInstance().changeLanguage(current)
  document.documentElement.setAttribute('lang', current)
}

export async function setLocale(locale: string): Promise<void> {
  if (!isLocaleCode(locale)) return
  await Promise.all([...requestedScopes].map((scope) => loadLocaleMessages(locale, scope)))
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
