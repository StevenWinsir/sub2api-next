import { describe, expect, it } from 'vitest'
import {
  generateHeadingId,
  injectHeadingIds,
  isRelativeMarkdownAsset,
  markdownSlugOf,
  rewriteRelativeImages
} from '../pageMarkdown'

describe('markdown slug', () => {
  it('prefers page_slug and falls back to md: urls', () => {
    expect(markdownSlugOf(null)).toBe('')
    expect(markdownSlugOf({ page_slug: 'guide', url: 'https://x' })).toBe('guide')
    expect(markdownSlugOf({ url: 'md:faq' })).toBe('faq')
    expect(markdownSlugOf({ url: 'https://x' })).toBe('')
  })
})

describe('relative assets', () => {
  it('only rewrites safe relative paths', () => {
    expect(isRelativeMarkdownAsset('img/a.png')).toBe(true)
    expect(isRelativeMarkdownAsset('./a.png?x=1')).toBe(true)
    expect(isRelativeMarkdownAsset('https://e.com/a.png')).toBe(false)
    expect(isRelativeMarkdownAsset('//e.com/a.png')).toBe(false)
    expect(isRelativeMarkdownAsset('/abs.png')).toBe(false)
    expect(isRelativeMarkdownAsset('../secret.png')).toBe(false)
    expect(isRelativeMarkdownAsset('a\\b.png')).toBe(false)
    expect(isRelativeMarkdownAsset('data:image/png;base64,xx')).toBe(false)
  })
  it('rewrites image links to the page image endpoint', () => {
    const out = rewriteRelativeImages('![logo](img/a b.png) ![ext](https://e.com/x.png)', 'my page')
    expect(out).toContain('/pages/my%20page/images/img/a%20b.png')
    expect(out).toContain('![ext](https://e.com/x.png)')
  })
})

describe('headings', () => {
  it('generates stable ids and a toc', () => {
    expect(generateHeadingId('Hello World', 2)).toBe('hello-world-2')
    expect(generateHeadingId('！！', 0)).toBe('heading-0')
    const { html, toc } = injectHeadingIds('<h1>Intro</h1><p>x</p><h3>Sub <b>part</b></h3>')
    expect(html).toContain('<h1 id="intro-0">')
    expect(toc).toEqual([
      { id: 'intro-0', text: 'Intro', level: 1 },
      { id: 'sub-part-1', text: 'Sub part', level: 3 }
    ])
  })
})
