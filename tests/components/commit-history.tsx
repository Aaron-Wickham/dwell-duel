import { Profiler, type ReactNode } from 'react'

// Records the page's text after every React commit inside it, so a test can prove a state never
// reached the screen, not even for one commit between the optimistic state and the server's.
export function CommitHistory({ history, children }: { history: string[]; children: ReactNode }) {
  return (
    <Profiler id="commit-history" onRender={() => history.push(document.body.textContent ?? '')}>
      {children}
    </Profiler>
  )
}
