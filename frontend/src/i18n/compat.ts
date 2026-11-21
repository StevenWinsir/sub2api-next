/**
 * vue-i18n 消息格式兼容层。
 *
 * 语言包与上游 vue-i18n 保持同一格式，便于直接同步：
 *  - 插值使用单花括号 `{name}`（i18next 通过 prefix/suffix 配置识别）；
 *  - `a | b` 复数选择（按 count / n，规则与 vue-i18n 默认一致）；
 *  - 字面量转义 `{'@'}`、`{'{'}`、`{'}'}` 还原为字面字符。
 */

const OPEN_BRACE = '\uE000'
const CLOSE_BRACE = '\uE001'

export type MessageTree = { [key: string]: MessageTree | string }

/** 加载语言包时预处理字面量转义，避免被插值引擎误识别。 */
export function normalizeMessage(message: string): string {
  return message
    .replace(/\{'\{'\}/g, OPEN_BRACE)
    .replace(/\{'\}'\}/g, CLOSE_BRACE)
    .replace(/\{'([^'{}]*)'\}/g, '$1')
}

export function normalizeMessages<T>(tree: T): T {
  if (typeof tree === 'string') return normalizeMessage(tree) as unknown as T
  if (Array.isArray(tree)) return tree.map((item) => normalizeMessages(item)) as unknown as T
  if (tree && typeof tree === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(tree as Record<string, unknown>)) {
      out[key] = normalizeMessages(value)
    }
    return out as T
  }
  return tree
}

/** vue-i18n 默认复数规则。 */
export function pickPluralChoice(choices: string[], count: number): string {
  const n = Math.abs(count)
  let index: number
  if (choices.length === 2) {
    index = n ? (n > 1 ? 1 : 0) : 1
  } else {
    index = n ? Math.min(n, 2) : 0
  }
  return (choices[index] ?? choices[choices.length - 1]).trim()
}

export function restoreLiterals(value: string): string {
  return value.split(OPEN_BRACE).join('{').split(CLOSE_BRACE).join('}')
}

/** i18next postProcessor：复数选择 + 字面量还原。 */
export function applyCompat(value: string, options?: Record<string, unknown>): string {
  let result = value
  const raw = options?.count ?? options?.n
  const count = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN
  if (!Number.isNaN(count) && result.includes(' | ')) {
    result = pickPluralChoice(result.split(' | '), count)
  }
  return restoreLiterals(result)
}
