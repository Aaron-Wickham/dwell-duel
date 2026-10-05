'use client'

import { useSyncExternalStore } from 'react'
import { LocalTime } from '@/components/ui/local-time'
import { closesInLabel } from '@/lib/markets/closes-in'

const TICK_MS = 30_000

// One clock for every card on the page, rather than a timer per card.
let clock = 0
let timer: ReturnType<typeof setInterval> | undefined
const listeners = new Set<() => void>()

function subscribe(listener: () => void) {
  listeners.add(listener)
  if (timer === undefined) {
    clock = Date.now()
    timer = setInterval(() => {
      clock = Date.now()
      listeners.forEach((l) => l())
    }, TICK_MS)
  }
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) {
      clearInterval(timer)
      timer = undefined
      clock = 0
    }
  }
}

// A market card's close time: "Closes in 2h" within a day, "Closes Sun 12:00 PM" further out, and
// "Waiting for a result" once it has passed.
// `now` is the server's render time: hydration renders with it, so server and client agree, and
// the shared clock takes over straight after, so a page left open keeps counting down.
export function ClosesLabel({ closeAt, now }: { closeAt: string; now: number }) {
  const current = useSyncExternalStore(
    subscribe,
    () => clock || now,
    () => now,
  )
  if (Date.parse(closeAt) <= current) return <>Waiting for a result</>
  const soon = closesInLabel(closeAt, current)
  if (soon) return <>{soon}</>
  return (
    <>
      Closes <LocalTime iso={closeAt} format="dateTime" />
    </>
  )
}
