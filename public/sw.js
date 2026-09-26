// Hand-rolled on purpose: three routing rules don't need a library. Bump CACHE_VERSION whenever
// this file's caching changes; activate deletes every other cache, which is what rolls the
// change out to phones that already installed the old worker.
const CACHE_VERSION = 'v1'
const CACHE_NAME = `dwellduel-${CACHE_VERSION}`
const OFFLINE_URL = '/offline'
const STATIC_PREFIX = '/_next/static/'
const STATIC_ASSET_URL = /\/_next\/static\/[^"'\s\\)]+/g

// The offline page is shown exactly when the network is gone, so the CSS, fonts and scripts
// its HTML references are cached alongside it rather than left to the runtime cache.
async function precacheOfflinePage() {
  const cache = await caches.open(CACHE_NAME)
  const response = await fetch(OFFLINE_URL, { cache: 'no-store' })
  if (!response.ok) throw new Error(`Precaching ${OFFLINE_URL} failed with ${response.status}`)
  const html = await response.clone().text()
  await cache.put(OFFLINE_URL, response)
  const assets = [...new Set(html.match(STATIC_ASSET_URL) ?? [])]
  await Promise.all(assets.map((url) => cache.add(url).catch(() => undefined)))
}

// Everything under /_next/static/ is content-hashed, so a URL never changes meaning and a
// cached copy can't go stale. Error responses aren't cached: they aren't that URL's bytes.
async function cacheFirst(event) {
  const cached = await caches.match(event.request)
  if (cached) return cached
  const response = await fetch(event.request)
  if (response.ok) {
    const copy = response.clone()
    event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy)))
  }
  return response
}

// Every page is live, per-member data, so a navigation is never answered from cache. The
// offline page is the only fallback.
async function networkFirstNavigation(request) {
  try {
    return await fetch(request)
  } catch {
    return (await caches.match(OFFLINE_URL)) ?? Response.error()
  }
}

// Taking over at once means the first visit's tab gets the offline fallback from its next
// navigation. It's safe because nothing this worker serves can go stale mid-session.
self.addEventListener('install', (event) => {
  event.waitUntil(precacheOfflinePage().then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  )
})

// RSC fetches, server actions, Next's offline polling and Supabase get no respondWith at all,
// so the browser handles them exactly as if this worker didn't exist.
self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  if (url.pathname.startsWith(STATIC_PREFIX)) {
    event.respondWith(cacheFirst(event))
    return
  }
  if (request.mode === 'navigate') {
    event.respondWith(networkFirstNavigation(request))
  }
})
