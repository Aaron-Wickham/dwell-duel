import { describe, it, expect, beforeEach } from 'vitest'
import { serviceClient, type TestClient } from './helpers'
import { expectError } from './assertions'
import { seedMembers, clientFor, ensureInvited, createTestMarket, type Member } from './fixtures'
import { getMarket } from '@/lib/markets/get-market'
import { listOpenMarkets } from '@/lib/markets/list-markets'

// 0110 (#409): outcomes keep the order the creator typed them in.
let alice: Member
let aliceClient: TestClient
let bobClient: TestClient

beforeEach(async () => {
  let bob: Member
  ;[alice, bob] = await seedMembers()
  aliceClient = await clientFor(alice)
  bobClient = await clientFor(bob)
  for (const c of [aliceClient, bobClient]) await ensureInvited(c)
})

const inAnHour = () => new Date(Date.now() + 3_600_000).toISOString()

async function createV4(kind: 'binary' | 'multiple_choice' | 'over_under', labels: string[], line?: number): Promise<string> {
  const { data, error } = await aliceClient.rpc('create_market_v4', {
    p_title: 'Who reads first?',
    p_description: null,
    p_kind: kind,
    p_outcome_labels: labels,
    p_close_at: inAnHour(),
    p_category: 'Church',
    p_line: line,
  })
  if (error) throw error
  return (data as { market_id: string }).market_id
}

async function positions(marketId: string): Promise<[string, number][]> {
  const { data, error } = await serviceClient().from('market_outcomes').select('label, position').eq('market_id', marketId).order('position')
  if (error) throw error
  return data.map((o) => [o.label, o.position])
}

describe('market_outcomes.position', () => {
  it('is the order create_market_v4 was given, not the alphabet', async () => {
    const id = await createV4('multiple_choice', ['Ruth', 'Eli', 'Abe'])
    expect(await positions(id)).toEqual([
      ['Ruth', 0],
      ['Eli', 1],
      ['Abe', 2],
    ])
  })

  it('puts Over before Under, and Yes before No as the form sends them', async () => {
    expect(await positions(await createV4('over_under', [], 2.5))).toEqual([
      ['Over 2.5', 0],
      ['Under 2.5', 1],
    ])
    expect(await positions(await createV4('binary', ['Yes', 'No']))).toEqual([
      ['Yes', 0],
      ['No', 1],
    ])
  })

  it('numbers an outcome inserted without one after its market’s others', async () => {
    const market = await createTestMarket(aliceClient, ['Zed', 'Amy', 'Moe'])
    expect((await positions(market.marketId)).map(([, p]) => p)).toEqual([0, 1, 2])
    expect((await positions(market.marketId)).map(([label]) => label)).toEqual(['Zed', 'Amy', 'Moe'])
  })

  it('is unique within a market', async () => {
    const market = await createTestMarket(aliceClient, ['Yes', 'No'])
    const { error } = await serviceClient().from('market_outcomes').insert({ market_id: market.marketId, label: 'Maybe', position: 0 })
    expectError(error, { code: '23505', message: 'market_outcomes_market_id_position_key' })
  })

  it('orders the market page and the cards', async () => {
    const id = await createV4('multiple_choice', ['Ruth', 'Eli', 'Abe'])
    expect((await getMarket(bobClient, id))!.outcomes.map((o) => o.label)).toEqual(['Ruth', 'Eli', 'Abe'])
    const listed = (await listOpenMarkets(bobClient, { top: null, bottom: null })).rows.find((m) => m.id === id)!
    expect(listed.outcomes.map((o) => o.label)).toEqual(['Ruth', 'Eli', 'Abe'])
  })
})
