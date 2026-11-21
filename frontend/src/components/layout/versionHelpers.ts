/** 版本徽章的纯函数：回滚命令生成、重启后探活（/health）。 */
export const GITHUB_REPO = 'Wei-Shaw/sub2api'
export const DOCKER_IMAGE = 'weishaw/sub2api'

export function scriptRollbackCommand(version: string): string {
  if (!version) return ''
  const tag = `v${version}`
  return `curl -sSL https://raw.githubusercontent.com/${GITHUB_REPO}/${tag}/deploy/install.sh | sudo bash -s -- rollback ${tag}`
}

export function dockerRollbackCommand(version: string, labels: { edit: string; recreate: string }): string {
  if (!version) return ''
  return [
    `# ${labels.edit}`,
    `image: ${DOCKER_IMAGE}:${version}`,
    '',
    `# ${labels.recreate}`,
    'docker compose up -d'
  ].join('\n')
}

/**
 * 重启后探活：按间隔轮询 /health，成功即返回 'up'；
 * 重试耗尽后返回 'timeout'（调用方照样刷新页面，与 Vue 版一致）。
 */
export async function waitForService(
  fetchImpl: (url: string, init: { method: string; cache: 'no-cache' }) => Promise<{ ok: boolean }>,
  opts: { retries?: number; delayMs?: number; sleep?: (ms: number) => Promise<void> } = {}
): Promise<'up' | 'timeout'> {
  const retries = opts.retries ?? 5
  const delay = opts.delayMs ?? 1000
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetchImpl('/health', { method: 'GET', cache: 'no-cache' })
      if (res.ok) return 'up'
    } catch {
      /* 服务尚未就绪 */
    }
    if (i < retries - 1) await sleep(delay)
  }
  return 'timeout'
}

export function formatPublishedAt(value: string): string {
  if (!value) return ''
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString()
}
