/** MCP 授权请求的纯校验逻辑：query 参数白名单、PKCE 参数形态、预览结果与请求一致。 */
import type { MCPAuthorization, MCPConsent } from '@/api/mcp'

const REQUIRED = [
  'response_type',
  'client_id',
  'redirect_uri',
  'code_challenge',
  'code_challenge_method',
  'resource'
] as const
const ALLOWED: readonly string[] = [...REQUIRED, 'scope', 'state']

type Translate = (key: string) => string

export function parseMcpAuthorization(query: URLSearchParams, t: Translate): MCPAuthorization {
  const invalid = () => new Error(t('mcp.invalidRequest'))
  const values: Record<string, string> = {}
  for (const key of new Set(query.keys())) {
    const all = query.getAll(key)
    const value = all[0]
    if (!ALLOWED.includes(key) || all.length !== 1 || value.length > 4096) throw invalid()
    values[key] = value
  }
  if (
    REQUIRED.some((key) => !values[key]) ||
    values.response_type !== 'code' ||
    values.code_challenge_method !== 'S256' ||
    !/^[A-Za-z0-9_-]{43}$/.test(values.code_challenge) ||
    (values.scope !== undefined && values.scope !== '' && values.scope !== 'mcp')
  ) {
    throw invalid()
  }
  return values as unknown as MCPAuthorization
}

export function validateMcpPreview(result: MCPConsent, request: MCPAuthorization, t: Translate): void {
  const invalid = () => new Error(t('mcp.invalidRequest'))
  if (
    result.client_id !== request.client_id ||
    result.redirect_uri !== request.redirect_uri ||
    result.resource !== request.resource ||
    result.scope !== 'mcp' ||
    typeof result.client_name !== 'string'
  ) {
    throw invalid()
  }
  let redirect: URL
  try {
    redirect = new URL(result.redirect_uri)
  } catch {
    throw invalid()
  }
  if (
    !['https:', 'http:'].includes(redirect.protocol) ||
    redirect.username ||
    redirect.password ||
    redirect.hash
  ) {
    throw invalid()
  }
}
