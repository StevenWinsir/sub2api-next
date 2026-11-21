/**
 * /custom/[id]：自定义菜单页。
 *  - Markdown 模式（page_slug 或 md: 前缀）：渲染 /pages/:slug，生成目录并给代码块加复制按钮；
 *  - URL 模式：iframe 嵌入，并按约定拼接 token / lang / theme / user_id / src_host / src_url / ui_mode（对外契约，不得改动）。
 */
import * as React from 'react'
import DOMPurify from 'dompurify'
import { marked } from 'marked'
import { ExternalLink, Link2, List, Loader2, X } from 'lucide-react'
import { buildApiUrl } from '@/api/url'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { getLocale, t } from '@/i18n'
import { useLocale } from '@/i18n/react'
import { cn } from '@/lib/utils'
import { useAdminSettingsStore } from '@/stores/adminSettings'
import { useAppStore } from '@/stores/app'
import { useAuthStore } from '@/stores/auth'
import { buildEmbeddedUrl, detectTheme } from '@/utils/embedded-url'
import { injectHeadingIds, markdownSlugOf, rewriteRelativeImages, type TocItem } from './pageMarkdown'

function useTheme(): 'light' | 'dark' {
  const [theme, setTheme] = React.useState<'light' | 'dark'>('light')
  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 水合后读取 <html> 的 dark class
    setTheme(detectTheme())
    const observer = new MutationObserver(() => setTheme(detectTheme()))
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [])
  return theme
}

function MarkdownPage({ slug }: { slug: string }) {
  const token = useAuthStore((s) => s.token)
  const [html, setHtml] = React.useState('')
  const [toc, setToc] = React.useState<TocItem[]>([])
  const [loading, setLoading] = React.useState(true)
  const [tocVisible, setTocVisible] = React.useState(() => window.innerWidth > 768)
  const [active, setActive] = React.useState('')
  const container = React.useRef<HTMLDivElement | null>(null)

  React.useEffect(() => {
    let current = true
    const run = async () => {
      setLoading(true)
      setToc([])
      setActive('')
      try {
        const resp = await fetch(buildApiUrl(`/pages/${encodeURIComponent(slug)}`), {
          headers: token ? { Authorization: `Bearer ${token}` } : {}
        })
        if (!current) return
        if (!resp.ok) {
          setHtml(`<p class="text-destructive">${DOMPurify.sanitize(t('common.pageNotFound'))}</p>`)
          return
        }
        const raw = rewriteRelativeImages(await resp.text(), slug)
        if (!current) return
        const sanitized = DOMPurify.sanitize(marked.parse(raw, { async: false }) as string, {
          ADD_TAGS: ['iframe'],
          ADD_ATTR: ['allowfullscreen', 'frameborder', 'src']
        })
        const result = injectHeadingIds(sanitized)
        setHtml(result.html)
        setToc(result.toc)
      } catch {
        if (current) setHtml('<p class="text-destructive">Failed to load page</p>')
      } finally {
        if (current) setLoading(false)
      }
    }
    void run()
    return () => {
      current = false
    }
  }, [slug, token])

  // 代码块复制按钮
  React.useEffect(() => {
    const root = container.current
    if (!root || loading) return
    const cleanups: (() => void)[] = []
    root.querySelectorAll('pre').forEach((pre) => {
      if (pre.querySelector('.copy-btn')) return
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className =
        'copy-btn absolute right-2 top-2 rounded border bg-card px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground'
      btn.textContent = t('customPage.copyCode')
      const onClick = async () => {
        const code = pre.querySelector('code')?.textContent ?? pre.textContent ?? ''
        try {
          await navigator.clipboard.writeText(code)
          btn.textContent = t('customPage.copiedCode')
        } catch {
          btn.textContent = t('customPage.copyCodeFailed')
        }
        setTimeout(() => (btn.textContent = t('customPage.copyCode')), 2000)
      }
      btn.addEventListener('click', onClick)
      pre.style.position = 'relative'
      pre.appendChild(btn)
      cleanups.push(() => {
        btn.removeEventListener('click', onClick)
        btn.remove()
      })
    })
    return () => cleanups.forEach((fn) => fn())
  }, [html, loading])

  const onScroll = () => {
    const root = container.current
    if (!root || toc.length === 0) return
    const top = root.getBoundingClientRect().top
    let cur = ''
    for (const item of toc) {
      const el = root.querySelector<HTMLElement>(`#${CSS.escape(item.id)}`)
      if (el && el.getBoundingClientRect().top - top <= 100) cur = item.id
    }
    setActive(cur)
  }
  const go = (id: string) => {
    const el = container.current?.querySelector(`#${CSS.escape(id)}`)
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    setActive(id)
    if (window.innerWidth <= 640) setTocVisible(false)
  }

  if (loading) {
    return (
      <div
        className="flex h-full items-center justify-center py-12"
        role="status"
        aria-label={t('common.loading')}
      >
        <Loader2 className="size-7 animate-spin text-primary" aria-hidden />
      </div>
    )
  }
  return (
    <div className="flex h-full overflow-hidden">
      {tocVisible && toc.length > 0 ? (
        <aside className="w-56 shrink-0 overflow-y-auto border-r p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase text-muted-foreground">
              {t('customPage.tableOfContents')}
            </span>
            <Button
              size="icon"
              variant="ghost"
              className="size-6"
              aria-label={t('common.close')}
              onClick={() => setTocVisible(false)}
            >
              <X aria-hidden />
            </Button>
          </div>
          <nav className="space-y-0.5">
            {toc.map((item) => (
              <a
                key={item.id}
                href={`#${item.id}`}
                onClick={(e) => {
                  e.preventDefault()
                  go(item.id)
                }}
                style={{ paddingLeft: `${(item.level - 1) * 12 + 8}px` }}
                className={cn(
                  'block truncate rounded py-1 pr-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground',
                  active === item.id && 'bg-accent font-medium text-accent-foreground'
                )}
              >
                {item.text}
              </a>
            ))}
          </nav>
        </aside>
      ) : null}
      {!tocVisible && toc.length > 0 ? (
        <Button
          size="sm"
          variant="outline"
          className="absolute left-2 top-2 z-10"
          onClick={() => setTocVisible(true)}
        >
          <List aria-hidden />
          {t('customPage.tableOfContents')}
        </Button>
      ) : null}
      {/* 内容经 DOMPurify 清洗后渲染 */}
      <div
        ref={container}
        onScroll={onScroll}
        className="markdown-body markdown-page-content h-full flex-1 overflow-auto p-6 md:p-10"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  )
}

/** 可拖动的“新标签页打开”浮动按钮（拖动后不触发点击）。 */
function EmbedFrame({ url, hideOpen }: { url: string; hideOpen: boolean }) {
  const shell = React.useRef<HTMLDivElement | null>(null)
  const button = React.useRef<HTMLAnchorElement | null>(null)
  const [pos, setPos] = React.useState<{ x: number; y: number } | null>(null)
  const drag = React.useRef<{ id: number; sx: number; sy: number; x: number; y: number } | null>(null)
  const suppress = React.useRef(false)

  const place = React.useCallback((x: number, y: number) => {
    const s = shell.current
    const b = button.current
    if (!s || !b) return
    setPos({
      x: Math.max(0, Math.min(x, s.clientWidth - b.offsetWidth)),
      y: Math.max(0, Math.min(y, s.clientHeight - b.offsetHeight))
    })
  }, [])

  React.useEffect(() => {
    const s = shell.current
    if (!s || typeof ResizeObserver === 'undefined') return
    // 容器尺寸变化时把已拖动的按钮夹回可视范围
    const ro = new ResizeObserver(() =>
      setPos((p) => {
        const b = button.current
        if (!p || !b) return p
        return {
          x: Math.max(0, Math.min(p.x, s.clientWidth - b.offsetWidth)),
          y: Math.max(0, Math.min(p.y, s.clientHeight - b.offsetHeight))
        }
      })
    )
    ro.observe(s)
    return () => ro.disconnect()
  }, [])

  return (
    <div ref={shell} className="relative h-full min-h-[70vh] w-full">
      {!hideOpen ? (
        <a
          ref={button}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="absolute right-3 top-3 z-10 inline-flex h-8 touch-none items-center gap-1.5 rounded-md border bg-card px-3 text-[13px] font-medium shadow-sm hover:bg-muted"
          style={pos ? { left: pos.x, top: pos.y, right: 'auto' } : undefined}
          draggable={false}
          onPointerDown={(e) => {
            if (e.button !== 0 || !e.isPrimary || !button.current) return
            suppress.current = false
            drag.current = {
              id: e.pointerId,
              sx: e.clientX,
              sy: e.clientY,
              x: button.current.offsetLeft,
              y: button.current.offsetTop
            }
            // 指针捕获：移动经过 iframe 时仍能收到事件
            button.current.setPointerCapture(e.pointerId)
          }}
          onPointerMove={(e) => {
            const d = drag.current
            if (!d || e.pointerId !== d.id) return
            const dx = e.clientX - d.sx
            const dy = e.clientY - d.sy
            if (!suppress.current && Math.hypot(dx, dy) < 4) return
            suppress.current = true
            place(d.x + dx, d.y + dy)
            e.preventDefault()
          }}
          onPointerUp={(e) => {
            if (drag.current?.id !== e.pointerId) return
            drag.current = null
            if (button.current?.hasPointerCapture(e.pointerId))
              button.current.releasePointerCapture(e.pointerId)
          }}
          onPointerCancel={() => (drag.current = null)}
          onClick={(e) => {
            if (suppress.current && e.detail !== 0) e.preventDefault()
            suppress.current = false
          }}
        >
          <ExternalLink className="size-3.5" aria-hidden />
          {t('customPage.openInNewTab')}
        </a>
      ) : null}
      <iframe src={url} title="custom page" className="h-full min-h-[70vh] w-full border-0" allowFullScreen />
    </div>
  )
}

function Notice({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="flex h-full items-center justify-center p-10 text-center">
      <div className="max-w-md">
        <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-muted">
          <Link2 className="size-5 text-muted-foreground" aria-hidden />
        </div>
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{desc}</p>
      </div>
    </div>
  )
}

export function CustomPage() {
  useLocale()
  const id = React.useMemo(
    () => decodeURIComponent(window.location.pathname.split('/').filter(Boolean)[1] ?? ''),
    []
  )
  const settings = useAppStore((s) => s.cachedPublicSettings)
  const loaded = useAppStore((s) => s.publicSettingsLoaded)
  const isAdmin = useAuthStore((s) => s.isAdmin)
  const user = useAuthStore((s) => s.user)
  const token = useAuthStore((s) => s.token)
  const adminItems = useAdminSettingsStore((s) => s.customMenuItems)
  const theme = useTheme()

  React.useEffect(() => {
    if (!loaded) void useAppStore.getState().fetchPublicSettings()
  }, [loaded])

  const item =
    (settings?.custom_menu_items ?? []).find((i) => i.id === id) ??
    (isAdmin ? (adminItems.find((i) => i.id === id) ?? null) : null)
  const slug = markdownSlugOf(item)
  const url = item && !slug ? buildEmbeddedUrl(item.url, user?.id, token, theme, getLocale()) : ''
  const validUrl = url.startsWith('http://') || url.startsWith('https://')

  return (
    <Card className="relative min-h-[calc(100vh-10rem)] overflow-hidden">
      {!loaded && !settings ? (
        <div
          className="flex h-full items-center justify-center py-12"
          role="status"
          aria-label={t('common.loading')}
        >
          <Loader2 className="size-7 animate-spin text-primary" aria-hidden />
        </div>
      ) : !item ? (
        <Notice title={t('customPage.notFoundTitle')} desc={t('customPage.notFoundDesc')} />
      ) : slug ? (
        <MarkdownPage slug={slug} />
      ) : !validUrl ? (
        <Notice title={t('customPage.notConfiguredTitle')} desc={t('customPage.notConfiguredDesc')} />
      ) : (
        <EmbedFrame url={url} hideOpen={!!item.hide_open_button} />
      )}
    </Card>
  )
}
