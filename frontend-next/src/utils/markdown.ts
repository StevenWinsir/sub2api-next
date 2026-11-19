import { marked } from 'marked'
import DOMPurify from 'dompurify'

/**
 * Markdown → 经 DOMPurify 清洗的 HTML（公告、合规文档、法律文档、模型广场说明）。
 * 外链统一加 rel="noopener noreferrer" 与 target="_blank"。
 */
export function renderMarkdownSafe(markdown: string): string {
  if (!markdown) return ''
  const html = marked.parse(markdown, { async: false, gfm: true }) as string
  const clean = DOMPurify.sanitize(html, { ADD_ATTR: ['target'] })
  if (typeof document === 'undefined') return clean
  const tpl = document.createElement('template')
  tpl.innerHTML = clean
  tpl.content.querySelectorAll('a[href]').forEach((a) => {
    const href = a.getAttribute('href') || ''
    if (/^https?:\/\//i.test(href)) {
      a.setAttribute('target', '_blank')
      a.setAttribute('rel', 'noopener noreferrer')
    }
  })
  return tpl.innerHTML
}
