/**
 * 安全静态检查与 XSS 回归（交接书 §8 R5 安全检查）：
 *  - 任何 dangerouslySetInnerHTML 都必须出现在登记清单里，并经过净化函数（唯一例外见 HOME_CONTENT_EXCEPTION）；
 *  - 公告 / 自定义菜单图标 / 用户名等展示位的 XSS 载荷不会生成可执行节点；
 *  - 源码里没有 eval / new Function / document.write；
 *  - 所有 message 事件监听都校验来源。
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { renderMarkdownSafe } from '@/utils/markdown'
import { sanitizeSvg } from '@/utils/sanitize'

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) {
      if (['__tests__', 'generated', 'locales'].includes(name)) continue
      walk(p, out)
    } else if (/\.(ts|tsx)$/.test(name)) out.push(p)
  }
  return out
}
const files = walk('src')
const read = (f: string) => readFileSync(f, 'utf8')

/** 登记的 dangerouslySetInnerHTML 使用点 → 必须出现的净化手段 */
const INNER_HTML_ALLOW: Record<string, RegExp> = {
  'src/features/custom-page/CustomPage.tsx': /pageMarkdown/,
  'src/features/payment/PurchasePage.tsx': /renderMarkdownSafe/,
  'src/features/admin/settings/SettingsBlocks.tsx': /sanitizeSvg/,
  'src/features/admin/announcements/AnnouncementsPage.tsx': /renderMarkdownSafe/,
  'src/features/admin/common/AdminComplianceDialog.tsx': /renderMarkdownSafe|markdown/i,
  'src/features/announcements/AnnouncementPopup.tsx': /renderMarkdownSafe/,
  'src/features/legal/LegalDocumentPage.tsx': /renderMarkdownSafe|markdown/i,
  'src/features/model-plaza/ModelPlazaPage.tsx': /renderMarkdownSafe/,
  'src/components/layout/AnnouncementBell.tsx': /renderMarkdownSafe/,
  'src/components/layout/Sidebar.tsx': /sanitizeSvg/
}
/** 管理员配置的首页自定义 HTML：与 Vue 版 v-html 行为一致（CSP 禁止内联事件处理器 / 脚本，风险已接受并在 README 登记）。 */
const HOME_CONTENT_EXCEPTION = 'src/features/home/HomePage.tsx'

describe('dangerouslySetInnerHTML audit', () => {
  const users = files.filter((f) => read(f).includes('dangerouslySetInnerHTML'))
  it('every usage site is registered', () => {
    const unknown = users.filter((f) => !(f in INNER_HTML_ALLOW) && f !== HOME_CONTENT_EXCEPTION)
    expect(unknown).toEqual([])
  })
  for (const [file, re] of Object.entries(INNER_HTML_ALLOW)) {
    it(`${file} routes HTML through a sanitizer`, () => {
      expect(re.test(read(file))).toBe(true)
    })
  }
})

describe('XSS payloads are neutralised', () => {
  const payloads = [
    '<img src=x onerror=alert(1)>',
    '<script>alert(1)</script>',
    '<a href="javascript:alert(1)">x</a>',
    '<svg onload=alert(1)>',
    '<iframe src="javascript:alert(1)"></iframe>',
    '[x](javascript:alert(1))'
  ]
  it('markdown (announcements, plaza, purchase notices, legal) drops scripts, handlers and javascript: URLs', () => {
    for (const p of payloads) {
      const html = renderMarkdownSafe(p).toLowerCase()
      expect(html, p).not.toMatch(/<script|onerror=|onload=|javascript:|<iframe/)
    }
  })
  it('custom menu SVG icons keep drawing primitives but lose scripts and handlers', () => {
    const out = sanitizeSvg(
      '<svg viewBox="0 0 1 1" onload="alert(1)"><script>alert(1)</script><path d="M0 0L1 1"/><a href="javascript:alert(1)"><circle r="1"/></a></svg>'
    ).toLowerCase()
    expect(out).toContain('<path')
    expect(out).not.toMatch(/<script|onload=|javascript:/)
  })
})

describe('source hygiene', () => {
  it('has no eval / new Function / document.write / string timers', () => {
    const bad: string[] = []
    for (const f of files) {
      const src = read(f)
      if (
        /\beval\s*\(|new Function\s*\(|document\.write\s*\(|setTimeout\(\s*['"`]|setInterval\(\s*['"`]/.test(
          src
        )
      )
        bad.push(f)
    }
    expect(bad).toEqual([])
  })
  it('every window message listener validates the sender', () => {
    const offenders: string[] = []
    for (const f of files) {
      const src = read(f)
      if (!/addEventListener\(\s*['"]message['"]/.test(src)) continue
      // 插件桥接在 PluginBridge.handle 内校验 source / origin / bridge_token；其余监听器需出现 origin 校验
      if (f.endsWith('PluginsPage.tsx')) {
        if (!read('src/features/admin/plugins/pluginBridge.ts').includes("event.origin !== 'null'"))
          offenders.push(f)
        continue
      }
      if (!/\.origin\b/.test(src)) offenders.push(f)
    }
    expect(offenders).toEqual([])
  })
  it('plugin iframes are sandboxed without same-origin', () => {
    const src = read('src/features/admin/plugins/PluginsPage.tsx')
    expect(src).toContain('sandbox="allow-scripts"')
    expect(src).not.toMatch(/sandbox="[^"]*allow-same-origin/)
    expect(read('src/features/admin/settings/SettingsEmail.tsx')).toContain('sandbox=""')
  })
})
