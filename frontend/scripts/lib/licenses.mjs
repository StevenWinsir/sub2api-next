/**
 * 依赖许可证检查（交接书 §9“许可证合规”）。纯函数，便于单测。
 * 只允许可商用的宽松许可证；个别条目登记为显式例外（需写明理由）。
 */
export const ALLOWED = [
  'MIT',
  'ISC',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'Apache-2.0',
  '0BSD',
  'CC0-1.0',
  'BlueOak-1.0.0',
  'Python-2.0',
  'Unlicense',
  'MPL-2.0'
]

/** 包名 → 例外理由。例外只放“不随产物分发”或“非代码资产”的条目。 */
export const EXCEPTIONS = {
  '@img/sharp-libvips-*':
    'LGPL 动态链接的原生库，只作为 next 的可选依赖安装在构建机；静态导出产物不包含也不分发它',
  'caniuse-lite': 'CC-BY-4.0 浏览器兼容数据，仅用于构建期（browserslist / autoprefixer），不进入产物',
  '@fontsource-variable/inter':
    'OFL-1.1 字体（可自由商用与再分发），随站点本地托管，OFL 要求保留的许可文件随包提供'
}

function exceptionFor(name) {
  for (const [pattern, reason] of Object.entries(EXCEPTIONS)) {
    if (pattern.endsWith('*') ? name.startsWith(pattern.slice(0, -1)) : name === pattern) return reason
  }
  return null
}

/** SPDX 表达式里的每个许可证（按 OR / AND / 括号拆开）是否都在白名单；OR 只要有一个可用即可。 */
export function isAllowedLicense(expr) {
  const text = String(expr || '').trim()
  if (!text) return false
  const stripped = text.replace(/[()]/g, ' ')
  if (/\sOR\s/.test(stripped)) return stripped.split(/\sOR\s/).some((p) => isAllowedLicense(p))
  return stripped
    .split(/\sAND\s/)
    .map((p) => p.trim())
    .filter(Boolean)
    .every((id) => ALLOWED.includes(id))
}

/** @param {Record<string, {name: string}[]>} byLicense `pnpm licenses list --json` 的输出 */
export function findViolations(byLicense) {
  const violations = []
  for (const [license, packages] of Object.entries(byLicense)) {
    if (isAllowedLicense(license)) continue
    for (const p of packages) {
      if (exceptionFor(p.name)) continue
      violations.push({ name: p.name, license })
    }
  }
  return violations
}
