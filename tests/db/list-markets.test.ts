import { describe, it, expect, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { serviceClient } from './helpers'
import { seedMembers, clientFor, createTestMarket, ensureInvited, type Member } from './fixtures'
import { listMarkets } from '@/lib/markets/list-markets'

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

describe('listMarkets', () => {
  it('has no resolution time for an open market', async () => {
    const { marketId } = await createTestMarket(aliceClient, ['Yes', 'No'])
    const markets = await listMarkets(bobClient)
    expect(markets.find((m) => m.id === marketId)?.resolvedAt).toBeNull()
  })

  it('dates the current resolution', async () => {
    const { marketId, outcomeIds } = await createTestMarket(aliceClient, ['Yes', 'No'], { closeInMs: 1000 })
    await serviceClient()
      .from('markets')
      .update({ close_at: new Date(Date.now() - 1000).toISOString() })
      .eq('id', marketId)
    const { error } = await aliceClient.rpc('resolve_market', { p_market_id: marketId, p_outcome_id: outcomeIds[0] })
    if (error) throw error

    const { data: resolution, error: resolutionErr } = await serviceClient()
      .from('market_resolutions')
      .select('resolved_at')
      .eq('market_id', marketId)
      .single()
    if (resolutionErr) throw resolutionErr

    const markets = await listMarkets(bobClient)
    const market = markets.find((m) => m.id === marketId)
    expect(market?.resolvedOutcomeLabel).toBe('Yes')
    expect(market?.resolvedAt).toBe(resolution.resolved_at)
  })
})
