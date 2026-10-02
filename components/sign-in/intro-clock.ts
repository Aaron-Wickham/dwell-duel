// Where the sign-in intro is on its timeline, for the parts script runs, or null when it isn't
// playing. The CSS half started at the first frame, before hydration, so script times itself from
// the leaves' own animation rather than from when it happened to run.
import { reducedMotion } from '@/lib/ui/reduced-motion'

export const INTRO_SYMBOL_ID = 'sign-in-intro-symbol'
export const WORDMARK_SYMBOL_ID = 'sign-in-wordmark-symbol'

export function introClock(): { start: number; now: number } | null {
  // The pre-paint script already skips the intro under reduced motion; this covers a setting
  // changed between that script and hydration.
  if (!('signInIntro' in document.documentElement.dataset) || reducedMotion()) return null
  const now = document.timeline?.currentTime
  if (typeof now !== 'number') return null
  const leaf = document.querySelector(`#${INTRO_SYMBOL_ID} .launch-leaf`)
  const start = leaf?.getAnimations?.()[0]?.startTime
  return { start: typeof start === 'number' ? start : now, now }
}
