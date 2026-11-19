/**
 * 深链纠正（Boot）的纯逻辑（交接书 §5.3.3）。
 *
 * 场景：用户直接访问或刷新 `/admin/users?page=2#x`，后端返回根 index.html，
 * 此时 Next 认为当前页面是 `/`。Boot 读取真实地址并决定：
 *  - pathname 为 `/`           → replace 到 `/home`
 *  - 匹配注册表                → replace 到完整原始 URL（保留 search 与 hash，OAuth 令牌在 fragment 里）
 *  - 匹配不到                  → 不跳转，直接渲染 404（避免 Next 加载失败后硬刷新形成死循环）
 *  - 短时间内重复纠正          → 停止并展示错误页
 */
import { matchRoute } from './routes'
import { STORAGE_KEYS } from '@/constants/storage'

export type BootDecision = { type: 'replace'; to: string } | { type: 'not-found' }

export interface BootLocation {
  pathname: string
  search: string
  hash: string
}

export const BOOT_LOOP_WINDOW_MS = 10_000
export const BOOT_LOOP_MAX_ATTEMPTS = 3

interface CorrectionRecord {
  count: number
  firstAt: number
}

export function parseCorrectionRecord(raw: string | null): CorrectionRecord | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<CorrectionRecord>
    if (typeof parsed.count === 'number' && typeof parsed.firstAt === 'number') {
      return { count: parsed.count, firstAt: parsed.firstAt }
    }
  } catch {
    /* ignore */
  }
  return null
}

/** 只读：当前窗口内是否已经进入纠正循环（可在渲染期调用，无副作用）。 */
export function isBootLoop(storage: Pick<Storage, 'getItem'>, now = Date.now()): boolean {
  const prev = parseCorrectionRecord(storage.getItem(STORAGE_KEYS.bootCorrection))
  return !!prev && now - prev.firstAt <= BOOT_LOOP_WINDOW_MS && prev.count >= BOOT_LOOP_MAX_ATTEMPTS
}

/** 记录一次纠正并判断是否进入循环（写入 sessionStorage）。 */
export function recordCorrection(storage: Pick<Storage, 'getItem' | 'setItem'>, now = Date.now()): boolean {
  const prev = parseCorrectionRecord(storage.getItem(STORAGE_KEYS.bootCorrection))
  const inWindow = prev && now - prev.firstAt <= BOOT_LOOP_WINDOW_MS
  const next: CorrectionRecord = inWindow
    ? { count: prev.count + 1, firstAt: prev.firstAt }
    : { count: 1, firstAt: now }
  storage.setItem(STORAGE_KEYS.bootCorrection, JSON.stringify(next))
  return next.count > BOOT_LOOP_MAX_ATTEMPTS
}

/** 纠正成功（目标页面已渲染）后清除记录：防循环只统计"没有成功落地"的连续纠正。 */
export function clearCorrectionRecord(storage: Pick<Storage, 'removeItem'>): void {
  storage.removeItem(STORAGE_KEYS.bootCorrection)
}

export function decideBoot(location: BootLocation): BootDecision {
  const { pathname, search, hash } = location
  if (pathname === '/' || pathname === '') {
    // 保留 search / hash（如 `/?aff=xxx`）
    return { type: 'replace', to: `/home${search}${hash}` }
  }
  if (matchRoute(pathname)) {
    return { type: 'replace', to: `${pathname}${search}${hash}` }
  }
  return { type: 'not-found' }
}
