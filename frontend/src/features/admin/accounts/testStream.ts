/**
 * 账号测试的 SSE 流（POST + fetch reader，EventSource 不支持 POST）。
 * 与 Vue 版 AccountTestModal 保持一致：请求头、事件类型（test_start / content / image / audio / video /
 * status / test_complete / error）、可通过 AbortSignal 中断。
 */
import { ADMIN_UI_REQUEST_HEADER } from '@/api/adminUIRequest'
import { buildApiUrl } from '@/api/url'
import { STORAGE_KEYS } from '@/constants/storage'

export interface TestEvent {
  type: string
  text?: string
  model?: string
  success?: boolean
  error?: string
  image_url?: string
  audio_url?: string
  video_url?: string
  mime_type?: string
}

export interface TestRequestBody {
  model_id: string
  prompt: string
  mode?: string
  image_data_url?: string
  audio_data_url?: string
}

/** 解析 SSE 缓冲：返回已完整的事件与剩余缓冲。 */
export function parseSSEChunk(buffer: string): { events: TestEvent[]; rest: string } {
  const lines = buffer.split('\n')
  const rest = lines.pop() ?? ''
  const events: TestEvent[] = []
  for (const line of lines) {
    if (!line.startsWith('data: ')) continue
    const json = line.slice(6).trim()
    if (!json) continue
    try {
      events.push(JSON.parse(json) as TestEvent)
    } catch (error) {
      console.error('Failed to parse SSE event:', error)
    }
  }
  return { events, rest }
}

export async function streamAccountTest(
  accountId: number,
  body: TestRequestBody,
  onEvent: (event: TestEvent) => void,
  signal: AbortSignal
): Promise<void> {
  const token = typeof window !== 'undefined' ? window.localStorage.getItem(STORAGE_KEYS.authToken) : null
  const response = await fetch(buildApiUrl(`/admin/accounts/${accountId}/test`), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      [ADMIN_UI_REQUEST_HEADER]: '1'
    },
    body: JSON.stringify(body),
    signal
  })
  if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`)
  const reader = response.body?.getReader()
  if (!reader) throw new Error('No response body')
  const decoder = new TextDecoder()
  let buffer = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const parsed = parseSSEChunk(buffer)
    buffer = parsed.rest
    parsed.events.forEach(onEvent)
  }
}
