import { ViewTransition, type ReactNode } from 'react'

// The skeleton-to-content handoff. A loading.tsx wraps its skeleton in SkeletonReveal and the
// page wraps its content in ContentReveal (<Page reveal>); when the Suspense boundary resolves, the skeleton
// slides down and out while the content slides up and in (app/globals.css). default="none"
// keeps both still during every other transition on the page.
export function SkeletonReveal({ children }: { children: ReactNode }) {
  return (
    <ViewTransition exit="skeleton-exit" default="none">
      {children}
    </ViewTransition>
  )
}

export function ContentReveal({ children }: { children: ReactNode }) {
  return (
    <ViewTransition enter="content-enter" default="none">
      {children}
    </ViewTransition>
  )
}
