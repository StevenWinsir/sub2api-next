/**
 * 构建后处理（交接书 §5.10 第 5 步）：
 *  a. 删除 out/ 中除根 index.html 外的所有 HTML 及随之变空的目录，消除目录与路由同名导致的 301；
 *  b. 产物校验（任一项不满足即失败）；
 *  c. 清空 ../backend/internal/web/dist（保留 .keep）并拷贝产物。
 * 加 --no-copy 时只做 a、b（CI 校验用，不触碰后端目录）。
 */
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { verifyIndexHtml, verifyNoExtraHtml, verifyTopLevelEntries } from './lib/verifyExport.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = join(root, 'out')
const distDir = resolve(root, '..', 'backend', 'internal', 'web', 'dist')
const noCopy = process.argv.includes('--no-copy')

function fail(errors) {
  console.error('\n[postbuild] 产物校验失败：')
  for (const e of errors) console.error(`  ✗ ${e}`)
  process.exit(1)
}

function walk(dir) {
  const files = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) files.push(...walk(full))
    else files.push(full)
  }
  return files
}

function removeEmptyDirs(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) {
      removeEmptyDirs(full)
      if (readdirSync(full).length === 0) rmSync(full, { recursive: true })
    }
  }
}

if (!existsSync(join(outDir, 'index.html'))) {
  fail(['out/index.html 不存在（next build 未产出静态导出？）'])
}

// a. 仅保留根 index.html
for (const file of walk(outDir)) {
  if (file.endsWith('.html') && relative(outDir, file) !== 'index.html') rmSync(file)
}
removeEmptyDirs(outDir)

// b. 校验
const errors = []
errors.push(...verifyIndexHtml(readFileSync(join(outDir, 'index.html'), 'utf8')))
errors.push(...verifyTopLevelEntries(readdirSync(outDir)))
errors.push(
  ...verifyNoExtraHtml(
    walk(outDir)
      .filter((f) => f.endsWith('.html'))
      .map((f) => relative(outDir, f))
  )
)
if (errors.length > 0) fail(errors)
console.log('[postbuild] 产物校验通过')

if (noCopy) {
  console.log('[postbuild] --no-copy：跳过拷贝到后端 dist')
  process.exit(0)
}

// c. 清空后端 dist（保留 .keep）并拷贝
// Docker 前端构建阶段里 /app/backend 并不存在（与 Vite 的 outDir 行为一致：自动创建）
mkdirSync(distDir, { recursive: true })
if (existsSync(distDir)) {
  for (const name of readdirSync(distDir)) {
    if (name === '.keep') continue
    rmSync(join(distDir, name), { recursive: true, force: true })
  }
}
cpSync(outDir, distDir, { recursive: true })
console.log(`[postbuild] 已拷贝产物 → ${distDir}`)
