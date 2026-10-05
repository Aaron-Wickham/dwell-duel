'use client'

import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { formatDcAmount } from '@/lib/format/dc'

const AnimatedNumber = lazy(() => import('@/components/ui/animated-number').then((m) => ({ default: m.AnimatedNumber })))

// Suspense commits its children together, so this sibling's effect runs exactly when the lazy
// number has mounted.
function Mounted({ onMount }: { onMount: () => void }) {
  useEffect(() => {
    onMount()
  }, [onMount])
  return null
}

// Plain text until the balance first changes (#210), so NumberFlow's script stays off every
// page's first load. Its chunk is fetched once the nav is on screen, and on the first change the
// number mounts at the old figure before moving to the new one, so that change still animates.
export function BalanceNumber({ value }: { value: number }) {
  const [initial] = useState(value)
  // Once the balance has moved, it stays live for the rest of the mount.
  const [moved, setMoved] = useState(false)
  const live = moved || value !== initial
  if (live && !moved) setMoved(true)
  const [mounted, setMounted] = useState(false)
  const onMount = useCallback(() => setMounted(true), [])

  useEffect(() => {
    void import('@/components/ui/animated-number')
  }, [])

  const text = <span>{formatDcAmount(value)}</span>
  if (!live) return text
  return (
    <Suspense fallback={text}>
      <AnimatedNumber value={mounted ? value : initial} locales="en-US" suffix=" DC" />
      <Mounted onMount={onMount} />
    </Suspense>
  )
}
