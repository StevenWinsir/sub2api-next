import * as React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        // 4xx 不重试，网络错误和 5xx 最多重试一次（§5.5）
        retry: (failureCount, error) => {
          const status = (error as { status?: number })?.status
          if (typeof status === 'number' && status >= 400 && status < 500) return false
          return failureCount < 1
        }
      }
    }
  })
}

// 模块级单例：控制台外壳按需加载 / 重新挂载时缓存不丢失
let client: QueryClient | null = null
const getClient = () => (client ??= makeQueryClient())

/**
 * TanStack Query 提供者。只在需要服务端数据缓存的外壳（控制台）与页面里使用，
 * 公共页 / 认证页不依赖它，因此不进入首屏包（query-core 约 12KB gz）。
 */
export function QueryProvider({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={getClient()}>{children}</QueryClientProvider>
}
