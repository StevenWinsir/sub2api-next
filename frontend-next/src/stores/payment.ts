import { create } from 'zustand'
import { paymentAPI } from '@/api/payment'
import type { PaymentConfig, PaymentOrder, SubscriptionPlan, CreateOrderRequest } from '@/types/payment'

interface PaymentStore {
  config: PaymentConfig | null
  currentOrder: PaymentOrder | null
  plans: SubscriptionPlan[]
  configLoading: boolean
  configLoaded: boolean
  fetchConfig: (force?: boolean) => Promise<PaymentConfig | null>
  fetchPlans: () => Promise<SubscriptionPlan[]>
  createOrder: (
    params: CreateOrderRequest
  ) => Promise<Awaited<ReturnType<typeof paymentAPI.createOrder>>['data']>
  pollOrderStatus: (orderId: number) => Promise<PaymentOrder | null>
  clearCurrentOrder: () => void
}

let configPromise: Promise<PaymentConfig | null> | null = null

export const usePaymentStore = create<PaymentStore>((set, get) => {
  async function loadConfig(): Promise<PaymentConfig | null> {
    set({ configLoading: true })
    try {
      const response = await paymentAPI.getConfig()
      set({ config: response.data, configLoaded: true })
      return response.data
    } catch (error) {
      console.error('[payment] Failed to fetch config:', error)
      return null
    } finally {
      set({ configLoading: false })
      configPromise = null
    }
  }

  return {
    config: null,
    currentOrder: null,
    plans: [],
    configLoading: false,
    configLoaded: false,

    async fetchConfig(force = false) {
      if (get().configLoaded && !force) return get().config
      if (configPromise) return configPromise
      configPromise = loadConfig()
      return configPromise
    },

    async fetchPlans() {
      try {
        const response = await paymentAPI.getPlans()
        const plans = (response.data || []).map(
          (p: Omit<SubscriptionPlan, 'features'> & { features: string | string[] }) => ({
            ...p,
            features:
              typeof p.features === 'string'
                ? p.features
                    .split('\n')
                    .map((f: string) => f.trim())
                    .filter(Boolean)
                : p.features || []
          })
        ) as SubscriptionPlan[]
        set({ plans })
        return plans
      } catch (error) {
        console.error('[payment] Failed to fetch plans:', error)
        return []
      }
    },

    async createOrder(params) {
      const response = await paymentAPI.createOrder(params)
      return response.data
    },

    async pollOrderStatus(orderId) {
      try {
        const response = await paymentAPI.getOrder(orderId)
        const order = response.data
        if (get().currentOrder?.id === orderId) set({ currentOrder: order })
        return order
      } catch (error) {
        console.error('[payment] Failed to poll order status:', error)
        return null
      }
    },

    clearCurrentOrder: () => set({ currentOrder: null })
  }
})
