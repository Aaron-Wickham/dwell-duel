import { useCallback, useEffect, useState } from 'react'

// How long a held action waits for Undo before it is sent (UX audit D-7).
export const UNDO_WINDOW_MS = 5_000

// Why a window committed: its timer ran out, or the page or component was going away.
export type CommitReason = 'timer' | 'leaving'

export type UndoWindow = {
  // Opens the window; false if one is already open.
  start: () => boolean
  // Closes an open window without committing; false if none was open.
  undo: () => boolean
  // Commits an open window at once, as leaving; false if none was open.
  flush: () => boolean
  isOpen: () => boolean
}

// Holds one action for `delayMs`, then commits it, unless Undo closes the window first. Each
// window commits at most once, whether the timer, flush or both end it, and nothing is sent while
// it's open. After a window ends, a new one can start (Approve again after a refused approval).
export function createUndoWindow(commit: (reason: CommitReason) => void, delayMs: number = UNDO_WINDOW_MS): UndoWindow {
  let timer: ReturnType<typeof setTimeout> | null = null

  function close(): boolean {
    if (timer === null) return false
    clearTimeout(timer)
    timer = null
    return true
  }

  function end(reason: CommitReason): boolean {
    if (!close()) return false
    commit(reason)
    return true
  }

  return {
    start() {
      if (timer !== null) return false
      timer = setTimeout(() => end('timer'), delayMs)
      return true
    },
    undo: close,
    flush: () => end('leaving'),
    isOpen: () => timer !== null,
  }
}

// The window as React state. `commit` runs once per window: when the timer ends it ('timer'), or
// at once when the component unmounts or the page is hidden or left ('leaving'), so leaving during
// the window sends the action rather than silently dropping it. A hidden page may never run its
// timer (a phone suspends it), so hiding sends it too. No "Leave site?" prompt: the request is
// already on its way when the page goes, and a prompt would add nothing but a question. A page
// killed outright mid-window can still lose it, which leaves the action undone, never doubled.
export function useUndoWindow(commit: (reason: CommitReason) => void, delayMs: number = UNDO_WINDOW_MS) {
  const [open, setOpen] = useState(false)
  // Created once, so the timer it holds outlives renders; it calls whichever commit the latest
  // render handed it.
  const [held] = useState(() => {
    let latest: (reason: CommitReason) => void = () => {}
    const undoWindow = createUndoWindow((reason) => latest(reason), delayMs)
    return {
      ...undoWindow,
      setCommit(next: (reason: CommitReason) => void) {
        latest = next
      },
    }
  })
  useEffect(() => {
    held.setCommit((reason) => {
      setOpen(false)
      commit(reason)
    })
  })

  useEffect(
    () => () => {
      held.flush()
    },
    [held],
  )

  useEffect(() => {
    if (!open) return
    function onLeave() {
      held.flush()
    }
    function onVisibilityChange() {
      if (document.visibilityState === 'hidden') held.flush()
    }
    window.addEventListener('beforeunload', onLeave)
    window.addEventListener('pagehide', onLeave)
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      window.removeEventListener('beforeunload', onLeave)
      window.removeEventListener('pagehide', onLeave)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [open, held])

  const start = useCallback(() => {
    const started = held.start()
    if (started) setOpen(true)
    return started
  }, [held])

  const undo = useCallback(() => {
    const undone = held.undo()
    if (undone) setOpen(false)
    return undone
  }, [held])

  return { open, start, undo }
}
