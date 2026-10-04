import { DURATION } from '@/lib/ui/motion'

// The sign-in hero's sequence, in ms from its first frame (the approved design on #329). The CSS
// in globals.css ("Sign-in intro") reads its delays from INTRO_CSS_DELAYS, and the sign-in-draw
// keyframes' stops are where each bet's step is revealed; change those together.
export const INTRO = {
  // The leaves grow in over the centred symbol (the launch screen's `launch-leaf`) until here,
  // then the symbol shrinks into the wordmark over DURATION.sheet.
  shrinkAt: 900,
  // Just before that flight lands, the flying symbol cross-fades into the wordmark's own.
  swapAt: 1250,
  cardAt: 1100,
  // The chart draws, and the copy below the card rises in.
  drawAt: 1300,
  // Two bets land, each a step on the line, and Yes counts up to them.
  bets: [
    { at: 1900, yes: 58 },
    { at: 2050, yes: 61 },
  ],
  // The last count has settled; the page drops the intro and rests on the final frame.
  endAt: 2600,
} as const

// When each CSS step starts. The pre-paint script that starts the intro (sign-in-intro.tsx) writes
// these onto <html> as custom properties, and globals.css uses them as animation delays, so the CSS
// can't drift from INTRO.
export const INTRO_CSS_DELAYS = {
  '--intro-backdrop-at': INTRO.shrinkAt,
  '--intro-swap-at': INTRO.swapAt,
  '--intro-hide-at': INTRO.shrinkAt + DURATION.sheet,
  '--intro-card-at': INTRO.cardAt,
  '--intro-draw-at': INTRO.drawAt,
  '--intro-bet-at': INTRO.bets[0].at,
} as const

// A hard-coded sample: signed-out visitors can't read markets, and real questions mustn't leak.
export const SAMPLE = {
  title: 'Will the sermon run past noon?',
  // Yes's chance before the two bets, one step apart.
  history: [50, 54, 49, 56, 51, 58, 52, 54],
  yes: INTRO.bets[INTRO.bets.length - 1].yes,
  bet: 'Sam bet 10 DC on Yes · just now',
} as const

const STEPS = [...SAMPLE.history, ...INTRO.bets.map((bet) => bet.yes)]
const STEP_WIDTH = 100 / STEPS.length

// The sample only moves between about 40% and 60%, so the chart shows 25%–75% (the dashed line
// across its middle is 50%) and the steps read at a phone's height. As a % from the top.
export function sampleTop(chance: number): number {
  return (75 - chance) * 2
}

// One outcome's step line in a 100×100 box, as MarketSparkline draws one: each value holds until
// the next, and the last runs to the right edge.
export function samplePath(outcome: 'yes' | 'no'): string {
  const y = (yes: number) => sampleTop(outcome === 'yes' ? yes : 100 - yes)
  const [first, ...rest] = STEPS
  let d = `M0 ${y(first)}`
  rest.forEach((yes, i) => {
    d += `H${round((i + 1) * STEP_WIDTH)}V${y(yes)}`
  })
  return `${d}H100`
}

function round(n: number): number {
  return Math.round(n * 100) / 100
}
