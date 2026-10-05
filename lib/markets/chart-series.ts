import { unstable_cache } from 'next/cache'
import type { DbClient } from '@/lib/supabase/database'
import { batchKey } from '@/lib/markets/sparklines'
import { IN_CHUNK, chunk } from '@/lib/pagination/chunk'
import { RANGE_MS, withSeededStart, type RangeKey, type SeededMarket, type SeriesPoint } from '@/lib/markets/probability-series'

// Each range of the market page's chart is cut into at most this many slices of time in SQL
// (market_series, 0110), keeping each slice's last move, so a busy market's day still shows its
// intraday moves. The chart then thins to the plot's width.
export const CHART_BUCKETS = 200

// "Since it opened": market_series starts the window at the market's first move.
const ALL_FROM = '-infinity'

export type RangeSeries = Record<RangeKey, SeriesPoint[]>
export type ChartSeries = { series: RangeSeries; betCount: number }

type RawPoint = { t: string; shares: Record<string, number> }

function toPoints(raw: unknown): SeriesPoint[] {
  return ((raw ?? []) as RawPoint[]).map((p) => ({ t: Date.parse(p.t), shares: p.shares }))
}

function rangeFrom(range: RangeKey, now: number): string {
  return range === 'All' ? ALL_FROM : new Date(now - RANGE_MS[range]).toISOString()
}

const RANGES: RangeKey[] = ['1D', '1W', 'All']

export async function getChartSeries(
  supabase: DbClient,
  market: { id: string } & SeededMarket,
  now: number,
): Promise<ChartSeries> {
  const froms = RANGES.map((range) => rangeFrom(range, now))
  const [bucketed, counted] = await Promise.all([
    supabase.rpc('market_series', { p_market_ids: [market.id], p_froms: froms, p_buckets: CHART_BUCKETS }),
    supabase.from('bets').select('id', { count: 'exact', head: true }).eq('market_id', market.id),
  ])
  if (bucketed.error) throw bucketed.error
  if (counted.error) throw counted.error

  // from_at comes back as Postgres prints it, so each row is matched to its range by instant.
  const rows = bucketed.data ?? []
  const pointsFrom = (from: string) => {
    const at = from === ALL_FROM ? -Infinity : Date.parse(from)
    const row = rows.find((r) => (r.from_at === ALL_FROM ? -Infinity : Date.parse(r.from_at)) === at)
    return withSeededStart(toPoints(row?.points), market)
  }
  const series = Object.fromEntries(RANGES.map((range, i) => [range, pointsFrom(froms[i])])) as RangeSeries
  return { series, betCount: counted.count ?? 0 }
}

// Each market's chance at `at`, after its last move at or before then: the price itself, not a
// sampled point near it. A market with no move by then has no entry; withSeededStart supplies
// its opening split where it has one.
export async function readChancesAt(supabase: DbClient, marketIds: string[], at: number): Promise<Map<string, SeriesPoint>> {
  const from = new Date(at).toISOString()
  const parts = await Promise.all(
    chunk(marketIds, IN_CHUNK).map(async (ids) => {
      const { data, error } = await supabase.rpc('market_series', { p_market_ids: ids, p_froms: [from], p_buckets: 0 })
      if (error) throw error
      return data ?? []
    }),
  )
  const chances = new Map<string, SeriesPoint>()
  for (const row of parts.flat()) {
    // With no move by `at`, the window's first point is the market's first move, after it.
    const point = toPoints(row.points)[0]
    if (point && point.t <= at) chances.set(row.market_id, point)
  }
  return chances
}

const HOUR_MS = 60 * 60 * 1000

// Reading a week ago scans each open market's history, so /markets caches it like the
// sparklines (#409): one entry per list and hour, keyed by its markets and their versions. The
// instant read is the week-ago time rounded down to the hour, so the entry holds for that hour.
async function cachedChancesAt(supabase: DbClient, markets: { id: string; version: string }[], at: number) {
  const ids = markets.map((m) => m.id)
  const read = unstable_cache(
    async (_key: string) => Object.fromEntries(await readChancesAt(supabase, ids, at)),
    ['market-week-ago-v1'],
    { revalidate: 2 * 60 * 60 },
  )
  return new Map(Object.entries(await read(`${batchKey(markets)}:${at}`)))
}

// The cards' weekly change is decoration: if its read fails, null, and the cards render without it.
export async function readWeekAgoChances(
  supabase: DbClient,
  markets: { id: string; version: string }[],
  now: number,
): Promise<Map<string, SeriesPoint> | null> {
  if (markets.length === 0) return new Map()
  const weekAgo = now - RANGE_MS['1W']
  try {
    return await cachedChancesAt(supabase, markets, weekAgo - (weekAgo % HOUR_MS))
  } catch (error) {
    console.error('Week-ago chances failed to load', error)
    return null
  }
}
