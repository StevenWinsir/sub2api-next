/**
 * 构建产物校验（交接书 §5.10 第 5 步 b）。纯函数，便于单测。
 * 任一项不满足即构建失败，保证与后端 index.html 注入、CSP、SPA 回退契约一致。
 */

/** 后端保留的顶层路径名，public/ 与导出产物顶层都不得出现同名目录（§3.4）。 */
export const RESERVED_TOP_LEVEL_DIRS = [
  'api',
  'v1',
  'v1beta',
  'backend-api',
  'antigravity',
  'health',
  'models',
  'responses',
  'chat',
  'embeddings',
  'messages',
  'alpha',
  'web_search',
  'x_search',
  'tts',
  'stt',
  'realtime',
  'custom-voices',
  'contents',
  'v3',
  'images',
  'videos'
]

const NON_EXECUTABLE_SCRIPT_TYPES = new Set([
  'application/json',
  'application/ld+json',
  'importmap',
  'speculationrules'
])

/** 找出所有内联可执行脚本（无 src 且 type 不是数据块）。 */
export function findInlineExecutableScripts(html) {
  const found = []
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi
  let match
  while ((match = re.exec(html)) !== null) {
    const attrs = match[1]
    const body = match[2]
    if (/\bsrc\s*=/i.test(attrs)) continue
    const typeMatch = attrs.match(/\btype\s*=\s*["']?([^"'\s>]+)/i)
    const type = typeMatch ? typeMatch[1].toLowerCase() : ''
    if (NON_EXECUTABLE_SCRIPT_TYPES.has(type)) continue
    if (!body.trim()) continue
    found.push(match[0].slice(0, 120))
  }
  return found
}

/** 校验 index.html，返回错误列表（空数组表示通过）。 */
export function verifyIndexHtml(html) {
  const errors = []
  if (!html.includes('</head>')) errors.push('index.html 缺少字面量 </head>（后端在其前注入 __APP_CONFIG__）')
  if (!/<title>[\s\S]*?<\/title>/i.test(html))
    errors.push('index.html 缺少 <title>（后端会替换第一个 <title>）')
  // 后端按字节匹配 `<link rel="icon"`，rel 必须是第一个属性
  if (!html.includes('<link rel="icon"')) {
    errors.push('index.html 缺少以 `<link rel="icon"` 开头的标签（后端按字节匹配替换 favicon）')
  }
  const inline = findInlineExecutableScripts(html)
  if (inline.length > 0) {
    errors.push(`index.html 含内联可执行脚本（会被 CSP 拦截）：${inline.join(' | ')}`)
  }
  if (/\beval\s*\(|new Function\s*\(/.test(html)) {
    errors.push('index.html 含 eval / new Function')
  }
  return errors
}

/** 校验导出目录的顶层条目名，禁止与后端保留路径同名。 */
export function verifyTopLevelEntries(entries) {
  const errors = []
  for (const name of entries) {
    if (RESERVED_TOP_LEVEL_DIRS.includes(name)) {
      errors.push(`产物顶层出现后端保留名称 "${name}"（会与网关路由冲突，见 §3.4）`)
    }
  }
  return errors
}

/** 导出结果中除根 index.html 之外不应再有 HTML（否则会出现与路由同名的目录 → 301）。 */
export function verifyNoExtraHtml(relativeHtmlFiles) {
  return relativeHtmlFiles
    .filter((file) => file !== 'index.html')
    .map((file) => `产物含多余 HTML 文件 "${file}"（会触发 Go FileServer 301 重定向）`)
}
