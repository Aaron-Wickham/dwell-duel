export interface OutcomeOdds {
  outcomeId: string
  label: string
  poolTotal: number
  impliedProbability: number | null
}

// supabase/migrations/0041: every outcome counts `seed` virtual DC on top of its real stakes, so
// a thin market shows a sensible chance before its first bet. Display only: chance, charts and
// sparklines use these effective pools (as market_sparklines does), but payouts don't (poolPayout).
export function effectivePools(poolTotal: number, marketTotal: number, seed: number, outcomeCount: number) {
  return { pool: poolTotal + seed, total: marketTotal + seed * outcomeCount }
}

export function computeOdds(outcomes: { id: string; label: string; pool_total: number }[], seed = 0): OutcomeOdds[] {
  const realTotal = outcomes.reduce((sum, o) => sum + o.pool_total, 0)
  return outcomes.map((o) => {
    const { pool, total } = effectivePools(o.pool_total, realTotal, seed, outcomes.length)
    return {
      outcomeId: o.id,
      label: o.label,
      poolTotal: o.pool_total,
      impliedProbability: total > 0 ? pool / total : null,
    }
  })
}

// What resolve_market_core pays a winner (0074): their share of the real pool, rounded down. The
// seed is never paid. `seed` and `outcomeCount` only reproduce a resolution from before 0074, which
// counted its market's seed (market_resolutions.payout_seed). SQL twin: pool_payout(), kept equal by
// tests/db/seeded-odds.test.ts.
export function poolPayout(stake: number, winningPool: number, totalPool: number, seed = 0, outcomeCount = 0): number {
  return Math.floor((stake * (totalPool + seed * outcomeCount)) / (winningPool + seed))
}
