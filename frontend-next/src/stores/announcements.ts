import { create } from 'zustand'
import { announcementsAPI } from '@/api'
import type { UserAnnouncement } from '@/types'

const THROTTLE_MS = 20 * 60 * 1000 // 20 分钟

interface AnnouncementState {
  announcements: UserAnnouncement[]
  loading: boolean
  lastFetchTime: number
  popupQueue: UserAnnouncement[]
  currentPopup: UserAnnouncement | null
  unreadCount: number
}

interface AnnouncementActions {
  fetchAnnouncements: (force?: boolean) => Promise<void>
  dismissPopup: () => Promise<void>
  markAsRead: (id: number) => Promise<boolean>
  markAllAsRead: () => Promise<void>
  reset: () => void
}

export type AnnouncementStore = AnnouncementState & AnnouncementActions

let shownPopupIds = new Set<number>()
let fetchGeneration = 0

const countUnread = (list: UserAnnouncement[]) => list.filter((a) => !a.read_at).length

export const useAnnouncementStore = create<AnnouncementStore>((set, get) => {
  function showNextPopup(): void {
    const queue = [...get().popupQueue]
    if (queue.length === 0) {
      set({ currentPopup: null })
      return
    }
    const next = queue.shift()!
    shownPopupIds.add(next.id)
    set({ popupQueue: queue, currentPopup: next })
  }

  function enqueueNewPopups(): void {
    const fresh = get().announcements.filter(
      (a) => a.notify_mode === 'popup' && !a.read_at && !shownPopupIds.has(a.id)
    )
    if (fresh.length === 0) return
    const queue = [...get().popupQueue]
    for (const p of fresh) {
      if (!queue.some((q) => q.id === p.id)) queue.push(p)
    }
    set({ popupQueue: queue })
    if (!get().currentPopup) showNextPopup()
  }

  function patchRead(id: number): void {
    const readAt = new Date().toISOString()
    const announcements = get().announcements.map((a) => (a.id === id ? { ...a, read_at: readAt } : a))
    set({ announcements, unreadCount: countUnread(announcements) })
  }

  return {
    announcements: [],
    loading: false,
    lastFetchTime: 0,
    popupQueue: [],
    currentPopup: null,
    unreadCount: 0,

    async fetchAnnouncements(force = false) {
      const now = Date.now()
      const { lastFetchTime } = get()
      if (!force && lastFetchTime > 0 && now - lastFetchTime < THROTTLE_MS) return

      set({ lastFetchTime: now })
      const generation = ++fetchGeneration
      try {
        set({ loading: true })
        const all = await announcementsAPI.list(false)
        if (generation !== fetchGeneration) return
        const announcements = all.slice(0, 20)
        set({ announcements, unreadCount: countUnread(announcements) })
        enqueueNewPopups()
      } catch (err) {
        if (generation !== fetchGeneration) return
        set({ lastFetchTime: 0 })
        console.error('Failed to fetch announcements:', err)
      } finally {
        if (generation === fetchGeneration) set({ loading: false })
      }
    },

    async dismissPopup() {
      const current = get().currentPopup
      if (!current) return
      set({ currentPopup: null })
      void get().markAsRead(current.id)
      if (get().popupQueue.length > 0) {
        setTimeout(() => showNextPopup(), 300)
      }
    },

    async markAsRead(id) {
      try {
        await announcementsAPI.markRead(id)
        patchRead(id)
        return true
      } catch (err) {
        console.error('Failed to mark announcement as read:', err)
        return false
      }
    },

    async markAllAsRead() {
      const unread = get().announcements.filter((a) => !a.read_at)
      if (unread.length === 0) return
      try {
        set({ loading: true })
        const results = await Promise.allSettled(
          unread.map(async (a) => {
            await announcementsAPI.markRead(a.id)
            patchRead(a.id)
          })
        )
        const failure = results.find((r) => r.status === 'rejected') as PromiseRejectedResult | undefined
        if (failure) throw failure.reason
      } catch (err) {
        console.error('Failed to mark all as read:', err)
        throw err
      } finally {
        set({ loading: false })
      }
    },

    reset() {
      fetchGeneration++
      shownPopupIds = new Set()
      set({
        announcements: [],
        lastFetchTime: 0,
        popupQueue: [],
        currentPopup: null,
        loading: false,
        unreadCount: 0
      })
    }
  }
})
