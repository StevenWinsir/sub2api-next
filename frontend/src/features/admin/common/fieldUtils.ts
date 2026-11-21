/** 表单数值输入辅助：输入框用字符串受控，提交时转换。 */
export function numOrUndef(v: string): number | undefined {
  const s = v.trim()
  if (s === '') return undefined
  const n = Number(s)
  return Number.isFinite(n) ? n : undefined
}

export function numOrNull(v: string): number | null {
  return numOrUndef(v) ?? null
}

export function str(v: number | null | undefined): string {
  return v === null || v === undefined ? '' : String(v)
}

export function money(v: number | null | undefined, digits = 2): string {
  return `$${(v ?? 0).toFixed(digits)}`
}

/** ISO 时间 → `datetime-local` 输入值（本地时区）。 */
export function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

/** `datetime-local` 输入值 → ISO 字符串。 */
export function fromLocalInput(v: string): string | null {
  if (!v) return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}
