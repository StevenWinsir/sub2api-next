import * as React from 'react'
import { STORAGE_KEYS } from '@/constants/storage'
import type { LoginAgreementDocument, PublicSettings } from '@/types'
import { useAppStore } from '@/stores/app'
import { t } from '@/i18n'

const STORAGE_KEY = STORAGE_KEYS.loginAgreementConsent

/** 读取本地已同意的协议版本（revision）；存储不可用 / 内容无效时返回空串。 */
export function readAcceptedRevision(): string {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return ''
    const parsed = JSON.parse(raw) as { revision?: string }
    return typeof parsed.revision === 'string' ? parsed.revision : ''
  } catch {
    return ''
  }
}

/**
 * 登录协议同意（`sub2api_login_agreement_consent` + 版本号 revision）。
 * settings 为 null（加载失败）时放行，与 Vue 版一致；协议版本变化后需要重新同意。
 */
export function useLoginAgreement(
  settings: PublicSettings | null,
  loaded: boolean,
  kind: 'login' | 'register'
) {
  const showWarning = useAppStore((s) => s.showWarning)
  const documents = React.useMemo<LoginAgreementDocument[]>(
    () => (settings?.login_agreement_documents ?? []).filter((d) => d.title?.trim()),
    [settings]
  )
  const enabled = settings?.login_agreement_enabled === true && documents.length > 0
  const mode: 'modal' | 'checkbox' = settings?.login_agreement_mode === 'checkbox' ? 'checkbox' : 'modal'
  const updatedAt = settings?.login_agreement_updated_at || ''
  const revision =
    settings?.login_agreement_revision ||
    `${updatedAt}:${documents.map((d) => `${d.id}:${d.title}`).join('|')}`

  // 页面只在客户端渲染，可在初始化时读取 localStorage；accepted 由“已同意版本 == 当前版本”推导
  const [acceptedRevision, setAcceptedRevision] = React.useState(readAcceptedRevision)
  // modal 模式默认自动弹出；用户关闭（同意 / 拒绝）后不再自动弹，直到再次主动打开
  const [modalDismissed, setModalDismissed] = React.useState(false)

  const accepted = !enabled || (!!revision && acceptedRevision === revision)
  const gateActive = loaded && enabled && !accepted
  const modalOpen = gateActive && mode !== 'checkbox' && !modalDismissed

  const setModalOpen = React.useCallback((open: boolean) => setModalDismissed(!open), [])

  const accept = React.useCallback(() => {
    if (revision) {
      try {
        window.localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({ revision, accepted_at: new Date().toISOString() })
        )
      } catch {
        /* ignore */
      }
      setAcceptedRevision(revision)
    }
    setModalDismissed(true)
  }, [revision])

  const reject = React.useCallback(() => {
    try {
      window.localStorage.removeItem(STORAGE_KEY)
    } catch {
      /* ignore */
    }
    setAcceptedRevision('')
    setModalDismissed(true)
    showWarning(
      t(
        kind === 'login'
          ? 'legal.loginAgreementPrompt.loginRejectedWarning'
          : 'legal.loginAgreementPrompt.registerRejectedWarning'
      )
    )
  }, [kind, showWarning])

  /** 提交前调用：协议未同意时提示并（modal 模式）弹出协议；返回 true 表示被拦截。 */
  const blockIfNeeded = React.useCallback((): boolean => {
    if (!gateActive) return false
    showWarning(
      t(
        kind === 'login'
          ? 'legal.loginAgreementPrompt.loginRequiredWarning'
          : 'legal.loginAgreementPrompt.registerRequiredWarning'
      )
    )
    if (mode !== 'checkbox') setModalDismissed(false)
    return true
  }, [gateActive, kind, mode, showWarning])

  return {
    documents: enabled ? documents : [],
    mode,
    updatedAt,
    accepted: !gateActive,
    gateActive,
    modalOpen,
    setModalOpen,
    accept,
    reject,
    blockIfNeeded
  }
}
