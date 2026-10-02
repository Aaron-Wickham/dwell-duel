import { describe, it, expect } from 'vitest'
import { serviceClient } from './helpers'
import { seedMembers, clientFor, createTestMarket } from './fixtures'
import { pgQuery } from './pg-query'
import { expectError } from './assertions'
import { lmsrBuy, lmsrCost, lmsrPrices } from '@/lib/markets/lmsr'

const arr = (q: number[]) => `array[${q.join(',')}]::numeric[]`

const cases: { q: number[]; b: number; outcome: number; spend: number }[] = [
  { q: [0, 0], b: 50, outcome: 0, spend: 10 },
  { q: [0, 0], b: 100, outcome: 0, spend: 20 },
  { q: [36.6574, 0], b: 100, outcome: 1, spend: 20 },
  { q: [0, 0, 0, 0], b: 50, outcome: 3, spend: 7 },
  { q: [12.5, 3, 40], b: 50, outcome: 1, spend: 25 },
  { q: [5000, 0], b: 50, outcome: 1, spend: 1 },
  { q: [3, 9], b: 50, outcome: 0, spend: 0 },
  { q: [3000, 0], b: 50, outcome: 0, spend: 3 },
]

describe('lmsr functions', () => {
  it('price, cost and buy in SQL exactly as lib/markets/lmsr.ts does', async () => {
    const sql = cases
      .map(({ q, b, outcome, spend }, i) =>
        `select ${i} as i, public.lmsr_cost(${arr(q)}, ${b}) as cost, public.lmsr_price(${arr(q)}, ${b}, ${outcome + 1}) as price, public.lmsr_buy(${arr(q)}, ${b}, ${outcome + 1}, ${spend}) as shares`)
      .join(' union all ')
    const rows = await pgQuery<{ i: number; cost: string; price: string; shares: string }>(`${sql} order by 1`)
    expect(rows).toHaveLength(cases.length)
    rows.forEach((row, i) => {
      const { q, b, outcome, spend } = cases[i]
      expect(Number(row.cost), `cost ${i}`).toBeCloseTo(lmsrCost(q, b), 9)
      expect(Number(row.price), `price ${i}`).toBeCloseTo(lmsrPrices(q, b)[outcome], 9)
      expect(Number(row.shares), `shares ${i}`).toBeCloseTo(lmsrBuy(q, b, outcome, spend), 9)
    })
  })

  it('never returns fewer shares than DC spent when buying the heavy favourite', async () => {
    const [row] = await pgQuery<{ ok: boolean }>('select public.lmsr_buy(array[3000,0]::numeric[], 50, 1, 3) >= 3 as ok')
    expect(row.ok).toBe(true)
  })

  it('refuses input that has no price', async () => {
    const svc = serviceClient()
    expectError((await svc.rpc('lmsr_buy', { p_q: [0, 0], p_b: 0, p_outcome: 1, p_spend: 1 })).error, 'liquidity must be positive')
    expectError((await svc.rpc('lmsr_buy', { p_q: [0, 0], p_b: 50, p_outcome: 3, p_spend: 1 })).error, 'no such outcome')
    expectError((await svc.rpc('lmsr_buy', { p_q: [0, 0], p_b: 50, p_outcome: 1, p_spend: -1 })).error, 'spend must not be negative')
    expectError((await svc.rpc('lmsr_price', { p_q: [], p_b: 50, p_outcome: 1 })).error, 'a market needs at least one outcome')
  })
})

describe('lmsr columns', () => {
  it('leave every market and outcome as it was: pool pricing, b = 50, no shares', async () => {
    const [alice] = await seedMembers()
    const m = await createTestMarket(await clientFor(alice), ['Yes', 'No'])
    const [market] = await pgQuery<{ pricing: string; liquidity: string }>(
      `select pricing, liquidity from public.markets where id = '${m.marketId}'`,
    )
    expect(market).toEqual({ pricing: 'pool', liquidity: '50' })
    const outcomes = await pgQuery<{ shares: string; q_offset: string }>(
      `select shares, q_offset from public.market_outcomes where market_id = '${m.marketId}'`,
    )
    expect(outcomes).toEqual([{ shares: '0', q_offset: '0' }, { shares: '0', q_offset: '0' }])
  })
})
