export type ChartBet = { outcomeId: string; amount: number; createdAt: string }
export type SeriesPoint = { t: number; shares: Record<string, number> }
export type RangeKey = '1D' | '1W' | 'All'

const DAY_MS = 24 * 60 * 60 * 1000
export const RANGE_MS: Record<Exclude<RangeKey, 'All'>, number> = { '1D': DAY_MS, '1W': 7 * DAY_MS }

// The reference for market_sparklines, which charts and sparklines read (the DB tests hold the two
// equal). Pools start at the market's seed (0041), so a seeded market's line starts at an even
// split at `startAt`, when it opened, rather than jumping to 100% on its first bet.
export function buildProbabilitySeries(
  outcomeIds: string[],
  bets: ChartBet[],
  { seed = 0, startAt }: { seed?: number; startAt?: string } = {},
): SeriesPoint[] {
  const pools = new Map(outcomeIds.map((id) => [id, seed]))
  let total = seed * outcomeIds.length
  // Array.prototype.sort is stable, so bets on the same instant keep the reader's id order.
  const ordered = bets
    .map((bet) => ({ bet, t: Date.parse(bet.createdAt) }))
    .sort((a, b) => a.t - b.t)

  const points: SeriesPoint[] = []
  if (total > 0 && startAt) {
    const shares: Record<string, number> = {}
    for (const [id, amount] of pools) shares[id] = amount / total
    points.push({ t: Date.parse(startAt), shares })
  }
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

export type SeededMarket = { seedPerOutcome: number; createdAt: string; outcomeIds: string[] }

// market_sparklines returns points only at bets, so the market page's chart and the cards'
// sparklines both prepend the seeded even split at the market's opening (0041) here, and agree.
export function withSeededStart(points: SeriesPoint[], market: SeededMarket): SeriesPoint[] {
  if (market.seedPerOutcome <= 0 || market.outcomeIds.length === 0) return points
  const even = 1 / market.outcomeIds.length
  const start = { t: Date.parse(market.createdAt), shares: Object.fromEntries(market.outcomeIds.map((id) => [id, even])) }
  return [start, ...points]
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
  const olderThanADay = points.some((p) => p.t < now - RANGE_MS['1D'])
  const ranges: RangeKey[] = []
  // Mirrors the 1W rule below: offering a range needs a point inside it AND one older, or a
  // young market's only range would reintroduce the crushed-against-the-edge chart (finding C1).
  if (within(RANGE_MS['1D']) && olderThanADay) ranges.push('1D')
  if (within(RANGE_MS['1W']) && olderThanADay) ranges.push('1W')
  ranges.push('All')
  return ranges
}
