// Mirrors lmsr_cost, lmsr_price and lmsr_buy (0101); tests/db/lmsr.test.ts keeps them equal.
// Everything is shifted by m = max(q)/b so exp never overflows.

export const DEFAULT_LIQUIDITY = 50

function check(q: readonly number[], b: number): number {
  if (q.length === 0) throw new RangeError('A market needs at least one outcome')
  if (!(b > 0)) throw new RangeError('Liquidity must be positive')
  return Math.max(...q) / b
}

export function lmsrCost(q: readonly number[], b: number): number {
  const m = check(q, b)
  return b * (m + Math.log(q.reduce((sum, x) => sum + Math.exp(x / b - m), 0)))
}

export function lmsrPrices(q: readonly number[], b: number): number[] {
  const m = check(q, b)
  const weights = q.map((x) => Math.exp(x / b - m))
  const total = weights.reduce((sum, w) => sum + w, 0)
  return weights.map((w) => w / total)
}

export function lmsrBuy(q: readonly number[], b: number, outcome: number, spend: number): number {
  const m = check(q, b)
  if (!Number.isInteger(outcome) || outcome < 0 || outcome >= q.length) throw new RangeError('No such outcome')
  if (!(spend >= 0)) throw new RangeError('Spend must not be negative')
  const total = q.reduce((sum, x) => sum + Math.exp(x / b - m), 0)
  return b * (m + Math.log(total * Math.expm1(spend / b) + Math.exp(q[outcome] / b - m))) - q[outcome]
}
