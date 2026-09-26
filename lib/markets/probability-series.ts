export type ChartBet = { outcomeId: string; amount: number; createdAt: string }
export type SeriesPoint = { t: number; shares: Record<string, number> }
export type RangeKey = '1D' | '1W' | 'All'

const DAY_MS = 24 * 60 * 60 * 1000
export const RANGE_MS: Record<Exclude<RangeKey, 'All'>, number> = { '1D': DAY_MS, '1W': 7 * DAY_MS }

export function buildProbabilitySeries(outcomeIds: string[], bets: ChartBet[]): SeriesPoint[] {
  const pools = new Map(outcomeIds.map((id) => [id, 0]))
  let total = 0
  // Array.prototype.sort is stable, so bets on the same instant keep the reader's id order.
  const ordered = bets
    .map((bet) => ({ bet, t: Date.parse(bet.createdAt) }))
    .sort((a, b) => a.t - b.t)

  const points: SeriesPoint[] = []
  for (const { bet, t } of ordered) {
    const pool = pools.get(bet.outcomeId)
    if (pool === undefined) continue
    pools.set(bet.outcomeId, pool + bet.amount)
    total += bet.amount
    const shares: Record<string, number> = {}
    for (const [id, amount] of pools) shares[id] = amount / total
    points.push({ t, shares })
  }
  return points
}

export function sliceRange(points: SeriesPoint[], range: RangeKey, now: number): SeriesPoint[] {
  if (range === 'All') return points
  const start = now - RANGE_MS[range]
  const inside = points.filter((p) => p.t >= start && p.t <= now)
  const before = points.filter((p) => p.t < start).at(-1)
  if (!before || inside[0]?.t === start) return inside
  return [{ t: start, shares: before.shares }, ...inside]
}

export function availableRanges(points: SeriesPoint[], now: number): RangeKey[] {
  if (points.length === 0) return []
  const within = (ms: number) => points.some((p) => p.t >= now - ms && p.t <= now)
  const ranges: RangeKey[] = []
  if (within(RANGE_MS['1D'])) ranges.push('1D')
  if (within(RANGE_MS['1W']) && points.some((p) => p.t < now - RANGE_MS['1D'])) ranges.push('1W')
  ranges.push('All')
  return ranges
}
