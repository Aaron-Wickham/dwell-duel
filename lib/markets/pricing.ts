import { lmsrBuy, lmsrPrices } from './lmsr'
import { computeOdds, type OutcomeOdds } from './odds'

// markets.pricing (0101): 'pool' for a market made before #333, 'lmsr' since (create_market_v3, 0102).
export type Pricing = 'pool' | 'lmsr'

export interface PricedOutcome {
  id: string
  label: string
  poolTotal: number
  // What bets hold, and the offset a converted market's maker prices on top (0101).
  shares: number
  qOffset: number
}

export interface PricedMarket {
  pricing: Pricing
  liquidity: number
  seedPerOutcome: number
  outcomes: PricedOutcome[]
}

// The market maker's q: shares + q_offset, as place_lmsr_bet reads it.
export function lmsrState(outcomes: Pick<PricedOutcome, 'shares' | 'qOffset'>[]): number[] {
  return outcomes.map((o) => o.shares + o.qOffset)
}

// Each outcome's chance: the LMSR price on an lmsr market, the seeded pools (effectivePools) on a pool one.
export function marketOdds(market: PricedMarket): OutcomeOdds[] {
  if (market.pricing === 'lmsr' && market.outcomes.length > 0) {
    const prices = lmsrPrices(lmsrState(market.outcomes), market.liquidity)
    return market.outcomes.map((o, i) => ({
      outcomeId: o.id,
      label: o.label,
      poolTotal: o.poolTotal,
      impliedProbability: prices[i],
    }))
  }
  return computeOdds(
    market.outcomes.map((o) => ({ id: o.id, label: o.label, pool_total: o.poolTotal })),
    market.seedPerOutcome,
  )
}

// A share's price is what a DC on it pays at the margin, so this is the outcome's "× per DC" before
// the bet itself moves it, in the same 1/10,000ths as legOddsBp. Rounded down, so it never promises
// more than a bet gets.
export function lmsrOddsBp(price: number | null): number | null {
  return price && price > 0 ? Math.floor(10_000 / price) : null
}

// What place_lmsr_bet (0102) stores and pays for a stake right now: shares to six places, rounded
// down, and a payout of one DC a share, rounded down.
export function lmsrQuote(q: readonly number[], liquidity: number, outcome: number, stake: number): { shares: number; payout: number } {
  const shares = Math.floor(lmsrBuy(q, liquidity, outcome, stake) * 1e6) / 1e6
  return { shares, payout: Math.floor(shares) }
}
