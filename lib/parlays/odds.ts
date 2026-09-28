// supabase/migrations/0041's parlay_limits(); tests/db/parlay-limits.test.ts keeps them equal.
export const MAX_PICKS = 10
export const MAX_MULTIPLIER = 100

// place_parlay locks each leg as trunc(total / pool, 4). Working in those same
// 1/10,000ths with integer math makes every displayed multiplier and payout match
// what settle_parlay pays; floating-point odds drift by a DC at whole-number products.
const SCALE = BigInt(10_000)

export function legOddsBp(totalPool: number, outcomePool: number): number | null {
  if (outcomePool <= 0) return null
  return Number((BigInt(totalPool) * SCALE) / BigInt(outcomePool))
}

export function lockedOddsToBp(lockedOdds: number | string): number {
  return Math.round(Number(lockedOdds) * Number(SCALE))
}

function product(legBps: number[]): { numerator: bigint; denominator: bigint } {
  let numerator = BigInt(1)
  let denominator = BigInt(1)
  for (const bp of legBps) {
    numerator *= BigInt(bp)
    denominator *= SCALE
  }
  return { numerator, denominator }
}

export function combineOdds(legBps: number[]): { multiplierBp: number; capped: boolean } {
  const { numerator, denominator } = product(legBps)
  if (numerator > BigInt(MAX_MULTIPLIER) * denominator) {
    return { multiplierBp: MAX_MULTIPLIER * Number(SCALE), capped: true }
  }
  return { multiplierBp: Number((numerator * SCALE) / denominator), capped: false }
}

export function potentialPayout(stake: number, legBps: number[]): number {
  const { numerator, denominator } = product(legBps)
  const payout = (BigInt(stake) * numerator) / denominator
  const cap = BigInt(stake) * BigInt(MAX_MULTIPLIER)
  return Number(payout < cap ? payout : cap)
}

// Truncates rather than rounds, so a display never promises more than will be paid.
export function formatOdds(bp: number): string {
  return (Math.trunc(bp / 100) / 100).toFixed(2)
}

// What a solo stake would pay if its outcome won right now, counting the stake itself in both
// pools, as resolve_market will: floor(stake × total / winning pool). Pass effective (seeded)
// pools. Later bets move it.
export function soloPayout(stake: number, outcomePool: number, totalPool: number): number {
  return Math.floor((stake * (totalPool + stake)) / (outcomePool + stake))
}
