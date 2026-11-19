import { describe, expect, it } from 'vitest'
import {
  findInlineExecutableScripts,
  verifyIndexHtml,
  verifyNoExtraHtml,
  verifyTopLevelEntries
} from './lib/verifyExport.mjs'

const GOOD = `<!DOCTYPE html><html><head><meta charset="utf-8"/><link rel="icon" href="/logo.svg"/><title>Sub2API - AI API Gateway</title><script src="/theme-init.js"></script><script id="__NEXT_DATA__" type="application/json">{"page":"/"}</script></head><body><div id="__next"></div><script src="/_next/static/a.js" defer></script></body></html>`

describe('verifyIndexHtml', () => {
  it('passes for a CSP-safe export', () => {
    expect(verifyIndexHtml(GOOD)).toEqual([])
  })
  it('requires </head>, <title> and a byte-exact icon link', () => {
    expect(verifyIndexHtml('<html><body></body></html>')).toHaveLength(3)
    expect(verifyIndexHtml(GOOD.replace('<link rel="icon"', '<link href="/x" rel="icon"'))).toHaveLength(1)
  })
  it('rejects inline executable scripts but allows JSON data blocks', () => {
    const bad = GOOD.replace('</body>', '<script>window.x=1</script></body>')
    expect(verifyIndexHtml(bad)[0]).toMatch(/内联可执行脚本/)
    expect(findInlineExecutableScripts(GOOD)).toEqual([])
  })
  it('rejects eval usage', () => {
    expect(verifyIndexHtml(GOOD.replace('</body>', 'eval(1)</body>')).length).toBeGreaterThan(0)
  })
})

describe('verifyTopLevelEntries / verifyNoExtraHtml', () => {
  it('flags reserved backend names', () => {
    expect(verifyTopLevelEntries(['_next', 'images', 'static', 'models'])).toHaveLength(2)
    expect(verifyTopLevelEntries(['_next', 'static', 'brand'])).toEqual([])
  })
  it('flags extra html files', () => {
    expect(verifyNoExtraHtml(['index.html', 'admin/users.html'])).toHaveLength(1)
  })
})
