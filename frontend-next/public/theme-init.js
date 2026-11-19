/*
 * 首屏同步初始化（外链脚本，满足后端 CSP：不允许内联脚本）。
 *  1. 根据 localStorage.theme 或系统偏好给 <html> 加 dark class，防止主题闪烁；
 *  2. 仅 iOS 设备给 viewport 追加 maximum-scale=1.0，防止输入框聚焦时页面放大。
 * 与 Vue 版 main.ts 的 initThemeClass / initIOSViewportZoomFix 行为一致。
 */
;(function () {
  try {
    var saved = null
    try {
      saved = window.localStorage.getItem('theme')
    } catch (e) {}
    var dark =
      saved === 'dark' ||
      (!saved && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches)
    document.documentElement.classList.toggle('dark', !!dark)
  } catch (e) {}

  try {
    var nav = window.navigator || {}
    var ua = nav.userAgent || ''
    var isIOS =
      /\b(iPhone|iPad|iPod)\b/i.test(ua) || (nav.platform === 'MacIntel' && (nav.maxTouchPoints || 0) > 1)
    if (isIOS) {
      var viewport = document.querySelector('meta[name="viewport"]')
      if (viewport) {
        var content = viewport.getAttribute('content') || ''
        if (!/maximum-scale/i.test(content)) {
          viewport.setAttribute('content', content + ', maximum-scale=1.0')
        }
      }
    }
  } catch (e) {}
})()
