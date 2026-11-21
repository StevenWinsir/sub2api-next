/** 代理批量导入的解析（逐行 `protocol://[user:pass@]host:port`），逻辑与 Vue 版 ProxiesView 一致。 */
import type { ProxyProtocol } from '@/types'

export interface ParsedProxy {
  protocol: ProxyProtocol
  host: string
  port: number
  username: string
  password: string
}

const PROXY_URL = /^(https?|socks5h?):\/\/(?:([^:@[\]]+):([^@[\]]+)@)?(\[[0-9a-f:.]+\]|[^:[\]]+):(\d+)$/i

export function parseProxyUrl(line: string): ParsedProxy | null {
  const trimmed = line.trim()
  if (!trimmed) return null
  const match = trimmed.match(PROXY_URL)
  if (!match) return null
  const [, protocol, username, password, rawHost, port] = match
  const portNum = parseInt(port, 10)
  if (portNum < 1 || portNum > 65535) return null
  return {
    protocol: protocol.toLowerCase() as ProxyProtocol,
    host: rawHost.replace(/^\[|\]$/g, '').trim(),
    port: portNum,
    username: username?.trim() || '',
    password: password?.trim() || ''
  }
}

export interface BatchParseResult {
  proxies: ParsedProxy[]
  invalid: number
  duplicate: number
}

export function parseBatchInput(input: string): BatchParseResult {
  const seen = new Set<string>()
  const proxies: ParsedProxy[] = []
  let invalid = 0
  let duplicate = 0
  for (const line of input.split('\n').filter((l) => l.trim())) {
    const parsed = parseProxyUrl(line)
    if (!parsed) {
      invalid++
      continue
    }
    const key = `${parsed.protocol}|${parsed.host}|${parsed.port}|${parsed.username}|${parsed.password}`
    if (seen.has(key)) {
      duplicate++
      continue
    }
    seen.add(key)
    proxies.push(parsed)
  }
  return { proxies, invalid, duplicate }
}
