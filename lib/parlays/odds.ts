import { poolPayout } from '@/lib/markets/odds'

// supabase/migrations/0074's parlay_limits(); tests/db/seeded-odds.test.ts keeps them equal.
export const MAX_PICKS = 10
export const MAX_MULTIPLIER = 20
// The most a parlay pays, and so the most it can stake.
export const MAX_PAYOUT = 1000
// A leg needs this much of other members' DC on its market, from this many other members.
export const MIN_LEG_POOL = 50
export const MIN_LEG_BETTORS = 2
// The most one leg counts for.
export const MAX_LEG_ODDS = 5

// A leg's odds are trunc(others' total / others' DC on the pick, 4), set when its market closes
// (pick_quote, 0074). Working in those same 1/10,000ths with integer math makes every displayed
// multiplier and payout match what settle_parlay pays; floating-point odds drift by a DC at
// whole-number products.
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

// `maxMultiplier` is the parlay's own cap: one settled before 0074 keeps the 100x it was paid under.
export function combineOdds(legBps: number[], maxMultiplier = MAX_MULTIPLIER): { multiplierBp: number; capped: boolean } {
  const { numerator, denominator } = product(legBps)
  if (numerator > BigInt(maxMultiplier) * denominator) {
    return { multiplierBp: maxMultiplier * Number(SCALE), capped: true }
  }
  return { multiplierBp: Number((numerator * SCALE) / denominator), capped: false }
}

// What settle_parlay pays on a win: stake x the capped multiplier, rounded down, and at most
// MAX_PAYOUT (or the stake, for a parlay staked above that before the cap).
export function potentialPayout(stake: number, legBps: number[], maxMultiplier = MAX_MULTIPLIER): number {
  const { numerator, denominator } = product(legBps)
  const payout = (BigInt(stake) * numerator) / denominator
  const cap = BigInt(stake) * BigInt(maxMultiplier)
  const capped = payout < cap ? payout : cap
  return Math.min(Number(capped), Math.max(MAX_PAYOUT, stake))
}

// Truncates rather than rounds, so a display never promises more than will be paid.
export function formatOdds(bp: number): string {
  return (Math.trunc(bp / 100) / 100).toFixed(2)
}

// What a solo stake would pay if its outcome won right now, counting the stake itself in both real
// pools, as resolve_market_core will (poolPayout). Later bets move it.
export function soloPayout(stake: number, outcomePool: number, totalPool: number): number {
  return poolPayout(stake, outcomePool + stake, totalPool + stake)
}
