'use client'

import { useEffect } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'

// A streamed list (the market page's bets, a member's activity) can render well after the
// navigation itself commits, so the target is watched for this long before it's given up.
const WAIT_MS = 10_000

let pending: { id: string; until: number; requestedFrom: Element | null; pathname: string } | null = null

// The pathname the last-mounted ShowMoreFocus saw, kept outside React so requestShowMoreFocus (a
// plain function called from Link's onNavigate, not a hook) can read it. It's set from the same
// usePathname() the effect below compares against, not from window.location, so it always agrees
// with what "a different page" means here.
let currentPathname = ''

// Called from Link's onNavigate, which fires only for a client-side navigation, so a "Show more"
// opened in a new tab never leaves a target behind in this one. document.activeElement here is
// the link itself (the thing the user just activated), captured so a later focus move can tell
// whether the user is still where the click left them.
export function requestShowMoreFocus(id: string): void {
  pending = { id, until: Date.now() + WAIT_MS, requestedFrom: document.activeElement, pathname: currentPathname }
}

// True once there's nothing left to wait for: the target was focused (or the request was dropped,
// because focus moved on or the pathname changed underneath it), it expired, or none was set.
function focusPending(pathname: string): boolean {
  if (!pending) return true
  // A different pathname means the list the request was made on is gone -- the user navigated
  // away before its next page ever rendered -- so the request is stale even if its id happened to
  // exist on this new page (every list's rowDomId prefix makes that unlikely, but not read here).
  if (pending.pathname !== pathname) {
    pending = null
    return true
  }
  if (Date.now() > pending.until) {
    pending = null
    return true
  }
  const target = document.getElementById(pending.id)
  if (!target) return false
  const { requestedFrom } = pending
  pending = null
  // Only move focus if it's still where the click left it, or has fallen back to the body (the
  // link unmounted with the old rows). If the user has since focused something else -- a form
  // field, another link -- a late-rendering row (a streamed list, or a live refresh) must not
  // steal it back.
  const current = document.activeElement
  if (current === requestedFrom || current === document.body || current === null) {
    // With scroll={false} the new rows render where "Show more" was, already in view; a fresh
    // window has just been scrolled to the top by the router. Either way focusing must not scroll.
    target.focus({ preventScroll: true })
  }
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
    currentPathname = pathname
    if (focusPending(pathname)) return
    const observer = new MutationObserver(() => {
      if (focusPending(pathname)) observer.disconnect()
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
