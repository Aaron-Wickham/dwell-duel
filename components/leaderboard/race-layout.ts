import { spreadLabels } from '@/components/markets/probability-chart'

// Past this multiple of everyone else's range, the top line is a runaway and the scale stops for
// the rest instead of for it.
const RUNAWAY = 2.5
// Room above the second-highest peak once the top is clipped, so it isn't pressed against the edge.
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
  clipped: number | null
  // Each series' end-label centre in px from the top, or null when it didn't fit and is left to the readout.
  labelTops: (number | null)[]
}

// The race's y scale and end labels, from each series' running totals (best final first).
// Zero is always in range. A runaway leader is clipped: the scale is set by everyone else, the
// leader's line runs off the top, and its label sits at the top edge with its true total.
export function raceLayout(values: number[][], { height, pad, gap }: RaceLayoutOptions): RaceLayout {
  const all = values.flat()
  const low = Math.min(0, ...all)
  const peaks = values.map((v) => Math.max(0, ...v))
  const top = peaks.reduce((best, p, i) => (p > peaks[best] ? i : best), 0)
  const first = peaks[top] ?? 0
  const second = Math.max(0, ...peaks.filter((_, i) => i !== top))

  let high = Math.max(0, first)
  let clipped: number | null = null
  const rest = second - low
  if (values.length > 1 && rest > 0 && first - low >= RUNAWAY * rest) {
    high = low + Math.max(rest, (first - low) * MIN_SHARE) * HEADROOM
    clipped = top
  }
  if (high === low) high = low + 1

  const yOf = (v: number) => pad + ((high - v) / (high - low)) * (height - pad * 2)
  const finals = values.map((v) => v.at(-1) ?? 0)
  // A total above the scale is labelled at the top edge.
  const targets = finals.map((f) => (f > high ? 0 : yOf(f)))

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

  return { low, high, clipped, labelTops }
}

// Where the clipped line first leaves the top, as a step index, for the cue drawn there.
export function exitStep(values: number[], high: number): number | null {
  const index = values.findIndex((v) => v > high)
  return index === -1 ? null : index
}
