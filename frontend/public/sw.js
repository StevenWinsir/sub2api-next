/* Sub2API 静态资源缓存 Service Worker（交接书 §3.5 / §8 R5）。
 *
 * 目的：后端只给 assets/ 下的 Vite 哈希文件下发 immutable，Next 的 /_next/static/ 得不到长缓存，
 *       这里用“缓存优先”补上，重复访问不再重新下载 JS / CSS / 字体。
 *
 * 边界（任何一条都不能破）：
 *  - 只处理同源 GET 且路径以 /_next/static/ 开头的请求；
 *  - HTML（navigate）、/api、/v1、网关与支付回调等一律不拦截（不调用 respondWith）；
 *  - 新版本激活（VERSION 变化）后清理旧缓存；
 *  - 紧急注销：页面端 ?sw=off / localStorage.sw_disabled=1 / 构建期 NEXT_PUBLIC_DISABLE_SW=1，
 *    或向 SW 发送 {type:'KILL'}，都会注销自身并清空全部缓存。
 * 不使用 eval / importScripts，满足后端 CSP（script-src 'self'）。
 */
'use strict'

var VERSION = '__BUILD_ID__'
var CACHE_PREFIX = 'sub2api-static-'
var CACHE_NAME = CACHE_PREFIX + VERSION
var STATIC_PREFIX = '/_next/static/'
var killed = false

function shouldHandle(request, selfOrigin) {
  if (request.method !== 'GET') return false
  // Range 请求（媒体 / 断点续传）交给网络
  if (request.headers && typeof request.headers.get === 'function' && request.headers.get('range'))
    return false
  var url
  try {
    url = new URL(request.url)
  } catch (e) {
    return false
  }
  if (url.origin !== selfOrigin) return false
  return url.pathname.indexOf(STATIC_PREFIX) === 0
}

function cacheFirst(request) {
  return caches.open(CACHE_NAME).then(function (cache) {
    return cache.match(request).then(function (hit) {
      if (hit) return hit
      return fetch(request).then(function (response) {
        // 只缓存成功的同源基础响应；错误 / opaque 响应不入缓存
        if (response && response.status === 200 && response.type === 'basic') {
          cache.put(request, response.clone())
        }
        return response
      })
    })
  })
}

function clearAllCaches() {
  return caches.keys().then(function (keys) {
    return Promise.all(
      keys
        .filter(function (k) {
          return k.indexOf(CACHE_PREFIX) === 0
        })
        .map(function (k) {
          return caches.delete(k)
        })
    )
  })
}

self.addEventListener('install', function () {
  self.skipWaiting()
})

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches
      .keys()
      .then(function (keys) {
        return Promise.all(
          keys
            .filter(function (k) {
              return k.indexOf(CACHE_PREFIX) === 0 && k !== CACHE_NAME
            })
            .map(function (k) {
              return caches.delete(k)
            })
        )
      })
      .then(function () {
        return self.clients.claim()
      })
  )
})

self.addEventListener('fetch', function (event) {
  // 紧急注销后不再拦截（页面在注销前发出的请求也不会再写回缓存）
  if (killed) return
  if (!shouldHandle(event.request, self.location.origin)) return
  event.respondWith(cacheFirst(event.request))
})

self.addEventListener('message', function (event) {
  var data = event.data
  if (!data || typeof data !== 'object') return
  if (data.type === 'SKIP_WAITING') {
    self.skipWaiting()
  } else if (data.type === 'KILL') {
    killed = true
    event.waitUntil(
      clearAllCaches().then(function () {
        return self.registration.unregister()
      })
    )
  }
})
