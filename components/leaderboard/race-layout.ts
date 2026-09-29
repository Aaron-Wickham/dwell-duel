import { spreadLabels } from '@/components/markets/probability-chart'

// Past this multiple of everyone else's range, the top or bottom line is a runaway and the scale
// stops for the rest instead of for it.
const RUNAWAY = 2.5
// Room beyond the others' extremes once a runaway is clipped, so they aren't pressed against the edge.
const HEADROOM = 1.3
// However tight the others are, a clipped scale keeps at least this share of the runaway's range,
// so near-equal totals aren't blown up into a fake spread.
const MIN_SHARE = 0.08
// At least this much label room at each edge, spreadLabels' own inset.
const LABEL_PAD = 20

export interface RaceLayoutOptions {
  height: number
  // Room above and below the line inside the plot, so a peak isn't cut at the edge.
  pad: number
  gap: number
}

export interface RaceLayout {
  low: number
  high: number
  // The series (by index) whose line runs off the top of the scale at some point.
  clippedTop: number | null
  // The series (by index) whose line runs off the bottom of the scale at some point.
  clippedBottom: number | null
  // Each series' end-label centre in px from the top, or null when it didn't fit and is left to the readout.
  labelTops: (number | null)[]
}

const indexOfBest = (xs: number[], better: (a: number, b: number) => boolean) =>
  xs.reduce((best, x, i) => (better(x, xs[best]) ? i : best), 0)

// The race's y scale and end labels, from each series' running totals (best final first).
// Zero is always in range. A runaway at either end is clipped the same way: the scale is set by
// everyone else, the runaway's line runs off that edge, and its label sits at the edge with its
// true total.
export function raceLayout(values: number[][], { height, pad, gap }: RaceLayoutOptions): RaceLayout {
  const peaks = values.map((v) => Math.max(0, ...v))
  const troughs = values.map((v) => Math.min(0, ...v))
  const top = indexOfBest(peaks, (a, b) => a > b)
  const bottom = indexOfBest(troughs, (a, b) => a < b)
  const hi = peaks[top] ?? 0
  const lo = troughs[bottom] ?? 0
  // Everyone else's extremes: the highest peak but the top line's, the lowest trough but the bottom line's.
  const restHi = Math.max(0, ...peaks.filter((_, i) => i !== top))
  const restLo = Math.min(0, ...troughs.filter((_, i) => i !== bottom))

  // Whether the top (bottom) line runs away from the rest, with the scale's other end at `far`.
  const runsOffTop = (far: number) => values.length > 1 && restHi > far && hi - far >= RUNAWAY * (restHi - far)
  const runsOffBottom = (far: number) => values.length > 1 && far > restLo && far - lo >= RUNAWAY * (far - restLo)

  // Clipping one end narrows the scale, which can make the other end a runaway too. A runaway at
  // each end can hide the other, so when neither runs away alone they are judged together.
  let clipTop = runsOffTop(lo)
  let clipBottom = runsOffBottom(hi)
  if (clipTop || clipBottom) {
    clipTop ||= runsOffTop(restLo)
    clipBottom ||= clipTop && runsOffBottom(restHi)
  } else {
    clipTop = clipBottom = runsOffTop(restLo) && runsOffBottom(restHi)
  }

  // A clipped end is measured from the other end as the rest reach it, not from a runaway there.
  const floor = clipBottom ? restLo : lo
  const ceiling = clipTop ? restHi : hi
  let high = hi
  let low = lo
  if (clipTop) high = floor + Math.max(restHi - floor, (hi - floor) * MIN_SHARE) * HEADROOM
  if (clipBottom) low = ceiling - Math.max(ceiling - restLo, (ceiling - lo) * MIN_SHARE) * HEADROOM
  if (high === low) high = low + 1

  const yOf = (v: number) => pad + ((high - v) / (high - low)) * (height - pad * 2)
  const finals = values.map((v) => v.at(-1) ?? 0)
  // A total off the scale is labelled at that edge.
  const targets = finals.map((f) => (f > high ? 0 : f < low ? height : yOf(f)))

  // Only as many labels as fit a gap apart, best final first; the rest are in the readout.
  const room = Math.floor((height - LABEL_PAD * 2) / gap) + 1
  const shown = finals
    .map((f, i) => ({ f, i }))
    .sort((a, b) => b.f - a.f || a.i - b.i)
    .slice(0, room)
    .map(({ i }) => i)
  const spread = spreadLabels(
    shown.map((i) => targets[i]),
    height,
    gap,
  )
  const labelTops: (number | null)[] = values.map(() => null)
  shown.forEach((i, k) => {
    labelTops[i] = spread[k]
  })

  return { low, high, clippedTop: clipTop ? top : null, clippedBottom: clipBottom ? bottom : null, labelTops }
}

// Where a clipped line first leaves the scale at that edge, as a step index, for the cue drawn there.
export function exitStep(values: number[], edge: number, side: 'top' | 'bottom'): number | null {
  const index = values.findIndex((v) => (side === 'top' ? v > edge : v < edge))
  return index === -1 ? null : index
}
