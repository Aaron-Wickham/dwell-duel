import { describe, it, expect, beforeEach } from 'vitest'
import { randomUUID } from 'node:crypto'
import { serviceClient, type TestClient } from './helpers'
import { expectError } from './assertions'
import { seedMembers, makeMember, clientFor, createTestMarket, ensureInvited, giveRole, backLeg, type Member } from './fixtures'
import { pgQuery } from './pg-query'
import { RATE_LIMIT_ERRORS } from '@/lib/forms/limits'

const OTHER_ID = '00000000-0000-4000-8000-000000000327'

let alice: Member
let bob: Member
let aliceClient: TestClient
let bobClient: TestClient
let adminClient: TestClient

beforeEach(async () => {
  ;[alice, bob] = await seedMembers()
  const admin = await makeMember('Ada')
  await giveRole(admin, 'admin')
  aliceClient = await clientFor(alice)
  bobClient = await clientFor(bob)
  adminClient = await clientFor(admin)
  for (const c of [aliceClient, bobClient, adminClient]) await ensureInvited(c)
})

const inAnHour = () => new Date(Date.now() + 3_600_000).toISOString()

async function create(client: TestClient, category: string, extra: { key?: string; title?: string } = {}) {
  return client.rpc('create_market_v4', {
    p_title: extra.title ?? 'Will it rain?',
    p_description: null,
    p_kind: 'binary',
    p_outcome_labels: ['Yes', 'No'],
    p_close_at: inAnHour(),
    p_category: category,
    p_idempotency_key: extra.key,
  })
}

async function marketOf(data: unknown) {
  const id = (data as { market_id: string }).market_id
  const { data: row, error } = await serviceClient()
    .from('markets')
    .select('id, pricing, category_id, category:market_categories(name, slug, hidden_at)')
    .eq('id', id)
    .single()
  if (error) throw error
  return row
}

async function categoryId(name: string): Promise<string> {
  const { data, error } = await serviceClient().from('market_categories').select('id').eq('name', name).single()
  if (error) throw error
  return data.id
}

describe('market_categories', () => {
  it('seeds Other, and every market made without a category lands in it', async () => {
    const m = await createTestMarket(aliceClient, ['Yes', 'No'])
    const { data } = await serviceClient().from('markets').select('category_id').eq('id', m.marketId).single()
    expect(data?.category_id).toBe(OTHER_ID)
    const { data: other } = await bobClient.from('market_categories').select('name, slug, hidden_at').eq('id', OTHER_ID).single()
    expect(other).toEqual({ name: 'Other', slug: 'other', hidden_at: null })
  })

  it('lets members read categories but not write them', async () => {
    const insert = await bobClient.from('market_categories').insert({ name: 'Sneaky' })
    expectError(insert.error, { code: '42501', message: 'permission denied' })
    const { data: rows } = await bobClient.from('market_categories').update({ name: 'Renamed' }).eq('id', OTHER_ID).select()
    expect(rows ?? []).toEqual([])
    const { data } = await serviceClient().from('market_categories').select('name').eq('id', OTHER_ID).single()
    expect(data?.name).toBe('Other')
  })

  it('keeps names 1-24 characters in normal form', async () => {
    const db = serviceClient()
    expect((await db.from('market_categories').insert({ name: 'é'.repeat(24) })).error).toBeNull()
    expectError((await db.from('market_categories').insert({ name: 'b'.repeat(25) })).error, { code: '23514', message: 'market_categories_name_length' })
    expectError((await db.from('market_categories').insert({ name: ' Padded' })).error, { code: '23514', message: 'market_categories_name_normal' })
    expectError((await db.from('market_categories').insert({ name: 'Two  spaces' })).error, { code: '23514', message: 'market_categories_name_normal' })
  })
})

describe('create_market_v4', () => {
  it('makes an lmsr market in a new category, tidying the name', async () => {
    const { data, error } = await create(aliceClient, '  Bible   Study ')
    expect(error).toBeNull()
    const market = await marketOf(data)
    expect(market.pricing).toBe('lmsr')
    expect(market.category).toEqual({ name: 'Bible Study', slug: 'bible-study', hidden_at: null })
    const { data: row } = await serviceClient().from('market_categories').select('created_by').eq('id', market.category_id).single()
    expect(row?.created_by).toBe(alice.id)
  })

  it('finds an existing category whatever its case and spacing', async () => {
    const first = await marketOf((await create(aliceClient, 'Bible Study')).data)
    const second = await marketOf((await create(bobClient, 'bible  study')).data)
    expect(second.category_id).toBe(first.category_id)
    expect(second.category?.name).toBe('Bible Study')
    const { count } = await serviceClient().from('market_categories').select('id', { count: 'exact', head: true }).eq('slug', 'bible-study')
    expect(count).toBe(1)
  })

  it('shows a hidden category again when a market is made in it', async () => {
    const first = await marketOf((await create(aliceClient, 'Potluck')).data)
    expect((await adminClient.rpc('set_market_category_hidden', { p_category_id: first.category_id, p_hidden: true })).error).toBeNull()
    const second = await marketOf((await create(bobClient, 'potluck')).data)
    expect(second.category_id).toBe(first.category_id)
    expect(second.category?.hidden_at).toBeNull()
  })

  it('refuses a blank or over-long category, making nothing', async () => {
    expectError((await create(aliceClient, '   ')).error, 'choose a category')
    expectError((await create(aliceClient, 'x'.repeat(25))).error, { code: '23514', message: 'market_categories_name_length' })
    const { count } = await serviceClient().from('markets').select('id', { count: 'exact', head: true })
    expect(count).toBe(0)
  })

  it('returns the first market on a replay of the same attempt key, making no second one', async () => {
    const key = randomUUID()
    const first = await create(aliceClient, 'Sports', { key })
    const replay = await create(aliceClient, 'Weather', { key })
    expect(replay.error).toBeNull()
    expect(replay.data).toEqual({ market_id: (first.data as { market_id: string }).market_id, replayed: true })
    const { count } = await serviceClient().from('market_categories').select('id', { count: 'exact', head: true }).eq('slug', 'weather')
    expect(count).toBe(0)
  })

  it('still refuses a member who is not invited', async () => {
    await serviceClient().from('allowed_emails').delete().eq('email', bob.email.toLowerCase())
    expectError((await create(bobClient, 'Sports')).error, 'not invited')
  })
})

describe('update_market with a category', () => {
  async function edit(client: TestClient, marketId: string, category: string | null, title: string | null = 'Test market') {
    return client.rpc('update_market', {
      p_market_id: marketId,
      p_title: title as string,
      p_description: null as unknown as string,
      p_category: category as string,
    })
  }

  it('lets the creator change it, logging the change and marking the market edited', async () => {
    const m = await createTestMarket(aliceClient, ['Yes', 'No'])
    expect((await edit(aliceClient, m.marketId, 'Weather')).error).toBeNull()
    const weather = await categoryId('Weather')
    const { data: market } = await serviceClient().from('markets').select('category_id, edited_at, title').eq('id', m.marketId).single()
    expect(market).toMatchObject({ category_id: weather, title: 'Test market' })
    expect(market?.edited_at).not.toBeNull()
    const { data: edits } = await bobClient
      .from('market_edits')
      .select('old_title, new_title, old_category_id, new_category_id')
      .eq('market_id', m.marketId)
    expect(edits).toEqual([{ old_title: 'Test market', new_title: 'Test market', old_category_id: OTHER_ID, new_category_id: weather }])
  })

  it('logs no category on an edit that only rewords, and nothing when nothing changed', async () => {
    const m = await createTestMarket(aliceClient, ['Yes', 'No'])
    expect((await edit(aliceClient, m.marketId, 'other')).error).toBeNull()
    expect((await edit(aliceClient, m.marketId, null)).error).toBeNull()
    const { data: none } = await serviceClient().from('markets').select('edited_at').eq('id', m.marketId).single()
    expect(none?.edited_at).toBeNull()
    expect((await edit(aliceClient, m.marketId, 'Other', 'Reworded')).error).toBeNull()
    const { data: edits } = await serviceClient().from('market_edits').select('new_title, old_category_id, new_category_id').eq('market_id', m.marketId)
    expect(edits).toEqual([{ new_title: 'Reworded', old_category_id: null, new_category_id: null }])
  })

  it('changes the category after others have bet, though the title is fixed', async () => {
    const m = await createTestMarket(aliceClient, ['Yes', 'No'])
    await backLeg(m, 0)
    expectError((await edit(aliceClient, m.marketId, 'Sports', 'Reworded')).error, "others have bet on this market, so its title can't change")
    expect((await edit(aliceClient, m.marketId, 'Sports')).error).toBeNull()
  })

  it('stops the creator at close, but lets an admin recategorise a closed or resolved market', async () => {
    const m = await createTestMarket(aliceClient, ['Yes', 'No'])
    await serviceClient().from('markets').update({ close_at: new Date(Date.now() - 1000).toISOString() }).eq('id', m.marketId)
    expectError((await edit(aliceClient, m.marketId, 'Sports')).error, "this market has closed, so it can't be edited")
    expectError((await edit(adminClient, m.marketId, 'Sports', 'Reworded')).error, "this market has closed, so it can't be edited")
    expect((await edit(adminClient, m.marketId, 'Sports', null)).error).toBeNull()

    expect((await adminClient.rpc('resolve_market', { p_market_id: m.marketId, p_outcome_id: m.outcomeIds[0], p_note: 'It rained.' })).error).toBeNull()
    expect((await edit(adminClient, m.marketId, 'Weather', null)).error).toBeNull()
    const { data } = await serviceClient().from('markets').select('category_id, title').eq('id', m.marketId).single()
    expect(data).toEqual({ category_id: await categoryId('Weather'), title: 'Test market' })
  })

  it('leaves a hidden category hidden when a market in it is reworded, however its name is typed', async () => {
    const market = await marketOf((await create(aliceClient, 'Potluck')).data)
    expect((await adminClient.rpc('set_market_category_hidden', { p_category_id: market.category_id, p_hidden: true })).error).toBeNull()
    expect((await edit(aliceClient, market.id, '  potluck ', 'Will it rain at the potluck?')).error).toBeNull()
    const { data } = await serviceClient().from('market_categories').select('hidden_at').eq('id', market.category_id).single()
    expect(data?.hidden_at).not.toBeNull()
    const { data: edits } = await serviceClient().from('market_edits').select('old_category_id').eq('market_id', market.id)
    expect(edits).toEqual([{ old_category_id: null }])
  })

  it('counts a new category made by an edit against the daily limit, but not choosing an existing one', async () => {
    const m = await createTestMarket(aliceClient, ['Yes', 'No'])
    await create(bobClient, 'Weather')
    await pgQuery(`
      insert into public.write_rate_counters (profile_id, action, window_seconds, window_start, writes)
      values ('${alice.id}', 'category', 86400, now(), 20)
    `)
    expectError((await edit(aliceClient, m.marketId, 'Brand new')).error, { code: 'DD429', message: RATE_LIMIT_ERRORS.category.match })
    expectError((await create(aliceClient, 'Another new')).error, { code: 'DD429', message: RATE_LIMIT_ERRORS.category.match })
    expect((await edit(aliceClient, m.marketId, 'weather')).error).toBeNull()
    expect((await create(aliceClient, 'Weather', { title: 'Sunny?' })).error).toBeNull()
  })

  it('refuses another member', async () => {
    const m = await createTestMarket(aliceClient, ['Yes', 'No'])
    expectError((await edit(bobClient, m.marketId, 'Sports')).error, "only the market's creator or an admin can edit it")
  })
})

describe('admin category functions', () => {
  it('renames, refusing a name another category already has', async () => {
    await create(aliceClient, 'Sprots')
    await create(aliceClient, 'Weather')
    const sprots = await categoryId('Sprots')
    expectError((await bobClient.rpc('rename_market_category', { p_category_id: sprots, p_name: 'Sports' })).error, 'only an admin can change categories')
    expectError((await adminClient.rpc('rename_market_category', { p_category_id: sprots, p_name: ' weather ' })).error, 'a category with that name already exists')
    expectError((await adminClient.rpc('rename_market_category', { p_category_id: sprots, p_name: '  ' })).error, 'enter a name')
    expect((await adminClient.rpc('rename_market_category', { p_category_id: sprots, p_name: 'Sports' })).error).toBeNull()
    // A change of case alone is the same category, so it's allowed.
    expect((await adminClient.rpc('rename_market_category', { p_category_id: sprots, p_name: 'SPORTS' })).error).toBeNull()
    const { data } = await serviceClient().from('market_categories').select('name, slug').eq('id', sprots).single()
    expect(data).toEqual({ name: 'SPORTS', slug: 'sports' })
  })

  it('merges, moving and logging every market, closed ones included, and hiding the source', async () => {
    const a = await marketOf((await create(aliceClient, 'Footy')).data)
    const b = await marketOf((await create(bobClient, 'Footy', { title: 'Second' })).data)
    await serviceClient().from('markets').update({ close_at: new Date(Date.now() - 1000).toISOString() }).eq('id', b.id)
    await create(aliceClient, 'Sports')
    const footy = a.category_id
    const sports = await categoryId('Sports')

    expectError((await bobClient.rpc('merge_market_categories', { p_from: footy, p_into: sports })).error, 'only an admin can change categories')
    expectError((await adminClient.rpc('merge_market_categories', { p_from: footy, p_into: footy })).error, 'choose a different category')
    expectError((await adminClient.rpc('merge_market_categories', { p_from: OTHER_ID, p_into: sports })).error, "Other can't be merged away")

    const { data: moved, error } = await adminClient.rpc('merge_market_categories', { p_from: footy, p_into: sports })
    expect(error).toBeNull()
    expect(moved).toBe(2)
    const { data: markets } = await serviceClient().from('markets').select('category_id').in('id', [a.id, b.id])
    expect(markets?.map((m) => m.category_id)).toEqual([sports, sports])
    const { data: edits } = await serviceClient().from('market_edits').select('market_id, old_category_id, new_category_id').in('market_id', [a.id, b.id])
    expect(edits).toHaveLength(2)
    expect(edits?.every((e) => e.old_category_id === footy && e.new_category_id === sports)).toBe(true)
    const { data: source } = await serviceClient().from('market_categories').select('hidden_at').eq('id', footy).single()
    expect(source?.hidden_at).not.toBeNull()

    expectError((await adminClient.rpc('merge_market_categories', { p_from: sports, p_into: footy })).error, "merge into a category that isn't hidden")
    expectError((await adminClient.rpc('merge_market_categories', { p_from: sports, p_into: randomUUID() })).error, 'category not found')
  })

  it('hides and unhides, but never hides Other', async () => {
    await create(aliceClient, 'Potluck')
    const potluck = await categoryId('Potluck')
    expectError((await bobClient.rpc('set_market_category_hidden', { p_category_id: potluck, p_hidden: true })).error, 'only an admin can change categories')
    expectError((await adminClient.rpc('set_market_category_hidden', { p_category_id: OTHER_ID, p_hidden: true })).error, "Other can't be hidden")
    expect((await adminClient.rpc('set_market_category_hidden', { p_category_id: potluck, p_hidden: true })).error).toBeNull()
    expect((await aliceClient.rpc('category_counts', {})).data?.map((c) => c.name)).not.toContain('Potluck')
    expect((await adminClient.rpc('set_market_category_hidden', { p_category_id: potluck, p_hidden: false })).error).toBeNull()
    expect((await aliceClient.rpc('category_counts', {})).data?.map((c) => c.name)).toContain('Potluck')
    expectError((await adminClient.rpc('set_market_category_hidden', { p_category_id: randomUUID(), p_hidden: true })).error, 'category not found')
  })
})

describe('category_counts', () => {
  it('ranks visible categories by markets taking bets, then by every market, then by name', async () => {
    await create(aliceClient, 'Weather')
    await create(aliceClient, 'Weather', { title: 'Two' })
    await create(aliceClient, 'Sports')
    const closed = await marketOf((await create(aliceClient, 'Bible Study')).data)
    await create(aliceClient, 'Bible Study', { title: 'Old' }).then(async ({ data }) => {
      await serviceClient().from('markets').update({ close_at: new Date(Date.now() - 1000).toISOString() }).eq('id', (data as { market_id: string }).market_id)
    })
    await serviceClient().from('markets').update({ close_at: new Date(Date.now() - 1000).toISOString() }).eq('id', closed.id)
    await create(aliceClient, 'Arts')
    await create(aliceClient, 'Hidden')
    await adminClient.rpc('set_market_category_hidden', { p_category_id: await categoryId('Hidden'), p_hidden: true })

    const { data, error } = await bobClient.rpc('category_counts', {})
    expect(error).toBeNull()
    expect(data?.map((c) => [c.name, c.slug, c.open_markets, c.markets])).toEqual([
      ['Weather', 'weather', 2, 2],
      ['Arts', 'arts', 1, 1],
      ['Sports', 'sports', 1, 1],
      ['Bible Study', 'bible-study', 0, 2],
      ['Other', 'other', 0, 0],
    ])
    const { data: all } = await adminClient.rpc('category_counts', { p_include_hidden: true })
    expect(all?.find((c) => c.name === 'Hidden')?.hidden_at).not.toBeNull()
  })

  it('reads a category’s open markets through the (category_id, status, close_at, id) index', async () => {
    // Enough open markets in another category that walking every open market by close time costs
    // more than seeking to this one's.
    await create(aliceClient, 'Busy')
    const busy = await categoryId('Busy')
    const rows = Array.from({ length: 300 }, (_, i) => ({
      title: `Busy ${i}`,
      kind: 'binary',
      status: 'open',
      close_at: new Date(Date.now() + 3_600_000 + i * 1000).toISOString(),
      created_by: alice.id,
      category_id: busy,
    }))
    const { error } = await serviceClient().from('markets').insert(rows)
    if (error) throw error
    const [row] = await pgQuery<{ 'QUERY PLAN': [{ Plan: { 'Index Name'?: string; Plans?: { 'Index Name'?: string }[] } }] }>(`
      analyze; set local enable_seqscan = off;
      explain (format json) select id from public.markets
      where category_id = '${OTHER_ID}' and status = 'open' and close_at > now() order by close_at, id limit 25
    `)
    const plan = row['QUERY PLAN'][0].Plan
    const names = [plan['Index Name'], ...(plan.Plans ?? []).map((p) => p['Index Name'])]
    expect(names).toContain('markets_category_status_close_idx')
  })
})
