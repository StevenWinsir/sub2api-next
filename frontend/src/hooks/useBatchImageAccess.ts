/** 批量生图入口可见性（对应 composables/useBatchImageAccess）：存在启用且允许批量生图的 Gemini 分组密钥即可。 */
import { create } from 'zustand'
import { keysAPI } from '@/api/keys'
import { useAuthStore } from '@/stores/auth'
import type { ApiKey } from '@/types'

const PAGE_SIZE = 100

export function keyAllowsBatchImage(key: ApiKey): boolean {
  return (
    key.status === 'active' &&
    key.group?.platform === 'gemini' &&
    key.group?.allow_batch_image_generation === true
  )
}

interface BatchImageAccessState {
  loaded: boolean
  loading: boolean
  canUseBatchImage: boolean
  refresh: (force?: boolean) => Promise<boolean>
}

let pendingLoad: Promise<boolean> | null = null

export const useBatchImageAccessStore = create<BatchImageAccessState>((set, get) => ({
  loaded: false,
  loading: false,
  canUseBatchImage: false,
  refresh(force = false) {
    if (!useAuthStore.getState().isAuthenticated) {
      set({ loaded: true, canUseBatchImage: false })
      return Promise.resolve(false)
    }
    if (get().loaded && !force) return Promise.resolve(get().canUseBatchImage)
    if (pendingLoad && !force) return pendingLoad
    set({ loading: true })
    pendingLoad = (async () => {
      let page = 1
      for (;;) {
        const res = await keysAPI.list(page, PAGE_SIZE, {
          status: 'active',
          sort_by: 'created_at',
          sort_order: 'desc'
        })
        const items = res.items || []
        if (items.some(keyAllowsBatchImage)) {
          set({ canUseBatchImage: true, loaded: true })
          return true
        }
        if (page >= res.pages || items.length === 0) {
          set({ canUseBatchImage: false, loaded: true })
          return false
        }
        page += 1
      }
    })()
      .catch(() => {
        set({ canUseBatchImage: false, loaded: false })
        return false
      })
      .finally(() => {
        set({ loading: false })
        pendingLoad = null
      })
    return pendingLoad
  }
}))
