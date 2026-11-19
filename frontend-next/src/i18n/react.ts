import * as React from 'react'
import { getLocale, onLocaleChange, type LocaleCode } from '@/i18n'

/** 订阅当前语言；服务端 / 水合阶段返回 'en'（与构建期预渲染一致），之后同步真实语言。 */
export function useLocale(): LocaleCode {
  return React.useSyncExternalStore(onLocaleChange, getLocale, () => 'en' as LocaleCode)
}
