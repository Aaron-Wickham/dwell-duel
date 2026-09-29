'use client'

import { useSyncExternalStore } from 'react'
import { Clock } from 'lucide-react'
import { StatusChip } from '@/components/ui/status-chip'
import { closesInLabel } from '@/lib/markets/closes-in'

const TICK_MS = 30_000

// One clock for every chip on the page, rather than a timer per card.
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

// `now` is the server's render time: hydration renders with it, so server and client agree, and
// the shared clock takes over straight after, so a page left open keeps counting down.
export function ClosesSoonChip({ closeAt, now }: { closeAt: string; now: number }) {
  const current = useSyncExternalStore(
    subscribe,
    () => clock || now,
    () => now,
  )
  const label = closesInLabel(closeAt, current)
  if (!label) return null
  return (
    <StatusChip tone="wait">
      <Clock aria-hidden="true" className="size-3.5" />
      {label}
    </StatusChip>
  )
}
