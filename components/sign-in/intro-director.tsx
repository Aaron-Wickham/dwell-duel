'use client'

import { useEffect } from 'react'
import { DURATION, cssEase } from '@/lib/ui/motion'
import { INTRO } from './intro-timeline'
import { INTRO_SYMBOL_ID, introClock } from './intro-clock'

export const WORDMARK_SYMBOL_ID = 'sign-in-wordmark-symbol'

// Module-level, so Strict Mode's second effect run (or a remount) can't schedule it twice, and so
// it still happens when the page is left mid-intro: a later visit to sign-in in the same document
// must open on the final frame.
let ending = false

function endIntro(clock: { start: number; now: number }) {
  if (ending) return
  ending = true
  setTimeout(
    () => {
      delete document.documentElement.dataset.signInIntro
      ending = false
    },
    Math.max(0, clock.start + INTRO.endAt - clock.now),
  )
}

// The part of the intro CSS can't do: where the wordmark sits depends on the layout, so the
// symbol's flight into it is measured here. Renders nothing.
export function IntroDirector() {
  useEffect(() => {
    const clock = introClock()
    if (!clock) return
    endIntro(clock)
    const symbol = document.getElementById(INTRO_SYMBOL_ID)
    const target = document.getElementById(WORDMARK_SYMBOL_ID)
    if (!symbol?.animate || !target) return
    const from = symbol.getBoundingClientRect()
    const to = target.getBoundingClientRect()
    if (!from.width) return
    const dx = to.left + to.width / 2 - (from.left + from.width / 2)
    const dy = to.top + to.height / 2 - (from.top + from.height / 2)
    const flight = symbol.animate(
      [{ transform: 'none' }, { transform: `translate(${dx}px, ${dy}px) scale(${to.width / from.width})` }],
      {
        duration: DURATION.sheet,
        delay: Math.max(0, clock.start + INTRO.shrinkAt - clock.now),
        easing: cssEase('ios'),
        fill: 'forwards',
      },
    )
    return () => flight.cancel()
  }, [])
  return null
}
