import { describe, expect, it } from 'vitest'

import enCore from '../locales/en/core'
import zhCore from '../locales/zh/core'
import enConsole from '../locales/en/console'
import zhConsole from '../locales/zh/console'

/**
 * 语言包按 scope 分块（core / console）：admin.* 与 adminAccessKeys.*（体量最大）只在控制台布局渲染前加载。
 * 这里守护两件事：分块互不重叠；公共页代码不引用 console 里的键（否则首屏会回显键名）。
 */
describe('locale scopes', () => {
  it('keeps the console scope disjoint from core (en and zh)', () => {
    for (const [core, scoped] of [
      [enCore, enConsole],
      [zhCore, zhConsole]
    ] as const) {
      expect(Object.keys(scoped).filter((k) => k in core)).toEqual([])
      expect(Object.keys(scoped).sort()).toEqual(['admin', 'adminAccessKeys'])
    }
  })

  it('does not reference console-scope keys from public / auth / setup code', () => {
    const files = import.meta.glob('../../**/*.{ts,tsx}', {
      query: '?raw',
      import: 'default',
      eager: true
    }) as Record<string, string>
    const publicCode =
      /\/features\/(auth|home|setup|key-usage|legal|model-plaza)\/|\/components\/(layout\/(Public|Auth|Blank)Layout|captcha\/|PasswordInput|PlatformIcon)/
    const offenders: string[] = []
    for (const [path, source] of Object.entries(files)) {
      if (/\/__tests__\/|\.(spec|test)\.tsx?$/.test(path) || !publicCode.test(path)) continue
      if (/\bt\(\s*['"`](admin|adminAccessKeys)\./.test(source)) offenders.push(path)
    }
    expect(offenders).toEqual([])
  })
})
