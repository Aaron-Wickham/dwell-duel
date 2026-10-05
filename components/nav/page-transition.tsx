import { ViewTransition, type ReactNode, type ViewTransitionClassPerType } from 'react'

// The class names match the ::view-transition rules in app/globals.css. A navigation tagged
// nav-forward or nav-back slides; one tagged nav-tab (TAB_TRANSITION: the nav, the tab bar, SubNav)
// swaps at once, as a native tab bar does (#384); an untagged one (a skeleton giving way to
// content) fades across. default="none" keeps router.refresh() and in-place updates still. The
// browser's own back button and router.back() run no view transition at all -- confirmed
// empirically with Playwright, document.startViewTransition is never called on either -- because
// React commits a popstate traversal synchronously.
export const TAB_TRANSITION = ['nav-tab']
const DIRECTIONAL = { 'nav-forward': 'nav-forward', 'nav-back': 'nav-back', 'nav-tab': 'none' }
const ENTER: ViewTransitionClassPerType = { ...DIRECTIONAL, default: 'page-enter' }
const EXIT: ViewTransitionClassPerType = { ...DIRECTIONAL, default: 'page-exit' }

export function RouteTransition({ children }: { children: ReactNode }) {
  return (
    <ViewTransition enter={ENTER} exit={EXIT} default="none">
      {children}
    </ViewTransition>
  )
}

// Every route animates alike: the link that leads somewhere picks the motion through its
// transitionTypes. The names say which kind of page a call site wraps.
export const DrillDownTransition = RouteTransition
export const TabTransition = RouteTransition
export const SkeletonReveal = RouteTransition
export const ContentReveal = RouteTransition
