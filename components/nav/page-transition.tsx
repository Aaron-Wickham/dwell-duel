import { ViewTransition, type ReactNode, type ViewTransitionClassPerType } from 'react'

// The class names match the ::view-transition rules in app/globals.css. A navigation tagged
// nav-forward or nav-back slides; an untagged one (a tab, a skeleton giving way to content)
// fades across. default="none" keeps router.refresh() and in-place updates still. The browser's
// own back button and router.back() run no view transition at all -- confirmed empirically with
// Playwright, document.startViewTransition is never called on either -- because React commits a
// popstate traversal synchronously.
const DIRECTIONAL = { 'nav-forward': 'nav-forward', 'nav-back': 'nav-back' }
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
