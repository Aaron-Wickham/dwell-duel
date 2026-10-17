import type { MouseEvent } from 'react'
import { reducedMotion } from '@/lib/ui/reduced-motion'

// A tap on the tab whose page you're on scrolls back to its top instead of navigating (#464), as a
// native tab bar does. Only the tab's own URL counts: from a market page or another My bets tab,
// the same tab still navigates. A modified click (a new tab, a new window) is left to the browser.
export function scrollToTopOnCurrentTab(event: MouseEvent<HTMLAnchorElement>, href: string): void {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
  if (window.location.pathname + window.location.search !== href) return
  event.preventDefault()
  window.scrollTo({ top: 0, behavior: reducedMotion() ? 'instant' : 'smooth' })
}
