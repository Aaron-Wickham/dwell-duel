// Hand-rolled on purpose: three routing rules don't need a library. The cache name comes from
// the registration URL's ?v= query string (components/offline/service-worker-registration.tsx
// registers "/sw.js?v=<build id>"), so every deploy gets its own cache automatically without a
// hand-bumped version constant. Activate keeps this deploy's cache and the one before it (#209): a
// tab or installed app still running the old build lazy-loads its chunks from the old cache, since
// Vercel no longer serves them once the new build is live; anything older is deleted, which both
// rolls a caching change out to installed phones and keeps old deploys' caches from accumulating.
const CACHE_VERSION = new URL(self.location.href).searchParams.get('v') ?? 'dev'
const CACHE_NAME = `dwellduel-${CACHE_VERSION}`
// Cache names carry a build id, not anything sortable, so the order deploys activated in is kept
// in a small cache of its own.
const META_CACHE = 'dwellduel-meta'
const ORDER_URL = '/__cache-order'
const KEEP_CACHES = 2
const OFFLINE_URL = '/offline'
const STATIC_PREFIX = '/_next/static/'
const STATIC_ASSET_URL = /\/_next\/static\/[^"'\s\\)]+/g

// The offline page is shown exactly when the network is gone, so the CSS, fonts and scripts
// its HTML references are cached alongside it rather than left to the runtime cache. The fetch
// is anonymous and rejects a redirect: a cookied request could precache a signed-in redirect or
// another member's response. The cached page then always renders with the default theme rather
// than a member's saved theme cookie -- an accepted trade-off for never caching per-member bytes.
async function precacheOfflinePage() {
  const cache = await caches.open(CACHE_NAME)
  const response = await fetch(OFFLINE_URL, { cache: 'no-store', credentials: 'omit' })
  if (!response.ok) throw new Error(`Precaching ${OFFLINE_URL} failed with ${response.status}`)
  if (response.redirected) throw new Error(`Precaching ${OFFLINE_URL} was redirected`)
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

// Every page is live, per-member data, so a navigation is never answered from cache. Navigation
// preload lets the browser start the real request in parallel with the worker's own startup
// instead of waiting for it; the offline page is the only fallback when neither one answers, and
// it comes from this deploy's own cache, not the kept older one.
const DIAG = typeof BroadcastChannel === 'undefined' ? { postMessage() {} } : new BroadcastChannel('diag')
async function networkFirstNavigation(event) {
  const u = event.request.url
  try {
    const pre = await event.preloadResponse
    if (pre) { DIAG.postMessage(`SW ${u} preload ${pre.status} url=${pre.url} redirected=${pre.redirected} type=${pre.type}`); return pre }
    const r = await fetch(event.request)
    DIAG.postMessage(`SW ${u} fetch ${r.status} url=${r.url} redirected=${r.redirected}`)
    return r
  } catch (e) {
    const cache = await caches.open(CACHE_NAME)
    const c = await cache.match(OFFLINE_URL)
    DIAG.postMessage(`SW ${u} fallback ${String(e).slice(0, 80)} cached=${!!c} url=${c && c.url}`)
    return c ?? Response.error()
  }
}

// Deploys in activation order, this one last. A cache the order doesn't know (made before this
// code shipped) counts as older than every one it does.
async function readOrder(meta) {
  try {
    const stored = await meta.match(ORDER_URL)
    const listed = stored ? await stored.json() : []
    return Array.isArray(listed) ? listed.filter((name) => typeof name === 'string') : []
  } catch {
    return []
  }
}

async function pruneOldCaches() {
  const meta = await caches.open(META_CACHE)
  const keys = (await caches.keys()).filter((key) => key !== META_CACHE)
  const listed = (await readOrder(meta)).filter((name) => keys.includes(name) && name !== CACHE_NAME)
  const unlisted = keys.filter((key) => !listed.includes(key) && key !== CACHE_NAME)
  const order = [...unlisted, ...listed, CACHE_NAME]
  const keep = order.slice(-KEEP_CACHES)
  await meta.put(ORDER_URL, new Response(JSON.stringify(keep), { headers: { 'content-type': 'application/json' } }))
  await Promise.all(keys.filter((key) => !keep.includes(key)).map((key) => caches.delete(key)))
}

// Taking over at once means the first visit's tab gets the offline fallback from its next
// navigation. It's safe because nothing this worker serves can go stale mid-session.
self.addEventListener('install', (event) => {
  event.waitUntil(precacheOfflinePage().then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(Promise.all([pruneOldCaches(), self.registration.navigationPreload?.enable()]).then(() => self.clients.claim()))
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
    event.respondWith(networkFirstNavigation(event))
  }
})

// Web push (#80). The payload is { title, body, url } from lib/push/messages.ts; url is an in-app
// path. Only same-origin paths are opened, so a payload can never send a tap somewhere else.
function inAppUrl(path) {
  try {
    const url = new URL(path, self.location.origin)
    return url.origin === self.location.origin ? url.href : self.location.origin + '/'
  } catch {
    return self.location.origin + '/'
  }
}

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { body: event.data ? event.data.text() : '' }
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'DwellDuel', {
      body: data.body || '',
      icon: '/android-chrome-192.png',
      badge: '/favicon-48.png',
      data: { url: inAppUrl(data.url || '/') },
    }),
  )
})

// Reuses an open DwellDuel window when there is one, so a tap doesn't stack up tabs.
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url || self.location.origin + '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (windows) => {
      const open = windows.find((client) => new URL(client.url).origin === self.location.origin)
      if (open) {
        await open.focus()
        return open.navigate(url).catch(() => self.clients.openWindow(url))
      }
      return self.clients.openWindow(url)
    }),
  )
})

// A browser rotates or expires a push subscription now and then (#257). The old endpoint stops
// working, so the new subscription is made here, with the same key, and handed to the server. The
// request is a plain POST, which this worker never answers from cache. If it fails (offline, signed
// out), the page's own re-sync on the next load tells the server instead.
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    (async () => {
      const key = event.oldSubscription?.options?.applicationServerKey
      // Firefox often gives neither subscription, so look for one the browser already made, and only
      // then make one with the old key.
      let subscription = event.newSubscription ?? (await self.registration.pushManager.getSubscription())
      if (!subscription && key) subscription = await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key })
      if (!subscription) return
      const { endpoint, keys } = subscription.toJSON()
      await fetch('/api/push/resync', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ endpoint, p256dh: keys?.p256dh, auth: keys?.auth }),
      })
    })().catch(() => undefined),
  )
})
