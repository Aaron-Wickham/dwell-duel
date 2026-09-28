import { describe, it, expect, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { serviceClient } from './helpers'
import { seedMembers, clientFor, createTestMarket, ensureInvited, type Member } from './fixtures'
import { getMarket } from '@/lib/markets/get-market'

let alice: Member
let bob: Member
let aliceClient: SupabaseClient
let bobClient: SupabaseClient

beforeEach(async () => {
  ;[alice, bob] = await seedMembers()
  aliceClient = await clientFor(alice)
  bobClient = await clientFor(bob)
  await ensureInvited(bobClient)
})

describe('getMarket', () => {
  it("names the market's creator, and has no resolution time while open", async () => {
    const { marketId } = await createTestMarket(aliceClient, ['Yes', 'No'])

    const market = await getMarket(bobClient, marketId)
    expect(market?.createdBy).toBe(alice.id)
    expect(market?.creatorName).toBe('Alice')
    expect(market?.resolvedAt).toBeNull()
  })

  it('dates the current resolution', async () => {
    const { marketId, outcomeIds } = await createTestMarket(aliceClient, ['Yes', 'No'], { closeInMs: 1000 })
    await serviceClient()
      .from('markets')
      .update({ close_at: new Date(Date.now() - 1000).toISOString() })
      .eq('id', marketId)
    const { error } = await aliceClient.rpc('resolve_market', { p_note: 'Resolved in a test', p_market_id: marketId, p_outcome_id: outcomeIds[0] })
    if (error) throw error

    const { data: resolution, error: resolutionErr } = await serviceClient()
      .from('market_resolutions')
      .select('resolved_at')
      .eq('market_id', marketId)
      .single()
    if (resolutionErr) throw resolutionErr

    const market = await getMarket(bobClient, marketId)
    expect(market?.resolvedOutcomeLabel).toBe('Yes')
    expect(market?.resolvedAt).toBe(resolution.resolved_at)
  })

  it('orders outcomes by label when they tie on creation time, regardless of input order', async () => {
    const { marketId } = await createTestMarket(aliceClient, ['Zebra', 'Apple', 'Mango'])

    const market = await getMarket(bobClient, marketId)

    expect(market?.outcomes.map((o) => o.label)).toEqual(['Apple', 'Mango', 'Zebra'])
  })

  it('orders outcomes by creation time before label, even when that disagrees with alphabetical order', async () => {
    const { marketId, outcomeIds } = await createTestMarket(aliceClient, ['Alpha', 'Beta'])
    // create_market() inserts every outcome in one transaction, so they normally tie on
    // created_at. Backdating one simulates the untied case and proves created_at wins.
    await serviceClient()
      .from('market_outcomes')
      .update({ created_at: new Date(Date.now() - 60_000).toISOString() })
      .eq('id', outcomeIds[1])

    const market = await getMarket(bobClient, marketId)

    expect(market?.outcomes.map((o) => o.label)).toEqual(['Beta', 'Alpha'])
  })
})
