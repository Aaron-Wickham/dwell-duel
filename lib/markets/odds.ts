export interface OutcomeOdds {
  outcomeId: string
  label: string
  poolTotal: number
  impliedProbability: number | null
}

export function computeOdds(outcomes: { id: string; label: string; pool_total: number }[]): OutcomeOdds[] {
  const totalPool = outcomes.reduce((sum, o) => sum + o.pool_total, 0)
  return outcomes.map((o) => ({
    outcomeId: o.id,
    label: o.label,
    poolTotal: o.pool_total,
    impliedProbability: totalPool > 0 ? o.pool_total / totalPool : null,
  }))
}
