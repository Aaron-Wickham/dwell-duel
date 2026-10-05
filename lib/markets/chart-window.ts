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

// About one point per this many pixels of plot width (at most width ÷ 4, #391): closer steps than
// that draw a comb.
export const PX_PER_POINT = 4

// Thins a series to at most `buckets` points by time, not by count, so a burst of bets draws as
// one step instead of a comb. Each bucket keeps its last point, the chance it ended on; the first
// point always stays, so the line still starts at the window's left edge.
export function bucketByTime(points: SeriesPoint[], start: number, end: number, buckets: number): SeriesPoint[] {
  if (points.length <= 2 || !(buckets >= 1) || !(end > start)) return points
  const width = (end - start) / Math.floor(buckets)
  const [first, ...rest] = points
  const out: SeriesPoint[] = [first]
  let lastBucket: number | null = null
  for (const point of rest) {
    const bucket = Math.floor((point.t - start) / width)
    if (bucket === lastBucket && out.length > 1) out[out.length - 1] = point
    else out.push(point)
    lastBucket = bucket
  }
  return out
}

// The full chart and the card sparkline both plot this window, so a card's line matches the
// market page's at the same range. With `buckets`, the visible points are thinned by time to fit.
export function chartWindow(
  points: SeriesPoint[],
  range: RangeKey,
  now: number,
  closedMs: number | null,
  buckets?: number,
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
  return { visible: buckets === undefined ? visible : bucketByTime(visible, start, lineEnd, buckets), start, end, lineEnd }
}

export function xPercent(plot: Pick<ChartWindow, 'start' | 'end'>, t: number): number {
  return Math.min(100, Math.max(0, ((t - plot.start) / (plot.end - plot.start)) * 100))
}
