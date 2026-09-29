import { RANGE_MS, sliceRange, type RangeKey, type SeriesPoint } from '@/lib/markets/probability-series'

// Only guards a zero or negative span (a bet stamped at, or a clock tick after, `now`). A young
// market's chart starts at its first bet, however recent.
const MIN_SPAN_MS = 1000
// The mockup gives a closed market's shaded zone 14% of the plot, however long ago it closed.
const ZONE_SHARE = 0.14

// Nothing moves after the close, so a closed market opens on its whole history.
export function initialRange(ranges: RangeKey[], closed: boolean): RangeKey {
  return !closed && ranges.includes('1W') ? '1W' : 'All'
}

export type ChartWindow = {
  visible: SeriesPoint[]
  // The plot's x domain.
  start: number
  end: number
  // Where the lines stop: the close, or now while the market is open.
  lineEnd: number
}

// The full chart and the card sparkline both plot this window, so a card's line matches the
// market page's at the same range.
export function chartWindow(
  points: SeriesPoint[],
  range: RangeKey,
  now: number,
  closedMs: number | null,
): ChartWindow | null {
  const last = points.at(-1)
  if (!last) return null
  const closed = closedMs !== null && closedMs <= now
  const visible = sliceRange(points, range, now)
  const lastVisibleT = visible.at(-1)?.t ?? last.t
  const lineEnd = Math.max(closed ? closedMs : now, lastVisibleT)
  let start = range === 'All' ? (visible[0]?.t ?? last.t) : now - RANGE_MS[range]
  let end = now
  if (range === 'All' && closed) end = Math.min(now, lineEnd + ((lineEnd - start) * ZONE_SHARE) / (1 - ZONE_SHARE))
  if (end - start < MIN_SPAN_MS) start = end - MIN_SPAN_MS
  return { visible, start, end, lineEnd }
}

export function xPercent(plot: Pick<ChartWindow, 'start' | 'end'>, t: number): number {
  return Math.min(100, Math.max(0, ((t - plot.start) / (plot.end - plot.start)) * 100))
}
