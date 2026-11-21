import { create } from 'zustand'
import type { Driver } from 'driver.js'

type VoidCallback = () => void
type NextStepCallback = (delay?: number) => Promise<void>
type IsCurrentStepCallback = (selector: string) => boolean

interface OnboardingStore {
  replayCallback: VoidCallback | null
  nextStepCallback: NextStepCallback | null
  isCurrentStepCallback: IsCurrentStepCallback | null
  driverInstance: Driver | null
  setReplayCallback: (callback: VoidCallback | null) => void
  setControlMethods: (methods: { nextStep: NextStepCallback; isCurrentStep: IsCurrentStepCallback }) => void
  clearControlMethods: () => void
  setDriverInstance: (driver: Driver | null) => void
  getDriverInstance: () => Driver | null
  isDriverActive: () => boolean
  replay: () => void
  nextStep: (delay?: number) => Promise<void>
  isCurrentStep: (selector: string) => boolean
}

export const useOnboardingStore = create<OnboardingStore>((set, get) => ({
  replayCallback: null,
  nextStepCallback: null,
  isCurrentStepCallback: null,
  driverInstance: null,

  setReplayCallback: (callback) => set({ replayCallback: callback }),
  setControlMethods: (methods) =>
    set({ nextStepCallback: methods.nextStep, isCurrentStepCallback: methods.isCurrentStep }),
  clearControlMethods: () => set({ nextStepCallback: null, isCurrentStepCallback: null }),
  setDriverInstance: (driver) => set({ driverInstance: driver }),
  getDriverInstance: () => get().driverInstance,
  isDriverActive: () => get().driverInstance?.isActive?.() ?? false,
  replay: () => get().replayCallback?.(),
  async nextStep(delay = 0) {
    await get().nextStepCallback?.(delay)
  },
  isCurrentStep: (selector) => get().isCurrentStepCallback?.(selector) ?? false
}))
