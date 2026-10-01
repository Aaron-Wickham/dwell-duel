import { describe, it, expect, beforeEach } from 'vitest'
import { serviceClient, type TestClient } from './helpers'
import { expectError } from './assertions'
import { seedMembers, makeMember, clientFor, createTestMarket, ensureInvited, giveRole, type Member } from './fixtures'
import { listFeed } from '@/lib/social/list-feed'

let alice: Member
let bob: Member

const REASON = 'Voided in a test'

beforeEach(async () => {
  ;[alice, bob] = await seedMembers()
})

async function closeNow(marketId: string) {
  const { error } = await serviceClient()
    .from('markets')
    .update({ close_at: new Date(Date.now() - 1000).toISOString() })
    .eq('id', marketId)
  if (error) throw error
}

async function balanceOf(m: Member) {
  const { data, error } = await serviceClient().from('profiles').select('balance').eq('id', m.id).single()
  if (error) throw error
  return data.balance
}

async function marketRow(marketId: string) {
  const { data, error } = await serviceClient().from('markets').select('status, settled_at, void_reason').eq('id', marketId).single()
  if (error) throw error
  return data
}

describe('void_market', () => {
  it('refunds every bet on the market', async () => {
    const aliceClient = await clientFor(alice)
    const { marketId, outcomeIds } = await createTestMarket(aliceClient, ['Yes', 'No'])

    const bobClient = await clientFor(bob)
    await aliceClient.rpc('place_bet', { p_market_id: marketId, p_outcome_id: outcomeIds[0], p_amount: 20 })
    await bobClient.rpc('place_bet', { p_market_id: marketId, p_outcome_id: outcomeIds[1], p_amount: 30 })

    const { error } = await aliceClient.rpc('void_market', { p_market_id: marketId, p_reason: REASON })
    expect(error).toBeNull()

    expect(await balanceOf(alice)).toBe(100)
    expect(await balanceOf(bob)).toBe(100)

    const market = await marketRow(marketId)
    expect(market.status).toBe('voided')
    // settled_at (0066) records the void itself, even before the close time.
    expect(Math.abs(Date.parse(market.settled_at!) - Date.now())).toBeLessThan(15_000)
  })

  it('rejects voiding an already-resolved market', async () => {
    const aliceClient = await clientFor(alice)
    const { marketId, outcomeIds } = await createTestMarket(aliceClient, ['Yes', 'No'], { closeInMs: 1000 })

    await closeNow(marketId)
    await aliceClient.rpc('resolve_market', { p_note: 'Resolved in a test', p_market_id: marketId, p_outcome_id: outcomeIds[0] })

    const { error } = await aliceClient.rpc('void_market', { p_market_id: marketId, p_reason: REASON })
    expectError(error, 'only an unresolved, unvoided market can be voided')
  })

  it('rejects a non-creator, non-admin caller', async () => {
    const aliceClient = await clientFor(alice)
    const { marketId } = await createTestMarket(aliceClient, ['Yes', 'No'])

    const bobClient = await clientFor(bob)
    const { error } = await bobClient.rpc('void_market', { p_market_id: marketId, p_reason: REASON })
    expect(error?.message).toBe('only the market creator or an admin can void this market')
  })
})

describe('void_market needs a reason (0073)', () => {
  let aliceClient: TestClient
  let marketId: string

  beforeEach(async () => {
    aliceClient = await clientFor(alice)
    ;({ marketId } = await createTestMarket(aliceClient, ['Yes', 'No']))
  })

  it('refuses a missing or blank reason, changing nothing', async () => {
    // The previous build's call shape, p_market_id alone, still reaches the function.
    expect((await aliceClient.rpc('void_market', { p_market_id: marketId })).error?.message).toBe('say why this market is voided')
    expect((await aliceClient.rpc('void_market', { p_market_id: marketId, p_reason: '  \n ' })).error?.message).toBe(
      'say why this market is voided',
    )
    expect(await marketRow(marketId)).toEqual({ status: 'open', settled_at: null, void_reason: null })
  })

  it('stores the reason trimmed, up to 500 characters', async () => {
    const tooLong = await aliceClient.rpc('void_market', { p_market_id: marketId, p_reason: 'r'.repeat(501) })
    expect(tooLong.error?.code).toBe('23514')
    expect(tooLong.error?.message).toContain('markets_void_reason_length')
    expect((await marketRow(marketId)).status).toBe('open')

    // 'é' is two bytes in UTF-8, so accepting it at the limit shows the check counts characters.
    const reason = 'é'.repeat(500)
    expect((await aliceClient.rpc('void_market', { p_market_id: marketId, p_reason: `  ${reason}  ` })).error).toBeNull()
    expect((await marketRow(marketId)).void_reason).toBe(reason)
  })

  it('posts the void, with its reason, to the feed', async () => {
    expect((await aliceClient.rpc('void_market', { p_market_id: marketId, p_reason: 'The sermon was cancelled.' })).error).toBeNull()

    const bobClient = await clientFor(bob)
    await ensureInvited(bobClient)
    const feed = await listFeed(bobClient, { page: { top: null, bottom: null } })
    const voided = feed.rows.find((e) => e.kind === 'market_voided')
    expect(voided).toMatchObject({
      id: `void:${marketId}`,
      actorId: alice.id,
      actorName: 'Alice',
      marketId,
      marketTitle: 'Test market',
      voidReason: 'The sermon was cancelled.',
    })
  })
})

describe('who can void (0073)', () => {
  let admin: Member
  let creatorClient: TestClient
  let adminClient: TestClient
  let bobClient: TestClient

  beforeEach(async () => {
    admin = await makeMember('Ada')
    await giveRole(admin, 'admin')
    adminClient = await clientFor(admin)
    creatorClient = await clientFor(alice)
    bobClient = await clientFor(bob)
    await ensureInvited(bobClient)
  })

  it('lets the creator void before close, with or without a stake', async () => {
    const { marketId, outcomeIds } = await createTestMarket(creatorClient, ['Yes', 'No'])
    expect((await creatorClient.rpc('place_bet', { p_market_id: marketId, p_outcome_id: outcomeIds[0], p_amount: 10 })).error).toBeNull()

    expect((await creatorClient.rpc('void_market', { p_market_id: marketId, p_reason: REASON })).error).toBeNull()
    expect((await marketRow(marketId)).status).toBe('voided')
  })

  it('refuses the creator once the market has closed, stake or no stake, and leaves every bet in place', async () => {
    const staked = await createTestMarket(creatorClient, ['Yes', 'No'], { title: 'Staked' })
    const unstaked = await createTestMarket(creatorClient, ['Yes', 'No'], { title: 'Unstaked' })
    expect((await creatorClient.rpc('place_bet', { p_market_id: staked.marketId, p_outcome_id: staked.outcomeIds[0], p_amount: 20 })).error).toBeNull()
    expect((await bobClient.rpc('place_bet', { p_market_id: staked.marketId, p_outcome_id: staked.outcomeIds[1], p_amount: 30 })).error).toBeNull()
    await closeNow(staked.marketId)
    await closeNow(unstaked.marketId)

    for (const m of [staked, unstaked]) {
      const { error } = await creatorClient.rpc('void_market', { p_market_id: m.marketId, p_reason: REASON })
      expect(error?.message).toBe('this market has closed, so only an admin can void it')
      expect((await marketRow(m.marketId)).status).toBe('open')
    }
    expect(await balanceOf(alice)).toBe(80)
    expect(await balanceOf(bob)).toBe(70)
  })

  it('lets an admin void after close, with a reason, refunding everyone', async () => {
    const { marketId, outcomeIds } = await createTestMarket(creatorClient, ['Yes', 'No'])
    expect((await creatorClient.rpc('place_bet', { p_market_id: marketId, p_outcome_id: outcomeIds[0], p_amount: 20 })).error).toBeNull()
    await closeNow(marketId)

    expect((await adminClient.rpc('void_market', { p_market_id: marketId })).error?.message).toBe('say why this market is voided')
    expect((await adminClient.rpc('void_market', { p_market_id: marketId, p_reason: 'Question was ambiguous.' })).error).toBeNull()
    expect(await marketRow(marketId)).toMatchObject({ status: 'voided', void_reason: 'Question was ambiguous.' })
    expect(await balanceOf(alice)).toBe(100)
  })

  it('refuses a creator whose invite is gone', async () => {
    const { marketId } = await createTestMarket(creatorClient, ['Yes', 'No'])
    const { error: uninviteErr } = await serviceClient().from('allowed_emails').delete().eq('email', alice.email)
    if (uninviteErr) throw uninviteErr

    expect((await creatorClient.rpc('void_market', { p_market_id: marketId, p_reason: REASON })).error?.message).toBe(
      'only the market creator or an admin can void this market',
    )
    expect((await marketRow(marketId)).status).toBe('open')
  })
})
