/** 许可证检查入口：`pnpm run check:licenses`（需要已 install）。 */
import { execFileSync } from 'node:child_process'
import { findViolations } from './lib/licenses.mjs'

const out = execFileSync('pnpm', ['licenses', 'list', '--prod', '--json'], {
  encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024
})
const violations = findViolations(JSON.parse(out))
if (violations.length > 0) {
  console.error('[licenses] 发现不在白名单内的许可证：')
  for (const v of violations) console.error(`  ✗ ${v.name}: ${v.license}`)
  process.exit(1)
}
console.log('[licenses] 许可证检查通过')
