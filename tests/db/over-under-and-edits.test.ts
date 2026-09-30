import { describe, it, expect, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { serviceClient } from './helpers'
import { seedMembers, makeMember, clientFor, createTestMarket, ensureInvited, type Member, giveRole } from './fixtures'

let alice: Member
let bob: Member
let admin: Member
let aliceClient: SupabaseClient
let bobClient: SupabaseClient
let adminClient: SupabaseClient

beforeEach(async () => {
  ;[alice, bob] = await seedMembers()
  admin = await makeMember('Ada')
  await giveRole(admin, 'admin')
  aliceClient = await clientFor(alice)
  bobClient = await clientFor(bob)
  adminClient = await clientFor(admin)
  for (const c of [aliceClient, bobClient, adminClient]) await ensureInvited(c)
})

const inAnHour = () => new Date(Date.now() + 3_600_000).toISOString()

async function createOverUnder(client: SupabaseClient, line: number) {
  return client.rpc('create_market', {
    p_title: 'Times Sean says "bet" in his teaching',
    p_description: null,
    p_kind: 'over_under',
    p_outcome_labels: [],
    p_close_at: inAnHour(),
    p_line: line,
  })
}

async function outcomesOf(marketId: string) {
  const { data } = await serviceClient().from('market_outcomes').select('id, label').eq('market_id', marketId).order('label')
  return data ?? []
}

describe('over/under markets', () => {
  it('makes the Over and Under outcomes from the line, ignoring any labels sent', async () => {
    const { data: id, error } = await aliceClient.rpc('create_market', {
      p_title: 'Sermon length in minutes',
      p_description: null,
      p_kind: 'over_under',
      p_outcome_labels: ['Sneaky', 'Labels'],
      p_close_at: inAnHour(),
      p_line: 42.5,
    })
    expect(error).toBeNull()
    expect((await outcomesOf(id as string)).map((o) => o.label)).toEqual(['Over 42.5', 'Under 42.5'])
    const { data: m } = await serviceClient().from('markets').select('kind, line').eq('id', id as string).single()
    expect(m).toEqual({ kind: 'over_under', line: 42.5 })
  })

  it('only takes lines ending in .5', async () => {
    for (const line of [3, 3.25, 0, -1.5]) {
      const { error } = await createOverUnder(aliceClient, line)
      expect(error?.message, String(line)).toBe('the line must end in .5, like 3.5')
    }
    const { error } = await aliceClient.rpc('create_market', {
      p_title: 'Yes or no',
      p_description: null,
      p_kind: 'binary',
      p_outcome_labels: ['Yes', 'No'],
      p_close_at: inAnHour(),
      p_line: 2.5,
    })
    expect(error?.message).toBe('only an over/under market has a line')
  })

  it('resolves from the actual number, picking the right side and recording it', async () => {
    const { data: id } = await createOverUnder(aliceClient, 3.5)
    const [over, under] = await outcomesOf(id as string)
    await bobClient.rpc('place_bet', { p_market_id: id, p_outcome_id: over.id, p_amount: 10 })
    await aliceClient.rpc('place_bet', { p_market_id: id, p_outcome_id: under.id, p_amount: 10 })

    const { error } = await adminClient.rpc('resolve_over_under', { p_market_id: id, p_actual: 5, p_note: 'He said it 5 times' })
    expect(error).toBeNull()
    const { data: m } = await serviceClient()
      .from('markets')
      .select('status, current_resolution:market_resolutions!markets_current_resolution_id_fkey(outcome_id, actual_value, note)')
      .eq('id', id as string)
      .single()
    expect(m).toEqual({ status: 'resolved', current_resolution: { outcome_id: over.id, actual_value: 5, note: 'He said it 5 times' } })

    // An override the other way works the same way, with its own reason.
    const { error: overrideErr } = await adminClient.rpc('resolve_over_under', { p_market_id: id, p_actual: 2, p_note: 'Recount: 2' })
    expect(overrideErr).toBeNull()
    const { data: again } = await serviceClient()
      .from('markets')
      .select('current_resolution:market_resolutions!markets_current_resolution_id_fkey(outcome_id, actual_value)')
      .eq('id', id as string)
      .single()
    expect(again?.current_resolution).toEqual({ outcome_id: under.id, actual_value: 2 })
  })

  it('refuses a result equal to the line, a missing note, and a non-over/under market', async () => {
    const { data: id } = await createOverUnder(aliceClient, 3.5)
    expect((await adminClient.rpc('resolve_over_under', { p_market_id: id, p_actual: 3.5, p_note: 'x' })).error?.message).toBe(
      "the result can't equal the line",
    )
    expect((await adminClient.rpc('resolve_over_under', { p_market_id: id, p_actual: 4, p_note: ' ' })).error?.message).toBe(
      'say why this outcome won',
    )
    const binary = await createTestMarket(aliceClient, ['Yes', 'No'])
    expect((await adminClient.rpc('resolve_over_under', { p_market_id: binary.marketId, p_actual: 4, p_note: 'x' })).error?.message).toBe(
      "this market isn't an over/under",
    )
  })
})

describe('update_market', () => {
  it('lets the creator change the title and description, logging each change and marking it edited', async () => {
    const m = await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'Will it snow?' })
    const { error } = await aliceClient.rpc('update_market', {
      p_market_id: m.marketId,
      p_title: '  Will it snow on Sunday?  ',
      p_description: 'Counts if any flakes stick before noon.',
    })
    expect(error).toBeNull()

    const { data: market } = await serviceClient().from('markets').select('title, description, edited_at').eq('id', m.marketId).single()
    expect(market?.title).toBe('Will it snow on Sunday?')
    expect(market?.description).toBe('Counts if any flakes stick before noon.')
    expect(market?.edited_at).not.toBeNull()

    const { data: edits } = await bobClient.from('market_edits').select('old_title, new_title, old_description, new_description').eq('market_id', m.marketId)
    expect(edits).toEqual([
      {
        old_title: 'Will it snow?',
        new_title: 'Will it snow on Sunday?',
        old_description: null,
        new_description: 'Counts if any flakes stick before noon.',
      },
    ])
  })

  it('records nothing when nothing changed', async () => {
    const m = await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'Same' })
    await aliceClient.rpc('update_market', { p_market_id: m.marketId, p_title: 'Same', p_description: '' })
    const { data: market } = await serviceClient().from('markets').select('edited_at').eq('id', m.marketId).single()
    expect(market?.edited_at).toBeNull()
  })

  it('lets an admin edit anyone’s market, but not another member', async () => {
    const m = await createTestMarket(aliceClient, ['Yes', 'No'])
    expect((await bobClient.rpc('update_market', { p_market_id: m.marketId, p_title: 'Hijacked', p_description: null })).error?.message).toBe(
      "only the market's creator or an admin can edit it",
    )
    expect((await adminClient.rpc('update_market', { p_market_id: m.marketId, p_title: 'Tidied up', p_description: null })).error).toBeNull()
  })

  it('refuses once the market has closed, and refuses a blank title', async () => {
    const m = await createTestMarket(aliceClient, ['Yes', 'No'])
    expect((await aliceClient.rpc('update_market', { p_market_id: m.marketId, p_title: '   ', p_description: null })).error?.message).toBe(
      'enter a title',
    )
    await serviceClient().from('markets').update({ close_at: new Date(Date.now() - 1000).toISOString() }).eq('id', m.marketId)
    expect((await aliceClient.rpc('update_market', { p_market_id: m.marketId, p_title: 'Late', p_description: null })).error?.message).toBe(
      "this market has closed, so it can't be edited",
    )
  })

  it('fixes the title once another member has a parlay leg on the market, not just a solo bet (#221)', async () => {
    const m = await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'Will it snow?', seed: 20 })
    const other = await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'Other', seed: 20 })
    const { error: parlayErr } = await bobClient.rpc('place_parlay', { p_outcome_ids: [m.outcomeIds[0], other.outcomeIds[0]], p_stake: 5 })
    if (parlayErr) throw parlayErr

    expect((await aliceClient.rpc('update_market', { p_market_id: m.marketId, p_title: 'Will it snow on Sunday?', p_description: null })).error?.message).toBe(
      "others have bet on this market, so its title can't change",
    )
    // The description still changes, and the creator's own parlay never fixes the title.
    expect((await aliceClient.rpc('update_market', { p_market_id: m.marketId, p_title: 'Will it snow?', p_description: 'Any flakes count.' })).error).toBeNull()

    const own = await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'Mine', seed: 20 })
    const { error: ownErr } = await aliceClient.rpc('place_parlay', { p_outcome_ids: [own.outcomeIds[0], other.outcomeIds[1]], p_stake: 5 })
    if (ownErr) throw ownErr
    expect((await aliceClient.rpc('update_market', { p_market_id: own.marketId, p_title: 'Mine, reworded', p_description: null })).error).toBeNull()
  })

  it('never changes outcomes, kind, close time or line, and members still can’t update markets directly', async () => {
    const m = await createTestMarket(aliceClient, ['Yes', 'No'])
    const before = await serviceClient().from('markets').select('kind, close_at, line').eq('id', m.marketId).single()
    await aliceClient.rpc('update_market', { p_market_id: m.marketId, p_title: 'Renamed', p_description: null })
    const after = await serviceClient().from('markets').select('kind, close_at, line').eq('id', m.marketId).single()
    expect(after.data).toEqual(before.data)
    expect((await outcomesOf(m.marketId)).map((o) => o.label)).toEqual(['No', 'Yes'])

    await aliceClient.from('markets').update({ title: 'Direct write' }).eq('id', m.marketId)
    const { data } = await serviceClient().from('markets').select('title').eq('id', m.marketId).single()
    expect(data?.title).toBe('Renamed')
  })
})
