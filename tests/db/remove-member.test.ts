import { describe, it, expect, beforeEach } from 'vitest'
import { serviceClient, type TestClient } from './helpers'
import { expectError } from './assertions'
import { seedMembers, makeMember, clientFor, createTestMarket, createTestTask, ensureInvited, type Member } from './fixtures'
import { pgQuery } from './pg-query'

// #202: a role only counts while its holder is invited, and the owner can remove a member.
let owner: Member
let admin: Member
let member: Member
let ownerClient: TestClient
let adminClient: TestClient
let memberClient: TestClient

async function setRole(m: Member, role: 'owner' | 'admin' | 'reviewer' | 'member') {
  const { error } = await serviceClient().from('profiles').update({ role }).eq('id', m.id)
  if (error) throw error
}

async function uninvite(m: Member) {
  const { error } = await serviceClient().from('allowed_emails').delete().eq('email', m.email.toLowerCase())
  if (error) throw error
}

async function profileOf(m: Member) {
  const { data, error } = await serviceClient().from('profiles').select('role, balance').eq('id', m.id).single()
  if (error) throw error
  return data
}

async function inviteFor(m: Member) {
  const { data } = await serviceClient().from('allowed_emails').select('email').eq('email', m.email.toLowerCase()).maybeSingle()
  return data
}

beforeEach(async () => {
  ;[owner, admin] = await seedMembers()
  member = await makeMember('Mo')
  await setRole(owner, 'owner')
  await setRole(admin, 'admin')
  ownerClient = await clientFor(owner)
  adminClient = await clientFor(admin)
  memberClient = await clientFor(member)
  for (const c of [ownerClient, adminClient, memberClient]) await ensureInvited(c)
})

describe('a role needs an invite', () => {
  it('reports an admin as a plain member once their invite is gone, and gives it back with the invite', async () => {
    expect((await adminClient.rpc('my_role')).data).toBe('admin')
    await uninvite(admin)
    expect((await adminClient.rpc('my_role')).data).toBe('member')
    expect((await adminClient.rpc('has_role', { p_min: 'reviewer' })).data).toBe(false)
    expect((await adminClient.rpc('is_admin')).data).toBe(false)
    expect((await profileOf(admin)).role, 'the stored role is untouched').toBe('admin')

    await ensureInvited(adminClient)
    expect((await adminClient.rpc('my_role')).data).toBe('admin')
  })

  it('takes every admin power away from a de-invited admin: policies and RPCs alike', async () => {
    const market = await createTestMarket(memberClient, ['Yes', 'No'])
    const { taskId } = await createTestTask(owner)
    const { data: completionId } = await memberClient.rpc('submit_task_completion', { p_task_id: taskId })
    await uninvite(admin)

    const { data: invites } = await adminClient.from('allowed_emails').select('email')
    expect(invites ?? [], 'admin_select_invites').toEqual([])
    expectError((await adminClient.from('allowed_emails').insert({ email: 'friend@example.com' })).error, { code: '42501', message: 'new row violates row-level security policy for table "allowed_emails"' }, 'admin_insert_invites')
    expectError((await adminClient.from('allowed_emails').insert({ email: admin.email })).error, { code: '42501', message: 'new row violates row-level security policy for table "allowed_emails"' }, 'cannot re-invite themselves')
    expect(await inviteFor(admin)).toBeNull()

    expect((await adminClient.rpc('member_emails', { p_ids: [member.id] })).error?.message).toBe('only an admin can see member emails')
    expect((await adminClient.rpc('void_market', { p_market_id: market.marketId, p_reason: 'Voided in a test' })).error?.message).toBe(
      'only the market creator or an admin can void this market',
    )
    expect((await adminClient.rpc('approve_task_completion', { p_completion_id: completionId! })).error?.message).toBe(
      'only a reviewer can approve a task completion',
    )
    expectError((await adminClient.rpc('adjust_balance', { p_profile_id: member.id, p_amount: 5, p_reason: 'r' })).error, 'only the owner can adjust a balance')
    expectError((await adminClient.from('tasks').insert({ title: 'Nope', reward_amount: 5, is_repeatable: false, created_by: admin.id })).error, { code: '42501', message: 'permission denied for table tasks' })

    const { data: ledger } = await adminClient.from('coin_transactions').select('id').eq('profile_id', member.id)
    expect(ledger ?? [], 'select_own_or_admin_transactions').toEqual([])
  })
})

describe('remove_member', () => {
  it('is the owner’s alone, never for the owner, and needs a real member', async () => {
    expect((await adminClient.rpc('remove_member', { p_profile_id: member.id })).error?.message).toBe('only the owner can remove a member')
    expect((await memberClient.rpc('remove_member', { p_profile_id: admin.id })).error?.message).toBe('only the owner can remove a member')
    expect((await ownerClient.rpc('remove_member', { p_profile_id: owner.id })).error?.message).toBe("the owner can't be removed")
    expect((await ownerClient.rpc('remove_member', { p_profile_id: '00000000-0000-0000-0000-000000000000' })).error?.message).toBe('member not found')
    expect(await inviteFor(member)).not.toBeNull()
    expect(await inviteFor(owner)).not.toBeNull()
  })

  it('demotes, revokes the invite and the devices, and leaves coins and bets alone', async () => {
    const market = await createTestMarket(memberClient, ['Yes', 'No'])
    const { error: betErr } = await adminClient.rpc('place_bet', { p_market_id: market.marketId, p_outcome_id: market.outcomeIds[0], p_amount: 30 })
    if (betErr) throw betErr
    const { error: subErr } = await adminClient.rpc('save_push_subscription', {
      p_endpoint: 'https://fcm.googleapis.com/fcm/send/admin-phone',
      p_p256dh: 'k',
      p_auth: 'a',
    })
    if (subErr) throw subErr

    expect((await ownerClient.rpc('remove_member', { p_profile_id: admin.id })).error).toBeNull()

    expect(await profileOf(admin)).toEqual({ role: 'member', balance: 70 })
    expect(await inviteFor(admin)).toBeNull()
    const db = serviceClient()
    const { count: devices } = await db.from('push_subscriptions').select('id', { count: 'exact', head: true }).eq('profile_id', admin.id)
    expect(devices).toBe(0)
    const { count: bets } = await db.from('bets').select('id', { count: 'exact', head: true }).eq('profile_id', admin.id)
    expect(bets).toBe(1)

    // Still signed in, they have no powers and can't invite themselves back.
    expect((await adminClient.rpc('my_role')).data).toBe('member')
    expectError((await adminClient.from('allowed_emails').insert({ email: admin.email })).error, { code: '42501', message: 'new row violates row-level security policy for table "allowed_emails"' })
    // Signing in again runs createOwnProfile's insert, which the RLS check refuses before the
    // duplicate key is noticed, so the callback sends them to /not-invited.
    const { error: again } = await adminClient.from('profiles').insert({ id: admin.id, email: admin.email, display_name: admin.displayName })
    expect(again?.code).toBe('42501')
  })

  it('ends their Auth sessions, so no device can renew its token', async () => {
    const sessions = async () =>
      (await pgQuery<{ n: number }>(`select count(*)::integer as n from auth.sessions where user_id = '${member.id}'`))[0].n
    expect(await sessions()).toBeGreaterThan(0)

    expect((await ownerClient.rpc('remove_member', { p_profile_id: member.id })).error).toBeNull()

    expect(await sessions()).toBe(0)
    const [{ n: tokens }] = await pgQuery<{ n: number }>(`select count(*)::integer as n from auth.refresh_tokens where user_id = '${member.id}'`)
    expect(tokens).toBe(0)
    expectError((await memberClient.auth.refreshSession()).error, { message: 'Invalid Refresh Token: Refresh Token Not Found' })
    // Everyone else stays signed in.
    expect((await ownerClient.auth.refreshSession()).error).toBeNull()
  })

  it('takes away a creator’s and author’s own powers along with the invite', async () => {
    const db = serviceClient()
    const open = await createTestMarket(memberClient, ['Yes', 'No'], { title: 'Mo’s open market' })
    const closed = await createTestMarket(memberClient, ['Yes', 'No'], { title: 'Mo’s closed market' })
    const { error: closeErr } = await db
      .from('markets')
      .update({ close_at: new Date(Date.now() - 1000).toISOString() })
      .eq('id', closed.marketId)
    if (closeErr) throw closeErr
    const { data: comment, error: commentErr } = await memberClient
      .from('market_comments')
      .insert({ market_id: open.marketId, profile_id: member.id, body: 'First!' })
      .select('id')
      .single()
    if (commentErr) throw commentErr
    expect((await memberClient.rpc('can_resolve_market', { p_market_id: closed.marketId })).data, 'while invited').toBe(true)

    expect((await ownerClient.rpc('remove_member', { p_profile_id: member.id })).error).toBeNull()

    // The member's access token outlives the removal until it expires, so each check is the invite's.
    expect((await memberClient.rpc('void_market', { p_market_id: open.marketId, p_reason: 'r' })).error?.message).toBe(
      'only the market creator or an admin can void this market',
    )
    expect(
      (await memberClient.rpc('update_market', { p_market_id: open.marketId, p_title: 'Reworded', p_description: null })).error?.message,
    ).toBe("only the market's creator or an admin can edit it")
    expect((await memberClient.rpc('can_resolve_market', { p_market_id: closed.marketId })).data).toBe(false)
    expect(
      (await memberClient.rpc('resolve_market', { p_market_id: closed.marketId, p_outcome_id: closed.outcomeIds[0], p_note: 'n' })).error
        ?.message,
    ).toBe('only the market creator, a reviewer or an admin can resolve this market')
    const { error: uploadErr } = await memberClient.storage
      .from('proof')
      .upload(`resolution/${closed.marketId}/${crypto.randomUUID()}/proof.jpg`, new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], { type: 'image/jpeg' }), {
        contentType: 'image/jpeg',
      })
    expectError(uploadErr, { message: 'new row violates row-level security policy' }, 'resolution proof upload')
    expect((await memberClient.rpc('delete_market_comment', { p_comment_id: comment.id })).error?.message).toBe(
      "only the comment's author or an admin can delete it",
    )

    const { data: markets } = await db.from('markets').select('id, status, title').in('id', [open.marketId, closed.marketId]).order('title')
    expect(markets).toEqual([
      { id: closed.marketId, status: 'open', title: 'Mo’s closed market' },
      { id: open.marketId, status: 'open', title: 'Mo’s open market' },
    ])
    const { data: kept } = await db.from('market_comments').select('body, deleted_at').eq('id', comment.id).single()
    expect(kept).toEqual({ body: 'First!', deleted_at: null })
  })

  it('can be undone by inviting them again, with their role to be granted afresh', async () => {
    expect((await ownerClient.rpc('remove_member', { p_profile_id: admin.id })).error).toBeNull()
    // Removal signed them out, so they sign in again once invited.
    adminClient = await clientFor(admin)
    await ensureInvited(adminClient)
    expect((await adminClient.rpc('my_role')).data).toBe('member')
    expect((await ownerClient.rpc('set_member_role', { p_profile_id: admin.id, p_role: 'admin' })).error).toBeNull()
    expect((await adminClient.rpc('my_role')).data).toBe('admin')
  })
})
