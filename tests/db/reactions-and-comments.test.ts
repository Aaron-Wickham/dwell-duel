import { describe, it, expect, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { serviceClient } from './helpers'
import { pgQuery } from './pg-query'
import { seedMembers, makeMember, clientFor, createTestMarket, ensureInvited, type Member, type TestMarket } from './fixtures'

// Reactions on feed items and comments on markets (#79, 0053).

let alice: Member
let bob: Member
let aliceClient: SupabaseClient
let bobClient: SupabaseClient
let adminClient: SupabaseClient
let outsiderClient: SupabaseClient
let market: TestMarket
let eventId: string

beforeEach(async () => {
  ;[alice, bob] = await seedMembers()
  const admin = await makeMember('Ada')
  const outsider = await makeMember('Otto')
  await serviceClient().from('profiles').update({ role: 'admin' }).eq('id', admin.id)
  aliceClient = await clientFor(alice)
  bobClient = await clientFor(bob)
  adminClient = await clientFor(admin)
  // Otto has a profile but no invite, like a member whose invite was revoked.
  outsiderClient = await clientFor(outsider)
  for (const c of [aliceClient, bobClient, adminClient]) await ensureInvited(c)
  market = await createTestMarket(aliceClient, ['Yes', 'No'])
  eventId = `market:${market.marketId}`
})

async function reactionRows() {
  const { data, error } = await serviceClient().from('feed_reactions').select('event_id, profile_id, kind').order('kind')
  if (error) throw error
  return data
}

async function commentRow(id: number) {
  const { data, error } = await serviceClient().from('market_comments').select('body, deleted_at, deleted_by').eq('id', id).maybeSingle()
  if (error) throw error
  return data
}

async function postComment(client: SupabaseClient, profileId: string, body = 'Yes is a lock') {
  return client.from('market_comments').insert({ market_id: market.marketId, profile_id: profileId, body }).select('id').single()
}

describe('feed_reactions', () => {
  it('lets a member add and take back their own reactions, one of each kind per event', async () => {
    expect((await bobClient.from('feed_reactions').insert({ event_id: eventId, profile_id: bob.id, kind: 'fire' })).error).toBeNull()
    expect((await bobClient.from('feed_reactions').insert({ event_id: eventId, profile_id: bob.id, kind: 'pray' })).error).toBeNull()

    const again = await bobClient.from('feed_reactions').insert({ event_id: eventId, profile_id: bob.id, kind: 'fire' })
    expect(again.error?.code).toBe('23505')

    const removed = await bobClient.from('feed_reactions').delete().match({ event_id: eventId, profile_id: bob.id, kind: 'fire' }).select()
    expect(removed.error).toBeNull()
    expect(removed.data).toHaveLength(1)
    expect(await reactionRows()).toEqual([{ event_id: eventId, profile_id: bob.id, kind: 'pray' }])
  })

  it('only takes the four reactions', async () => {
    const { error } = await bobClient.from('feed_reactions').insert({ event_id: eventId, profile_id: bob.id, kind: 'heart' })
    expect(error?.code).toBe('23514')
  })

  it("won't let a member react as someone else", async () => {
    const { error } = await bobClient.from('feed_reactions').insert({ event_id: eventId, profile_id: alice.id, kind: 'fire' })
    expect(error?.code).toBe('42501')
    expect(await reactionRows()).toEqual([])
  })

  it("won't let a member take back someone else's reaction", async () => {
    await aliceClient.from('feed_reactions').insert({ event_id: eventId, profile_id: alice.id, kind: 'clap' })
    const { data, error } = await bobClient.from('feed_reactions').delete().match({ event_id: eventId, kind: 'clap' }).select()
    expect(error).toBeNull()
    expect(data).toEqual([])
    expect(await reactionRows()).toEqual([{ event_id: eventId, profile_id: alice.id, kind: 'clap' }])
  })

  it('hides reactions from, and refuses them from, a member who isn’t invited', async () => {
    await aliceClient.from('feed_reactions').insert({ event_id: eventId, profile_id: alice.id, kind: 'fire' })
    const { data } = await outsiderClient.from('feed_reactions').select('kind')
    expect(data).toEqual([])
    const { data: counts } = await outsiderClient.rpc('feed_reaction_counts', { p_event_ids: [eventId] })
    expect(counts).toEqual([])

    const { data: me } = await outsiderClient.auth.getUser()
    const { error } = await outsiderClient.from('feed_reactions').insert({ event_id: eventId, profile_id: me.user!.id, kind: 'fire' })
    expect(error?.code).toBe('42501')
  })

  it('counts each event’s reactions by kind, marking the ones that are yours', async () => {
    await aliceClient.from('feed_reactions').insert({ event_id: eventId, profile_id: alice.id, kind: 'fire' })
    await bobClient.from('feed_reactions').insert({ event_id: eventId, profile_id: bob.id, kind: 'fire' })
    await bobClient.from('feed_reactions').insert({ event_id: eventId, profile_id: bob.id, kind: 'laugh' })

    const { data, error } = await bobClient.rpc('feed_reaction_counts', { p_event_ids: [eventId, 'bet:0'] })
    expect(error).toBeNull()
    expect([...(data ?? [])].sort((a, b) => a.kind.localeCompare(b.kind))).toEqual([
      { event_id: eventId, kind: 'fire', reactions: 2, mine: true },
      { event_id: eventId, kind: 'laugh', reactions: 1, mine: true },
    ])
    const { data: forAlice } = await aliceClient.rpc('feed_reaction_counts', { p_event_ids: [eventId] })
    expect(forAlice?.find((r: { kind: string }) => r.kind === 'laugh')?.mine).toBe(false)
  })

  it('goes with its event when the event is deleted', async () => {
    // A cancelled bet's event is deleted by cascade (0037), taking its reactions with it.
    expect((await bobClient.rpc('place_bet', { p_market_id: market.marketId, p_outcome_id: market.outcomeIds[0], p_amount: 5 })).error).toBeNull()
    const { data: bet } = await serviceClient().from('bets').select('id').eq('profile_id', bob.id).single()
    const betId = bet!.id
    const betEvent = `bet:${betId}`
    expect((await aliceClient.from('feed_reactions').insert({ event_id: betEvent, profile_id: alice.id, kind: 'fire' })).error).toBeNull()
    expect((await bobClient.rpc('cancel_bet', { p_bet_id: betId })).error).toBeNull()
    expect((await reactionRows()).filter((r) => r.event_id === betEvent)).toEqual([])

    await aliceClient.from('feed_reactions').insert({ event_id: eventId, profile_id: alice.id, kind: 'pray' })
    await serviceClient().from('markets').delete().eq('id', market.marketId)
    expect(await reactionRows()).toEqual([])
  })
})

describe('market_comments', () => {
  it('lets a member post their own comment, which every invited member can read', async () => {
    const { data, error } = await postComment(bobClient, bob.id)
    expect(error).toBeNull()
    const { data: seen } = await aliceClient.from('market_comments').select('id, body, profile_id').eq('market_id', market.marketId)
    expect(seen).toEqual([{ id: data!.id, body: 'Yes is a lock', profile_id: bob.id }])
  })

  it("won't let a member comment as someone else", async () => {
    const { error } = await postComment(bobClient, alice.id)
    expect(error?.code).toBe('42501')
  })

  it("won't let a member post a comment already deleted or backdated", async () => {
    const deleted = await bobClient
      .from('market_comments')
      .insert({ market_id: market.marketId, profile_id: bob.id, body: 'x', deleted_at: new Date().toISOString() })
    expect(deleted.error?.code).toBe('42501')
    const backdated = await bobClient
      .from('market_comments')
      .insert({ market_id: market.marketId, profile_id: bob.id, body: 'x', created_at: '2020-01-01T00:00:00Z' })
    expect(backdated.error?.code).toBe('42501')
  })

  it('hides comments from, and refuses them from, a member who isn’t invited', async () => {
    await postComment(bobClient, bob.id)
    const { data } = await outsiderClient.from('market_comments').select('id')
    expect(data).toEqual([])
    const { data: me } = await outsiderClient.auth.getUser()
    const { error } = await postComment(outsiderClient, me.user!.id)
    expect(error?.code).toBe('42501')
  })

  it('takes up to 280 characters and refuses one more, or an empty comment', async () => {
    expect((await postComment(bobClient, bob.id, 'é'.repeat(280))).error).toBeNull()
    const long = await postComment(bobClient, bob.id, 'a'.repeat(281))
    expect(long.error?.code).toBe('23514')
    expect(long.error?.message).toContain('market_comments_body_length')
    const blank = await postComment(bobClient, bob.id, '   ')
    expect(blank.error?.code).toBe('23514')
  })

  it('lets the author delete their own comment, emptying it for everyone', async () => {
    const { data } = await postComment(bobClient, bob.id)
    expect((await bobClient.rpc('delete_market_comment', { p_comment_id: data!.id })).error).toBeNull()
    expect(await commentRow(data!.id)).toEqual({ body: '', deleted_at: expect.any(String), deleted_by: bob.id })
  })

  it("won't let a member delete someone else's comment, directly or through the function", async () => {
    const { data } = await postComment(bobClient, bob.id)

    const { error } = await aliceClient.rpc('delete_market_comment', { p_comment_id: data!.id })
    expect(error?.message).toBe("only the comment's author or an admin can delete it")

    const direct = await aliceClient.from('market_comments').delete().eq('id', data!.id)
    expect(direct.error?.code).toBe('42501')
    const edit = await bobClient.from('market_comments').update({ body: 'edited' }).eq('id', data!.id)
    expect(edit.error?.code).toBe('42501')

    expect(await commentRow(data!.id)).toEqual({ body: 'Yes is a lock', deleted_at: null, deleted_by: null })
  })

  it("lets an admin delete anyone's comment, for moderation", async () => {
    const { data } = await postComment(bobClient, bob.id)
    const { data: admin } = await adminClient.auth.getUser()
    expect((await adminClient.rpc('delete_market_comment', { p_comment_id: data!.id })).error).toBeNull()
    expect(await commentRow(data!.id)).toEqual({ body: '', deleted_at: expect.any(String), deleted_by: admin.user!.id })
  })

  it("lets the owner delete anyone's comment, but not a reviewer", async () => {
    const { data } = await postComment(bobClient, bob.id)
    await serviceClient().from('profiles').update({ role: 'reviewer' }).eq('id', alice.id)
    expect((await aliceClient.rpc('delete_market_comment', { p_comment_id: data!.id })).error).not.toBeNull()
    await serviceClient().from('profiles').update({ role: 'owner' }).eq('id', alice.id)
    expect((await aliceClient.rpc('delete_market_comment', { p_comment_id: data!.id })).error).toBeNull()
  })

  it('goes with its market, and with its author', async () => {
    const { data } = await postComment(bobClient, bob.id)
    await serviceClient().from('markets').delete().eq('id', market.marketId)
    expect(await commentRow(data!.id)).toBeNull()

    const other = await createTestMarket(aliceClient, ['Yes', 'No'])
    const { data: c } = await bobClient.from('market_comments').insert({ market_id: other.marketId, profile_id: bob.id, body: 'Hi' }).select('id').single()
    await serviceClient().from('profiles').delete().eq('id', bob.id)
    expect(await commentRow(c!.id)).toBeNull()
  })

  it('keeps its functions locked down', async () => {
    const rows = await pgQuery<{ proname: string; anon: boolean; authenticated: boolean; definer: boolean; config: string[] }>(`
      select proname,
        has_function_privilege('anon', oid, 'execute') as anon,
        has_function_privilege('authenticated', oid, 'execute') as authenticated,
        prosecdef as definer,
        proconfig as config
      from pg_proc where proname in ('delete_market_comment', 'feed_reaction_counts') order by proname
    `)
    expect(rows).toEqual([
      { proname: 'delete_market_comment', anon: false, authenticated: true, definer: true, config: ['search_path=""'] },
      { proname: 'feed_reaction_counts', anon: false, authenticated: true, definer: false, config: ['search_path=""'] },
    ])
  })
})
