import { create } from 'zustand'
import subscriptionsAPI from '@/api/subscriptions'
import type { UserSubscription } from '@/types'

const CACHE_TTL_MS = 60_000
const POLL_INTERVAL_MS = 5 * 60 * 1000

interface SubscriptionStore {
  activeSubscriptions: UserSubscription[]
  loading: boolean
  loaded: boolean
  lastFetchedAt: number | null
  hasActiveSubscriptions: boolean
  fetchActiveSubscriptions: (force?: boolean) => Promise<UserSubscription[]>
  startPolling: () => void
  stopPolling: () => void
  clear: () => void
  invalidateCache: () => void
}

let requestGeneration = 0
let activePromise: Promise<UserSubscription[]> | null = null
let pollerInterval: ReturnType<typeof setInterval> | null = null

export const useSubscriptionStore = create<SubscriptionStore>((set, get) => ({
  activeSubscriptions: [],
  loading: false,
  loaded: false,
  lastFetchedAt: null,
  hasActiveSubscriptions: false,

  fetchActiveSubscriptions(force = false) {
    const { loaded, lastFetchedAt } = get()
    if (!force && loaded && lastFetchedAt && Date.now() - lastFetchedAt < CACHE_TTL_MS) {
      return Promise.resolve(get().activeSubscriptions)
    }
    if (activePromise && !force) return activePromise

    const generation = ++requestGeneration
    set({ loading: true })
    const request: Promise<UserSubscription[]> = subscriptionsAPI
      .getActiveSubscriptions()
      .then((data) => {
        if (generation === requestGeneration) {
          set({
            activeSubscriptions: data,
            hasActiveSubscriptions: data.length > 0,
            loaded: true,
            lastFetchedAt: Date.now()
          })
        }
        return data
      })
      .catch((error) => {
        console.error('Failed to fetch active subscriptions:', error)
        throw error
      })
      .finally(() => {
        if (activePromise === request) {
          activePromise = null
          set({ loading: false })
        }
      })
    activePromise = request
    return request
  },

  startPolling() {
    if (pollerInterval) return
    pollerInterval = setInterval(() => {
      get()
        .fetchActiveSubscriptions(true)
        .catch((error) => console.error('Subscription polling failed:', error))
    }, POLL_INTERVAL_MS)
  },

  stopPolling() {
    if (pollerInterval) {
      clearInterval(pollerInterval)
      pollerInterval = null
    }
  },

  clear() {
    requestGeneration++
    activePromise = null
    get().stopPolling()
    set({
      loading: false,
      activeSubscriptions: [],
      hasActiveSubscriptions: false,
      loaded: false,
      lastFetchedAt: null
    })
  },

  invalidateCache: () => set({ lastFetchedAt: null })
}))
