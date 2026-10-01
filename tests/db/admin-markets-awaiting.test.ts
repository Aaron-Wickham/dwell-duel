import { describe, it, expect, beforeEach } from 'vitest'
import { serviceClient, type TestClient } from './helpers'
import { seedMembers, makeMember, clientFor, createTestMarket, ensureInvited, giveRole, type Member } from './fixtures'
import { listAwaitingMarkets } from '@/lib/admin/markets-awaiting'
import { getReviewCounts } from '@/lib/admin/review-counts'

const HOUR = 3_600_000
const FIRST_PAGE = { top: null, bottom: null }

let alice: Member
let aliceClient: TestClient
let bobClient: TestClient
let adminClient: TestClient

beforeEach(async () => {
  const [a, bob] = await seedMembers()
  alice = a
  const admin = await makeMember('Ada')
  await giveRole(admin, 'admin')
  aliceClient = await clientFor(alice)
  bobClient = await clientFor(bob)
  adminClient = await clientFor(admin)
  for (const c of [aliceClient, bobClient, adminClient]) await ensureInvited(c)
})

async function market(title: string, closedMsAgo: number | null, stake = 0) {
  const m = await createTestMarket(aliceClient, ['Yes', 'No'], { title })
  if (stake > 0) {
    const { error } = await bobClient.rpc('place_bet', { p_market_id: m.marketId, p_outcome_id: m.outcomeIds[0], p_amount: stake })
    if (error) throw error
  }
  if (closedMsAgo !== null) {
    const { error } = await serviceClient()
      .from('markets')
      .update({ close_at: new Date(Date.now() - closedMsAgo).toISOString() })
      .eq('id', m.marketId)
    if (error) throw error
  }
  return m
}

describe('listAwaitingMarkets (#243)', () => {
  it('lists the markets the Admin badge counts, oldest close first, with creator and pool', async () => {
    await market('Still open', null)
    await market('Closed an hour ago', HOUR, 7)
    await market('Closed a week ago', 7 * 24 * HOUR)
    const voided = await market('Voided', 2 * HOUR)
    const { error } = await serviceClient().from('markets').update({ status: 'voided' }).eq('id', voided.marketId)
    if (error) throw error

    const page = await listAwaitingMarkets(adminClient, FIRST_PAGE, new Date().toISOString())
    expect(page.rows.map((m) => m.title)).toEqual(['Closed a week ago', 'Closed an hour ago'])
    expect(page.rows[1]).toMatchObject({ creatorId: alice.id, creatorName: alice.displayName, pooled: 7 })
    expect(page.next).toBeNull()

    const counts = await getReviewCounts(adminClient, 'admin')
    expect(counts.markets).toBe(page.rows.length)
  })
})
