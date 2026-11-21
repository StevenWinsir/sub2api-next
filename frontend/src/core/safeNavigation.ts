/**
 * 安全导航封装（交接书 §5.3.3 / §5.9）。
 * 应用内跳转统一经过这里：目标先查注册表，未知路径渲染 404；外部链接用新窗口打开。
 * 自定义菜单、公告链接等由运营配置的地址都必须走这个封装。
 */
import { matchRoute } from './routes'

/** 登录后的 redirect 只接受以 `/` 开头且不以 `//` 开头的站内路径，防止开放重定向。 */
export function sanitizeRedirect(value: unknown, fallback = '/dashboard'): string {
  if (typeof value !== 'string') return fallback
  const trimmed = value.trim()
  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) return fallback
  // 反斜杠在部分浏览器里会被当成 `/`，`/\evil.com` 会变成协议相对地址
  if (trimmed.includes('\\')) return fallback
  // 控制字符（含制表符 / 换行）会被浏览器剥离，`/\t/evil.com` 可绕过 `//` 检查
  if (/[\u0000-\u001f\u007f]/.test(trimmed)) return fallback
  return trimmed
}

export type NavTarget =
  | { kind: 'internal'; href: string; known: boolean }
  | { kind: 'external'; href: string }
  | { kind: 'invalid' }

/** 解析一个运营配置的链接，决定如何打开。 */
export function resolveNavTarget(raw: string, currentOrigin?: string): NavTarget {
  const value = (raw || '').trim()
  if (!value) return { kind: 'invalid' }
  if (value.startsWith('/') && !value.startsWith('//')) {
    const pathname = value.split(/[?#]/)[0]
    return { kind: 'internal', href: value, known: matchRoute(pathname) !== null }
  }
  try {
    const url = new URL(value, currentOrigin)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return { kind: 'invalid' }
    if (currentOrigin && url.origin === currentOrigin) {
      return {
        kind: 'internal',
        href: `${url.pathname}${url.search}${url.hash}`,
        known: matchRoute(url.pathname) !== null
      }
    }
    return { kind: 'external', href: url.toString() }
  } catch {
    return { kind: 'invalid' }
  }
}
