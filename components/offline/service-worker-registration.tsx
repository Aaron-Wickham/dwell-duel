'use client'

import { useEffect } from 'react'

// A ?v= on the script URL is what makes a new deploy replace the worker: the browser refetches
// and reinstalls whenever the registration URL's bytes differ, and sw.js names its cache after
// this same query param, so an old deploy's cache is deleted on the next activate rather than
// growing forever.
const SW_URL = `/sw.js?v=${process.env.NEXT_PUBLIC_SW_VERSION ?? 'dev'}`

export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    if (process.env.NODE_ENV !== 'production') {
      // A worker left behind by a local `next start` on the same port would serve dev chunks
      // cache-first and hide code changes.
      navigator.serviceWorker
        .getRegistrations()
        .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())))
        .catch(() => undefined)
      return
    }
    navigator.serviceWorker.register(SW_URL, { scope: '/' }).catch((error: unknown) => {
      console.error('Service worker registration failed', error)
    })
  }, [])

  return null
}
