/**
 * 构建前代码生成：读取 ../docs/legal/*.md，生成合规文档 TS 模块
 * （替代 Vite 的 `?raw` 导入，与打包器无关）。
 * 目录布局与 Dockerfile 一致：docs/legal 与 frontend 目录同级。
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const legalDir = resolve(root, '..', 'docs', 'legal')
const outFile = join(root, 'src', 'generated', 'legalDocuments.ts')

const docs = {}
if (existsSync(legalDir)) {
  for (const file of readdirSync(legalDir).sort()) {
    if (!file.endsWith('.md')) continue
    docs[file.replace(/\.md$/, '')] = readFileSync(join(legalDir, file), 'utf8')
  }
} else {
  console.warn(`[gen-legal] ${legalDir} 不存在，生成空模块`)
}

const body = `/* eslint-disable */
// 由 scripts/gen-legal.mjs 生成，请勿手工修改。
export const LEGAL_DOCUMENTS: Record<string, string> = ${JSON.stringify(docs, null, 2)}
`
mkdirSync(dirname(outFile), { recursive: true })
writeFileSync(outFile, body)
console.log(`[gen-legal] 已生成 ${Object.keys(docs).length} 个文档 → ${outFile}`)
