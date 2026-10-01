'use client'

import { useEffect } from 'react'

// Back and forward restore the scroll position the member left, and Next (or the browser, on a
// reload or a bfcache-less back) does that itself; only a fresh navigation to a #section needs a hand.
const RESTORE_WINDOW_MS = 2000
let lastPopstate = -Infinity
let firstMount = true
if (typeof window !== 'undefined') {
  window.addEventListener('popstate', () => {
    lastPopstate = performance.now()
  })
}

function isRestore(): boolean {
  if (performance.now() - lastPopstate < RESTORE_WINDOW_MS) return true
  if (!firstMount) return false
  const entry = performance.getEntriesByType?.('navigation')[0] as PerformanceNavigationTiming | undefined
  return entry?.type === 'back_forward' || entry?.type === 'reload'
}

function hashId(hash: string): string | null {
  try {
    return decodeURIComponent(hash.slice(1)) || null
  } catch {
    return null // a malformed escape: no section to go to
  }
}

// A link from another page to a section (Settings' Your data, the slip's How parlays pay) navigates
// on the client, and Next looks for the #id while loading.tsx's skeleton is showing, finds nothing,
// and leaves the page at the top. Once the doc itself has rendered, go to the section.
export function ScrollToHash() {
  useEffect(() => {
    const restore = isRestore()
    firstMount = false
    if (restore) return
    const id = hashId(window.location.hash)
    if (id) document.getElementById(id)?.scrollIntoView()
  }, [])
  return null
}
