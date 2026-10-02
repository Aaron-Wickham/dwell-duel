import { describe, it, expect, beforeEach } from 'vitest'
import { serviceClient, type TestClient, type SlipSummary } from './helpers'
import { expectError } from './assertions'
import { seedMembers, makeMember, clientFor, createTestMarket, ensureInvited, giveRole, type Member, type TestMarket } from './fixtures'
import { lmsrBuy } from '@/lib/markets/lmsr'
import { lmsrParlayQuote } from '@/lib/parlays/odds'

// #326: the creator or an admin moves a market's close time, which reopens a closed one (0106).
let alice: Member
let bob: Member
let admin: Member
let aliceClient: TestClient
let bobClient: TestClient
let adminClient: TestClient

const HOUR = 3_600_000
const B = 50
const inHours = (h: number) => new Date(Date.now() + h * HOUR).toISOString()

beforeEach(async () => {
  ;[alice, bob] = await seedMembers()
  admin = await makeMember('Ada')
  await giveRole(admin, 'admin')
  aliceClient = await clientFor(alice)
  bobClient = await clientFor(bob)
  adminClient = await clientFor(admin)
  for (const c of [aliceClient, bobClient, adminClient]) await ensureInvited(c)
})

function moveClose(client: TestClient, marketId: string, closeAt: string, edit: { title?: string; category?: string } = {}) {
  return client.rpc('update_market', {
    p_market_id: marketId,
    p_title: (edit.title ?? null) as string,
    p_description: null as unknown as string,
    p_category: (edit.category ?? null) as string,
    p_close_at: closeAt,
  })
}

async function closeNow(m: TestMarket): Promise<void> {
  const { error } = await serviceClient()
    .from('markets')
    .update({ close_at: new Date(Date.now() - 60_000).toISOString() })
    .eq('id', m.marketId)
  if (error) throw error
}

async function closeAtOf(m: TestMarket): Promise<number> {
  const { data, error } = await serviceClient().from('markets').select('close_at').eq('id', m.marketId).single()
  if (error) throw error
  return new Date(data.close_at).getTime()
}

async function qOf(m: TestMarket): Promise<number[]> {
  const { data, error } = await serviceClient().from('market_outcomes').select('id, shares, q_offset').eq('market_id', m.marketId)
  if (error) throw error
  return m.outcomeIds.map((id) => {
    const row = data.find((o) => o.id === id)!
    return Number(row.shares) + Number(row.q_offset)
  })
}

async function solo(client: TestClient, m: TestMarket, outcome: number, amount: number) {
  const shares = Math.floor(lmsrBuy(await qOf(m), B, outcome, amount) * 1e6) / 1e6
  return client.rpc('place_slip_v4', {
    p_singles: [{ outcome_id: m.outcomeIds[outcome], amount, payout: Math.floor(shares) }],
    p_parlay_outcome_ids: [],
    p_parlay_stake: 0,
  })
}

async function subscribe(m: Member): Promise<void> {
  const { error } = await serviceClient()
    .from('push_subscriptions')
    .insert({ profile_id: m.id, endpoint: `https://fcm.googleapis.com/fcm/send/${m.displayName}`, p256dh: `p-${m.id}`, auth: `a-${m.id}` })
  if (error) throw error
}

describe('moving the close time', () => {
  it('lets the creator move it later or earlier, logging each change and marking the market edited', async () => {
    const m = await createTestMarket(aliceClient, ['Yes', 'No'], { lmsr: true })
    const before = await closeAtOf(m)
    const later = inHours(5)
    expect((await moveClose(aliceClient, m.marketId, later)).error).toBeNull()
    expect(await closeAtOf(m)).toBe(new Date(later).getTime())
    const earlier = inHours(0.5)
    expect((await moveClose(aliceClient, m.marketId, earlier)).error).toBeNull()
    expect(await closeAtOf(m)).toBe(new Date(earlier).getTime())

    const { data: market } = await serviceClient().from('markets').select('edited_at, title, category_id').eq('id', m.marketId).single()
    expect(market?.edited_at).not.toBeNull()
    expect(market?.title).toBe('Test market')
    const { data: edits } = await bobClient
      .from('market_edits')
      .select('old_title, new_title, old_category_id, old_close_at, new_close_at')
      .eq('market_id', m.marketId)
      .order('id')
    expect(edits?.map((e) => ({ ...e, old_close_at: new Date(e.old_close_at!).getTime(), new_close_at: new Date(e.new_close_at!).getTime() }))).toEqual([
      { old_title: 'Test market', new_title: 'Test market', old_category_id: null, old_close_at: before, new_close_at: new Date(later).getTime() },
      { old_title: 'Test market', new_title: 'Test market', old_category_id: null, old_close_at: new Date(later).getTime(), new_close_at: new Date(earlier).getTime() },
    ])
  })

  it('logs nothing when the close time is the same, and no close time on a title-only edit', async () => {
    const m = await createTestMarket(aliceClient, ['Yes', 'No'], { lmsr: true })
    const same = new Date(await closeAtOf(m)).toISOString()
    expect((await moveClose(aliceClient, m.marketId, same)).error).toBeNull()
    expect((await moveClose(aliceClient, m.marketId, same, { title: 'Reworded', category: 'Weather' })).error).toBeNull()
    const { data: edits } = await serviceClient().from('market_edits').select('new_title, old_close_at, new_close_at').eq('market_id', m.marketId)
    expect(edits).toEqual([{ new_title: 'Reworded', old_close_at: null, new_close_at: null }])
  })

  it('refuses a close time in the past, another member, and a resolved or voided market', async () => {
    const m = await createTestMarket(aliceClient, ['Yes', 'No'], { lmsr: true })
    expectError((await moveClose(aliceClient, m.marketId, inHours(-1))).error, 'close time must be in the future')
    expectError((await moveClose(bobClient, m.marketId, inHours(3))).error, "only the market's creator or an admin can edit it")

    await closeNow(m)
    expect((await adminClient.rpc('resolve_market', { p_market_id: m.marketId, p_outcome_id: m.outcomeIds[0], p_note: 'Done.' })).error).toBeNull()
    for (const client of [aliceClient, adminClient]) {
      expectError((await moveClose(client, m.marketId, inHours(3))).error, "this market has been settled, so its close time can't change")
    }

    const v = await createTestMarket(aliceClient, ['Yes', 'No'], { lmsr: true })
    expect((await adminClient.rpc('void_market', { p_market_id: v.marketId, p_reason: 'Called off' })).error).toBeNull()
    expectError((await moveClose(adminClient, v.marketId, inHours(3))).error, "this market has been settled, so its close time can't change")
  })

  it('refuses a member who is no longer invited', async () => {
    const m = await createTestMarket(aliceClient, ['Yes', 'No'], { lmsr: true })
    await serviceClient().from('allowed_emails').delete().eq('email', alice.email.toLowerCase())
    expectError((await moveClose(aliceClient, m.marketId, inHours(3))).error, "only the market's creator or an admin can edit it")
  })
})

describe('reopening a closed market', () => {
  it('lets the creator or an admin reopen it, and it takes bets again', async () => {
    const m = await createTestMarket(aliceClient, ['Yes', 'No'], { lmsr: true })
    await closeNow(m)
    expectError((await solo(bobClient, m, 0, 10)).error, 'market is not open for betting')
    expect((await moveClose(aliceClient, m.marketId, inHours(2))).error).toBeNull()
    expect((await solo(bobClient, m, 0, 10)).error).toBeNull()

    await closeNow(m)
    expect((await moveClose(adminClient, m.marketId, inHours(2))).error).toBeNull()
    expect((await solo(bobClient, m, 1, 10)).error).toBeNull()
  })

  it('still stops a creator rewording or recategorising a closed market, even while reopening it', async () => {
    const m = await createTestMarket(aliceClient, ['Yes', 'No'], { lmsr: true })
    await closeNow(m)
    expectError((await moveClose(aliceClient, m.marketId, inHours(2), { title: 'Reworded' })).error, "this market has closed, so it can't be edited")
    expectError((await moveClose(aliceClient, m.marketId, inHours(2), { category: 'Sports' })).error, "this market has closed, so it can't be edited")
    const { data: made } = await serviceClient().from('market_categories').select('id').eq('name', 'Sports')
    expect(made).toEqual([])
    // An admin can recategorise and reopen in one go.
    expect((await moveClose(adminClient, m.marketId, inHours(2), { category: 'Sports' })).error).toBeNull()
  })

  it('stops a non-admin resolving it until it closes again, and drops it from markets_to_resolve', async () => {
    const m = await createTestMarket(aliceClient, ['Yes', 'No'], { lmsr: true, title: 'Reopened' })
    await closeNow(m)
    const listed = async () => ((await aliceClient.rpc('markets_to_resolve')).data ?? []).map((r) => r.id)
    expect(await listed()).toContain(m.marketId)
    expect((await aliceClient.rpc('can_resolve_market', { p_market_id: m.marketId })).data).toBe(true)

    expect((await moveClose(aliceClient, m.marketId, inHours(2))).error).toBeNull()
    expect(await listed()).not.toContain(m.marketId)
    expect((await aliceClient.rpc('can_resolve_market', { p_market_id: m.marketId })).data).toBe(false)
    expectError(
      (await aliceClient.rpc('resolve_market', { p_market_id: m.marketId, p_outcome_id: m.outcomeIds[0], p_note: 'Early.' })).error,
      'market has not closed yet',
    )

    await closeNow(m)
    expect(await listed()).toContain(m.marketId)
    expect((await aliceClient.rpc('resolve_market', { p_market_id: m.marketId, p_outcome_id: m.outcomeIds[0], p_note: 'Done.' })).error).toBeNull()
  })

  it('re-arms both closing alerts, so they go out again at the new close', async () => {
    await subscribe(alice)
    await subscribe(admin)
    const m = await createTestMarket(aliceClient, ['Yes', 'No'], { lmsr: true })
    await closeNow(m)
    const db = serviceClient()
    const dueFor = async (fn: 'due_resolve_reminders' | 'due_market_alerts') =>
      ((await db.rpc(fn)).data ?? []).filter((r) => r.market_id === m.marketId).length
    expect(await dueFor('due_resolve_reminders')).toBe(1)
    expect(await dueFor('due_market_alerts')).toBe(1)
    expect((await db.rpc('claim_push_log', { p_kind: 'resolve_reminder', p_refs: [m.marketId] })).error).toBeNull()
    expect((await db.rpc('claim_push_log', { p_kind: 'market_alert', p_refs: [m.marketId] })).error).toBeNull()
    expect((await db.rpc('record_push_failures', { p_kind: 'market_alert', p_refs: [m.marketId] })).error).toBeNull()
    expect(await dueFor('due_resolve_reminders')).toBe(0)
    expect(await dueFor('due_market_alerts')).toBe(0)

    expect((await moveClose(aliceClient, m.marketId, inHours(2))).error).toBeNull()
    const { data: log } = await db.from('push_log').select('kind').eq('ref', m.marketId)
    expect(log).toEqual([])
    const { data: attempts } = await db.from('push_attempts').select('kind').eq('ref', m.marketId)
    expect(attempts).toEqual([])
    // Open again, so nothing is due until it closes.
    expect(await dueFor('due_resolve_reminders')).toBe(0)

    await closeNow(m)
    expect(await dueFor('due_resolve_reminders')).toBe(1)
    expect(await dueFor('due_market_alerts')).toBe(1)
  })

  it('leaves a pending parlay’s fixed multiplier alone, and settles its leg at the later resolution', async () => {
    const m1 = await createTestMarket(aliceClient, ['Yes', 'No'], { lmsr: true, title: 'Leg one' })
    const m2 = await createTestMarket(aliceClient, ['Yes', 'No'], { lmsr: true, title: 'Leg two' })
    const legs = await Promise.all([m1, m2].map(async (m) => ({ q: await qOf(m), liquidity: B, index: 0 })))
    const shown = lmsrParlayQuote(legs, 10).payout
    const { data, error } = await bobClient.rpc('place_slip_v4', {
      p_singles: [],
      p_parlay_outcome_ids: [m1.outcomeIds[0], m2.outcomeIds[0]],
      p_parlay_stake: 10,
      p_parlay_payout: shown,
    })
    expect(error).toBeNull()
    const parlayId = (data as SlipSummary).parlay_id!
    const row = async () => {
      const { data: p, error: pErr } = await serviceClient()
        .from('parlays')
        .select('status, multiplier, payout, parlay_legs(outcome_id, factor, shares, locked_odds)')
        .eq('id', parlayId)
        .single()
      if (pErr) throw pErr
      return p
    }
    const placed = await row()

    await closeNow(m1)
    expect((await moveClose(aliceClient, m1.marketId, inHours(2))).error).toBeNull()
    expect(await row()).toEqual(placed)

    await closeNow(m1)
    await closeNow(m2)
    for (const m of [m2, m1]) {
      expect((await adminClient.rpc('resolve_market', { p_market_id: m.marketId, p_outcome_id: m.outcomeIds[0], p_note: 'Done.' })).error).toBeNull()
    }
    const settled = await row()
    expect(settled.status).toBe('won')
    expect(settled.multiplier).toBe(placed.multiplier)
    expect(settled.payout).toBe(placed.payout)
  })
})
