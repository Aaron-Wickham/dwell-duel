'use client'

import { useEffect, useState } from 'react'
import { cardClass } from '@/components/ui/card'
import { StatusChip } from '@/components/ui/status-chip'
import { AnimatedNumber } from '@/components/ui/animated-number'
import { rowTitleClass, chipTextClass } from '@/components/ui/page'
import { INTRO, SAMPLE, samplePath, sampleTop } from './intro-timeline'
import { introClock } from './intro-clock'
import { cn } from '@/lib/utils'

const LABEL = `Sample market: ${SAMPLE.title} Yes ${SAMPLE.yes}%, No ${100 - SAMPLE.yes}%.`

// A market card as the markets list draws one, hard-coded. One image to a screen reader: it's an
// illustration, so its parts aren't read one by one. The `sign-in-intro-*` classes animate only
// while the intro plays (globals.css).
export function SampleMarket() {
  const [yes, setYes] = useState<number>(SAMPLE.yes)

  useEffect(() => {
    const clock = introClock()
    // Hydrated after the card came into view: the count would visibly jump back, so it stays put.
    if (!clock || clock.now - clock.start >= INTRO.cardAt) return
    const at = (ms: number) => Math.max(0, clock.start + ms - clock.now)
    const timers = [
      setTimeout(() => setYes(SAMPLE.history[SAMPLE.history.length - 1]), 0),
      ...INTRO.bets.map((bet) => setTimeout(() => setYes(bet.yes), at(bet.at))),
    ]
    return () => timers.forEach(clearTimeout)
  }, [])

  return (
    <div role="img" aria-label={LABEL} className={cn(cardClass, 'flex flex-col gap-2.5 p-4 lg:gap-3 lg:p-5')}>
      <div className="flex flex-wrap items-center gap-2">
        <StatusChip tone="open">Open</StatusChip>
        <StatusChip tone="void" size="sm">Church</StatusChip>
        <span className="text-sm text-ink2">Sample</span>
      </div>
      <p className={rowTitleClass}>{SAMPLE.title}</p>
      <div className="relative h-[110px] short:h-16 lg:h-[200px]">
        <div className="absolute inset-y-0 right-16 left-0">
          <div className="absolute inset-x-0 bottom-0 border-t border-line short:hidden" />
          <div className="absolute inset-x-0 top-1/2 border-t border-dashed border-line short:hidden" />
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="sign-in-intro-draw absolute inset-0 size-full overflow-visible">
            <path d={samplePath('no')} fill="none" className="stroke-line-s" strokeWidth={2.5} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
            <path d={samplePath('yes')} fill="none" className="stroke-s2" strokeWidth={3} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          </svg>
        </div>
        <div className={`absolute inset-y-0 right-0 w-16 ${chipTextClass} leading-none font-extrabold tabular-nums`}>
          <span className="absolute left-1.5 -translate-y-1/2 whitespace-nowrap text-s2" style={{ top: `${sampleTop(SAMPLE.yes)}%` }}>
            Yes <AnimatedNumber value={yes} suffix="%" />
          </span>
          <span className="absolute left-1.5 -translate-y-1/2 whitespace-nowrap text-ink2" style={{ top: `${sampleTop(100 - SAMPLE.yes)}%` }}>
            No <AnimatedNumber value={100 - yes} suffix="%" />
          </span>
        </div>
      </div>
      <div className="sign-in-intro-bet flex items-center justify-between gap-3">
        <span className="text-sm text-ink2">{SAMPLE.bet}</span>
        <span className="font-extrabold text-s2 tabular-nums">
          <AnimatedNumber value={yes} suffix="%" />
        </span>
      </div>
    </div>
  )
}
