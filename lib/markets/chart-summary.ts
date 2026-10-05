import type { ChartWindow } from '@/lib/markets/chart-window'
import { RANGE_MS, type RangeKey, type SeriesPoint } from '@/lib/markets/probability-series'

const RANGE_WORDS: Record<RangeKey, string> = { '1D': 'in the last day', '1W': 'this week', All: 'since it opened' }

function percent(share: number | undefined): number {
  return Math.round((share ?? 0) * 100)
}

// A chart's text alternative: how each line it draws moved across the visible range, "Yes rose
// from 46% to 61% this week".
export function describeMovement(outcomes: { id: string; label: string }[], plot: ChartWindow, range: RangeKey): string {
  const first = plot.visible[0]
  const last = plot.visible.at(-1)
  if (!first || !last) return ''
  const words = RANGE_WORDS[range]
  const lines = outcomes.map(({ id, label }) => {
    const from = percent(first.shares[id])
    const to = percent(last.shares[id])
    if (from === to) return `${label} held at ${to}% ${words}`
    return `${label} ${to > from ? 'rose' : 'fell'} from ${from}% to ${to}% ${words}`
  })
  return `${lines.join('; ')}.`
}

// How many points an outcome's chance moved over the last week, from its chance a week ago in
// the series to `nowPct`; null when the series doesn't reach back a week.
export function weeklyChange(points: SeriesPoint[], outcomeId: string, nowPct: number, now: number): number | null {
  const weekAgo = now - RANGE_MS['1W']
  const then = points.filter((p) => p.t <= weekAgo).at(-1)
  if (!then) return null
  return nowPct - percent(then.shares[outcomeId])
}
