'use client'

import { useEffect } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'

// A streamed list (the market page's bets, a member's activity) can render well after the
// navigation itself commits, so the target is watched for this long before it's given up.
const WAIT_MS = 10_000

let pending: { id: string; until: number } | null = null

// Called from Link's onNavigate, which fires only for a client-side navigation, so a "Show more"
// opened in a new tab never leaves a target behind in this one.
export function requestShowMoreFocus(id: string): void {
  pending = { id, until: Date.now() + WAIT_MS }
}

// True once there's nothing left to wait for: the target was focused, it expired, or none was set.
function focusPending(): boolean {
  if (!pending) return true
  if (Date.now() > pending.until) {
    pending = null
    return true
  }
  const target = document.getElementById(pending.id)
  if (!target) return false
  pending = null
  // With scroll={false} the new rows render where "Show more" was, already in view; a fresh
  // window has just been scrolled to the top by the router. Either way focusing must not scroll.
  target.focus({ preventScroll: true })
  return true
}

// Rendered once on every page with a "Show more". The target is held in this module rather than
// the URL, so a reload or a shared link never refocuses a row, and the link's href stays the
// list's position alone. It's read here, not in ShowMore, because the last "Show more" of a list
// is gone from the page its own navigation renders.
export function ShowMoreFocus() {
  const pathname = usePathname()
  const search = useSearchParams().toString()

  useEffect(() => {
    if (focusPending()) return
    const observer = new MutationObserver(() => {
      if (focusPending()) observer.disconnect()
    })
    observer.observe(document.body, { childList: true, subtree: true })
    const timer = window.setTimeout(() => observer.disconnect(), WAIT_MS)
    return () => {
      observer.disconnect()
      window.clearTimeout(timer)
    }
  }, [pathname, search])

  return null
}
