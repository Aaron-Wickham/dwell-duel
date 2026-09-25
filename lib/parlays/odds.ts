export const MAX_PICKS = 6
export const MAX_MULTIPLIER = 20

export function legOdds(totalPool: number, outcomePool: number): number | null {
  return outcomePool > 0 ? totalPool / outcomePool : null
}

export function combineOdds(odds: number[]): { multiplier: number; capped: boolean } {
  const product = odds.reduce((acc, o) => acc * o, 1)
  return product > MAX_MULTIPLIER ? { multiplier: MAX_MULTIPLIER, capped: true } : { multiplier: product, capped: false }
}

// Display only: the DB's numeric floor in settle_parlay is what actually pays.
export function potentialPayout(stake: number, multiplier: number): number {
  return Math.floor(stake * multiplier)
}
