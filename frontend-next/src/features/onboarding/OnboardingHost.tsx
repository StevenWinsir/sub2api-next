/**
 * 新手引导宿主（对应 composables/useOnboardingTour）：用 driver.js 驱动交互式引导。
 *  - 仅标准模式的管理员自动启动；用户菜单可手动重播；
 *  - 交互式步骤（只有“关闭”按钮）：用户点击 / 输入目标元素后自动前进，表单提交按钮由业务代码调用 nextStep；
 *  - 键盘：Esc 退出、←/→ 翻页、Enter 触发；
 *  - 控制方法通过 onboarding store 暴露给页面（nextStep / isCurrentStep / replay）。
 * driver.js 与其样式在首次启动时动态加载，不进入首屏包。
 */
import * as React from 'react'
import type { Driver, DriveStep } from 'driver.js'
import { t } from '@/i18n'
import { useAuthStore } from '@/stores/auth'
import { useOnboardingStore } from '@/stores/onboarding'
import { getAdminSteps, getUserSteps } from './steps'
import { TIMING, isInteractiveStep, shouldAutoStartTour, tourStorageKey } from './tourLogic'

const isFormControl = (el: Element | null | undefined) =>
  ['INPUT', 'TEXTAREA', 'SELECT'].includes((el as HTMLElement | null)?.tagName ?? '')

async function waitForElement(selector: string, timeout = 5000): Promise<boolean> {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    const el = document.querySelector(selector)
    if (el && el.getBoundingClientRect().height > 0) return true
    await new Promise((r) => setTimeout(r, 150))
  }
  return false
}

export function OnboardingHost() {
  const user = useAuthStore((s) => s.user)
  const isSimple = useAuthStore((s) => s.isSimpleMode)
  const userRef = React.useRef({ user, isSimple })
  React.useEffect(() => {
    userRef.current = { user, isSimple }
  })

  React.useEffect(() => {
    const store = useOnboardingStore.getState()
    let driverInstance: Driver | null = store.getDriverInstance()
    let steps: DriveStep[] = []
    let listenerCleanup: (() => void) | null = null
    let keyHandler: ((e: KeyboardEvent) => void) | null = null
    let autoTimer: ReturnType<typeof setTimeout> | null = null
    let disposed = false

    const storageKey = () => tourStorageKey(userRef.current.user)
    const hasSeen = () => localStorage.getItem(storageKey()) === 'true'
    const markSeen = () => localStorage.setItem(storageKey(), 'true')
    const finish = () => {
      markSeen()
      driverInstance?.destroy()
      useOnboardingStore.getState().setDriverInstance(null)
    }
    const clickableTarget = (step: DriveStep | undefined): HTMLElement | null => {
      if (!step || !isInteractiveStep(step) || typeof step.element !== 'string') return null
      const el = document.querySelector<HTMLElement>(step.element)
      return el && !isFormControl(el) ? el : null
    }

    const startTour = async (startIndex = 0) => {
      const { user: u, isSimple: simple } = userRef.current
      steps = u?.role === 'admin' ? getAdminSteps(t, simple) : getUserSteps(t)
      const first = steps[startIndex]
      if (typeof first?.element === 'string') await waitForElement(first.element, TIMING.ELEMENT_TIMEOUT_MS)
      const [{ driver }] = await Promise.all([import('driver.js'), import('driver.js/dist/driver.css')])
      if (disposed) return
      driverInstance?.destroy()

      driverInstance = driver({
        showProgress: true,
        steps,
        animate: true,
        allowClose: false, // 禁止点击遮罩关闭
        stagePadding: 4,
        popoverClass: 'theme-tour-popover',
        nextBtnText: t('common.next'),
        prevBtnText: t('common.back'),
        doneBtnText: t('common.confirm'),
        onNextClick: (_el, _step, { config, state }) => {
          const index = state.activeIndex ?? 0
          if (index === (config.steps?.length ?? 0) - 1) return finish()
          // 交互式步骤通常隐藏 Next；此处为防御性处理
          const target = clickableTarget(steps[index])
          if (target) return target.click()
          driverInstance?.moveNext()
        },
        onPrevClick: () => driverInstance?.movePrevious(),
        onCloseClick: finish,
        onHighlightStarted: async (element, step) => {
          listenerCleanup?.()
          listenerCleanup = null
          let el = element as HTMLElement | undefined
          if (!el && typeof step.element === 'string') {
            if (!(await waitForElement(step.element, TIMING.ELEMENT_TIMEOUT_MS))) return
            el = document.querySelector<HTMLElement>(step.element) ?? undefined
          }
          if (!el || !isInteractiveStep(step)) return
          // 提交按钮不绑定自动前进：由业务代码在成功后调用 nextStep
          if (el.getAttribute('type') === 'submit' || (el.tagName === 'BUTTON' && el.closest('form'))) return
          let executed = false
          const boundIndex = driverInstance?.getActiveIndex() ?? 0
          const advance = async () => {
            if (executed) return
            executed = true
            await new Promise((r) => setTimeout(r, TIMING.INTERACTIVE_WAIT_MS))
            if (!driverInstance?.isActive() || (driverInstance.getActiveIndex() ?? 0) !== boundIndex) return
            const next = steps[boundIndex + 1]
            if (
              typeof next?.element === 'string' &&
              !(await waitForElement(next.element, TIMING.ELEMENT_TIMEOUT_MS))
            )
              return
            if (driverInstance?.isActive()) driverInstance.moveNext()
          }
          const target = el
          if (isFormControl(target)) {
            const onInput = () => {
              target.removeEventListener('input', onInput)
              target.removeEventListener('change', onInput)
              void advance()
            }
            target.addEventListener('input', onInput)
            target.addEventListener('change', onInput)
            listenerCleanup = () => {
              target.removeEventListener('input', onInput)
              target.removeEventListener('change', onInput)
            }
          } else {
            const onKey = (e: KeyboardEvent) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                void advance()
              }
            }
            target.addEventListener('click', advance, { once: true })
            target.addEventListener('keydown', onKey)
            listenerCleanup = () => {
              target.removeEventListener('click', advance)
              target.removeEventListener('keydown', onKey)
            }
          }
        },
        onDestroyed: () => {
          listenerCleanup?.()
          listenerCleanup = null
          if (keyHandler) document.removeEventListener('keydown', keyHandler, { capture: true })
          keyHandler = null
          useOnboardingStore.getState().setDriverInstance(null)
        }
      })
      useOnboardingStore.getState().setDriverInstance(driverInstance)

      keyHandler = (e: KeyboardEvent) => {
        if (!driverInstance?.isActive()) return
        const target = e.target as HTMLElement
        const typing = ['INPUT', 'TEXTAREA'].includes(target?.tagName)
        if (e.key === 'Escape') {
          e.preventDefault()
          e.stopPropagation()
          finish()
        } else if ((e.key === 'ArrowRight' || e.key === 'Enter') && !typing) {
          e.preventDefault()
          e.stopPropagation()
          const index = driverInstance.getActiveIndex() ?? 0
          const interactive = isInteractiveStep(steps[index])
          if (e.key === 'Enter') {
            const clickable = clickableTarget(steps[index])
            if (clickable) return clickable.click()
          } else if (interactive && clickableTarget(steps[index])) {
            return // 交互步骤上方向键不应跳过
          }
          driverInstance.moveNext()
        } else if (
          e.key === 'ArrowLeft' &&
          !typing &&
          !['SELECT'].includes(target?.tagName) &&
          !target?.isContentEditable
        ) {
          e.preventDefault()
          e.stopPropagation()
          driverInstance.movePrevious()
        }
      }
      document.addEventListener('keydown', keyHandler, { capture: true })
      driverInstance.drive(startIndex)
    }

    const nextStep = async (delay = 300) => {
      if (!driverInstance?.isActive()) return
      if (delay > 0) await new Promise((r) => setTimeout(r, delay))
      driverInstance.moveNext()
    }
    const isCurrentStep = (selector: string) =>
      driverInstance?.isActive() ? (driverInstance.getActiveElement()?.matches(selector) ?? false) : false

    store.setControlMethods({ nextStep, isCurrentStep })
    store.setReplayCallback(() => {
      localStorage.removeItem(storageKey())
      void startTour()
    })

    if (!store.isDriverActive()) {
      const { user: u, isSimple: simple } = userRef.current
      if (
        shouldAutoStartTour({
          isAdmin: u?.role === 'admin',
          isSimpleMode: simple,
          seen: hasSeen(),
          autoStart: true
        })
      ) {
        autoTimer = setTimeout(() => void startTour(), TIMING.AUTO_START_DELAY_MS)
      }
    }

    return () => {
      disposed = true
      if (autoTimer) clearTimeout(autoTimer)
      useOnboardingStore.getState().clearControlMethods()
      useOnboardingStore.getState().setReplayCallback(null)
    }
  }, [])

  return null
}
