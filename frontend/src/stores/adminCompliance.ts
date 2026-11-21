import { create } from 'zustand'
import adminComplianceAPI, { type AdminComplianceStatus } from '@/api/admin/compliance'
import { getLocale } from '@/i18n'

const FALLBACK_ZH_PHRASE = '我已阅读、理解并同意 Sub2API 部署与运营合规承诺'
const FALLBACK_EN_PHRASE =
  'I have read, understood, and agree to the Sub2API Deployment and Operation Compliance Commitment'

interface AdminComplianceState {
  status: AdminComplianceStatus | null
  loading: boolean
  submitting: boolean
  initialized: boolean
  forceVisible: boolean
  required: boolean
  shouldShow: boolean
}

interface AdminComplianceActions {
  /** 期望的确认短语（随当前语言变化，调用时计算）。 */
  getExpectedPhrase: () => string
  fetchStatus: () => Promise<AdminComplianceStatus>
  accept: (phrase: string) => Promise<AdminComplianceStatus>
  requireAcknowledgement: (partial?: Partial<AdminComplianceStatus>) => void
  reset: () => void
}

export type AdminComplianceStore = AdminComplianceState & AdminComplianceActions

// 版本号用于丢弃 reset 之前发出的请求结果
let stateVersion = 0

const derive = (status: AdminComplianceStatus | null, forceVisible: boolean) => {
  const required = status?.required === true
  return { required, shouldShow: required || forceVisible }
}

export const useAdminComplianceStore = create<AdminComplianceStore>((set, get) => ({
  status: null,
  loading: false,
  submitting: false,
  initialized: false,
  forceVisible: false,
  required: false,
  shouldShow: false,

  getExpectedPhrase() {
    const status = get().status
    return getLocale() === 'zh'
      ? status?.ack_phrase_zh || FALLBACK_ZH_PHRASE
      : status?.ack_phrase_en || FALLBACK_EN_PHRASE
  },

  async fetchStatus() {
    const version = stateVersion
    set({ loading: true })
    try {
      const next = await adminComplianceAPI.getStatus()
      if (version !== stateVersion) return next
      set({ status: next, initialized: true, forceVisible: next.required, ...derive(next, next.required) })
      return next
    } finally {
      if (version === stateVersion) set({ loading: false })
    }
  },

  async accept(phrase) {
    const version = stateVersion
    set({ submitting: true })
    try {
      const next = await adminComplianceAPI.accept({ phrase, language: getLocale() })
      if (version !== stateVersion) return next
      set({ status: next, forceVisible: next.required, ...derive(next, next.required) })
      return next
    } finally {
      if (version === stateVersion) set({ submitting: false })
    }
  },

  requireAcknowledgement(partial) {
    const prev = get().status
    const status: AdminComplianceStatus = {
      required: true,
      version: partial?.version || prev?.version || 'v2026.06.10',
      document_path_zh:
        partial?.document_path_zh || prev?.document_path_zh || 'docs/legal/admin-compliance.zh.md',
      document_path_en:
        partial?.document_path_en || prev?.document_path_en || 'docs/legal/admin-compliance.en.md',
      document_url_zh:
        partial?.document_url_zh ||
        prev?.document_url_zh ||
        'https://github.com/Wei-Shaw/sub2api/blob/main/docs/legal/admin-compliance.zh.md',
      document_url_en:
        partial?.document_url_en ||
        prev?.document_url_en ||
        'https://github.com/Wei-Shaw/sub2api/blob/main/docs/legal/admin-compliance.en.md',
      ack_phrase_zh: partial?.ack_phrase_zh || prev?.ack_phrase_zh || FALLBACK_ZH_PHRASE,
      ack_phrase_en: partial?.ack_phrase_en || prev?.ack_phrase_en || FALLBACK_EN_PHRASE,
      acknowledgement: prev?.acknowledgement
    }
    set({ status, initialized: true, forceVisible: true, ...derive(status, true) })
  },

  reset() {
    stateVersion++
    set({
      status: null,
      loading: false,
      submitting: false,
      initialized: false,
      forceVisible: false,
      required: false,
      shouldShow: false
    })
  }
}))
