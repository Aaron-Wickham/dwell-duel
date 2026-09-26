import type * as React from 'react'

// Vitest resolves the stable react package, which doesn't export ViewTransition; only Next's
// bundled canary React does. A test that renders one mocks react with this stand-in:
//   vi.mock('react', async (importOriginal) =>
//     (await import('@/tests/components/view-transition-mock')).withViewTransition(await importOriginal()))
// It renders the children with no DOM of its own and records each call's props.
export const viewTransitionCalls: React.ViewTransitionProps[] = []

export function withViewTransition(actual: typeof React) {
  return {
    ...actual,
    ViewTransition: (props: React.ViewTransitionProps) => {
      viewTransitionCalls.push(props)
      return props.children
    },
  }
}
