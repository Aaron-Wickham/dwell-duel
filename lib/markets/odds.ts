export interface OutcomeOdds {
  outcomeId: string
  label: string
  poolTotal: number
  impliedProbability: number | null
}

// supabase/migrations/0041: every outcome counts `seed` virtual DC on top of its real stakes, so
// a market has odds before its first bet and one-sided betting never reads 1.00×. Odds, chance
// and payouts all use these effective pools, the same as resolve_market.
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
