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

// Written as x + b*ln(1 + R*c), not b*(m + ln(...)) - q_i: that difference cancels when buying the
// heavy favourite and can land a hair under the spend, but this form is >= x by construction.
export function lmsrBuy(q: readonly number[], b: number, outcome: number, spend: number): number {
  check(q, b)
  if (!Number.isInteger(outcome) || outcome < 0 || outcome >= q.length) throw new RangeError('No such outcome')
  if (!(spend >= 0)) throw new RangeError('Spend must not be negative')
  if (spend === 0 || q.length === 1) return spend
  const gaps = q.filter((_, j) => j !== outcome).map((x) => (x - q[outcome]) / b)
  const top = Math.max(...gaps)
  const logR = top + Math.log(gaps.reduce((sum, g) => sum + Math.exp(g - top), 0))
  const z = logR + Math.log(-Math.expm1(-spend / b))
  return spend + b * (Math.max(z, 0) + Math.log1p(Math.exp(-Math.abs(z))))
}
