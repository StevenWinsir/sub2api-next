/** 自定义 Markdown 页面的纯逻辑（标题锚点 / TOC、相对图片改写、md: 槽位解析）。 */
import { buildApiUrl } from '@/api/url'
import type { CustomMenuItem } from '@/types'

export interface TocItem {
  id: string
  text: string
  level: number
}

/** 菜单项对应的 Markdown 页面 slug：page_slug 优先，其次 url 的 `md:` 前缀。 */
export function markdownSlugOf(item: Pick<CustomMenuItem, 'page_slug' | 'url'> | null | undefined): string {
  if (!item) return ''
  if (item.page_slug) return item.page_slug
  if (item.url?.startsWith('md:')) return item.url.slice(3)
  return ''
}

export function generateHeadingId(text: string, index: number): string {
  const base = text
    .toLowerCase()
    .replace(/[^\w一-鿿]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return base ? `${base}-${index}` : `heading-${index}`
}

/** 仅改写站内相对路径的图片（不含协议 / 绝对路径 / .. 逃逸）。 */
export function isRelativeMarkdownAsset(src: string): boolean {
  const trimmed = src.trim()
  if (!trimmed || /^[a-z][a-z0-9+.-]*:/i.test(trimmed) || trimmed.startsWith('//') || trimmed.startsWith('/'))
    return false
  const [pathPart] = trimmed.split(/([?#].*)/, 2)
  return pathPart
    .split('/')
    .filter((part) => part && part !== '.')
    .every((part) => part !== '..' && !part.includes('\\'))
}

export function buildPageImageUrl(slug: string, src: string): string {
  const [pathPart, suffix = ''] = src.trim().split(/([?#].*)/, 2)
  const encodedPath = pathPart
    .split('/')
    .filter((part) => part && part !== '.')
    .map((part) => encodeURIComponent(part))
    .join('/')
  return buildApiUrl(`/pages/${encodeURIComponent(slug)}/images/${encodedPath}${suffix}`)
}

export function rewriteRelativeImages(raw: string, slug: string): string {
  return raw.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (match, alt: string, src: string) =>
    isRelativeMarkdownAsset(src) ? `![${alt}](${buildPageImageUrl(slug, src)})` : match
  )
}

/** 给 h1–h4 注入 id 并生成目录。 */
export function injectHeadingIds(html: string): { html: string; toc: TocItem[] } {
  const toc: TocItem[] = []
  let index = 0
  const out = html.replace(/<(h[1-4])[^>]*>(.*?)<\/h[1-4]>/gi, (_m, tag: string, content: string) => {
    const level = parseInt(tag[1])
    const text = content.replace(/<[^>]+>/g, '').trim()
    const id = generateHeadingId(text, index++)
    toc.push({ id, text, level })
    return `<${tag} id="${id}">${content}</${tag}>`
  })
  return { html: out, toc }
}
