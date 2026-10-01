import { describe, it, expect, beforeEach } from 'vitest'
import { serviceClient, type TestClient } from './helpers'
import { expectError } from './assertions'
import { seedMembers, makeMember, clientFor, createTestMarket, createTestTask, ensureInvited, type Member } from './fixtures'

type Role = 'owner' | 'admin' | 'reviewer' | 'member'

let owner: Member
let admin: Member
let reviewer: Member
let member: Member
const clients: Record<Role, TestClient> = {} as Record<Role, TestClient>

async function setRole(m: Member, role: Role) {
  const { error } = await serviceClient().from('profiles').update({ role }).eq('id', m.id)
  if (error) throw error
}

async function roleOf(m: Member): Promise<string> {
  const { data } = await serviceClient().from('profiles').select('role').eq('id', m.id).single()
  return data?.role as string
}

beforeEach(async () => {
  ;[owner, admin] = await seedMembers()
  reviewer = await makeMember('Rita')
  member = await makeMember('Mo')
  for (const [m, role] of [
    [owner, 'owner'],
    [admin, 'admin'],
    [reviewer, 'reviewer'],
  ] as const) {
    await setRole(m, role)
  }
  for (const [m, role] of [
    [owner, 'owner'],
    [admin, 'admin'],
    [reviewer, 'reviewer'],
    [member, 'member'],
  ] as const) {
    clients[role] = await clientFor(m)
    await ensureInvited(clients[role])
  }
})

describe('my_role and has_role', () => {
  it('reports each role and ranks them owner > admin > reviewer > member', async () => {
    const ladder: Role[] = ['owner', 'admin', 'reviewer', 'member']
    for (const [i, role] of ladder.entries()) {
      expect((await clients[role].rpc('my_role')).data).toBe(role)
      for (const [j, min] of ladder.entries()) {
        expect((await clients[role].rpc('has_role', { p_min: min })).data, `${role} >= ${min}`).toBe(i <= j)
      }
    }
  })

  it('keeps is_admin() meaning admin or owner', async () => {
    expect((await clients.owner.rpc('is_admin')).data).toBe(true)
    expect((await clients.admin.rpc('is_admin')).data).toBe(true)
    expect((await clients.reviewer.rpc('is_admin')).data).toBe(false)
    expect((await clients.member.rpc('is_admin')).data).toBe(false)
  })

  it('allows only one owner', async () => {
    const { error } = await serviceClient().from('profiles').update({ role: 'owner' }).eq('id', admin.id)
    expect(error?.message).toMatch(/profiles_single_owner/)
  })
})

describe('reviewers', () => {
  it('see every pending submission and can approve and reject, but not create tasks', async () => {
    const { taskId } = await createTestTask(owner)
    const { data: first } = await clients.member.rpc('submit_task_completion', { p_task_id: taskId })
    const { taskId: task2 } = await createTestTask(owner, { title: 'Second' })
    const { data: second } = await clients.member.rpc('submit_task_completion', { p_task_id: task2 })

    const { data: visible } = await clients.reviewer.from('task_completions').select('id').eq('status', 'pending')
    expect(visible?.map((r) => r.id).sort()).toEqual([first, second].sort())

    expect((await clients.reviewer.rpc('approve_task_completion', { p_completion_id: first! })).error).toBeNull()
    expect((await clients.reviewer.rpc('reject_task_completion', { p_completion_id: second!, p_reason: 'No proof' })).error).toBeNull()

    const { error: createErr } = await clients.reviewer
      .from('tasks')
      .insert({ title: 'Nope', reward_amount: 5, is_repeatable: false, created_by: reviewer.id })
    expectError(createErr, { code: '42501', message: 'permission denied for table tasks' })
  })

  it("can't resolve someone else's market early, void it, invite, or adjust balances", async () => {
    const market = await createTestMarket(clients.member, ['Yes', 'No'])
    expectError((await clients.reviewer.rpc('resolve_market', { p_note: 'Resolved in a test', p_market_id: market.marketId, p_outcome_id: market.outcomeIds[0] })).error, 'market has not closed yet')
    expectError((await clients.reviewer.rpc('void_market', { p_market_id: market.marketId, p_reason: 'Voided in a test' })).error, 'only the market creator or an admin can void this market')
    expectError((await clients.reviewer.from('allowed_emails').insert({ email: 'x@example.com' })).error, { code: '42501', message: 'new row violates row-level security policy for table "allowed_emails"' })
    expectError((await clients.reviewer.rpc('adjust_balance', { p_profile_id: member.id, p_amount: 5, p_reason: 'r' })).error, 'only the owner can adjust a balance')
  })

  it("members can't review", async () => {
    const { taskId } = await createTestTask(owner)
    const { data: id } = await clients.member.rpc('submit_task_completion', { p_task_id: taskId })
    const { error } = await clients.member.rpc('approve_task_completion', { p_completion_id: id! })
    expect(error?.message).toBe('only a reviewer can approve a task completion')
  })
})

describe('set_member_role', () => {
  it('lets the owner make someone an admin, reviewer or member', async () => {
    for (const role of ['admin', 'reviewer', 'member'] as const) {
      expect((await clients.owner.rpc('set_member_role', { p_profile_id: member.id, p_role: role })).error).toBeNull()
      expect(await roleOf(member)).toBe(role)
    }
  })

  it("refuses anyone but the owner, a second owner, and the owner's own role", async () => {
    expect((await clients.admin.rpc('set_member_role', { p_profile_id: member.id, p_role: 'admin' })).error?.message).toBe(
      'only the owner can change roles',
    )
    expect((await clients.owner.rpc('set_member_role', { p_profile_id: member.id, p_role: 'owner' })).error?.message).toBe(
      'role must be admin, reviewer or member',
    )
    expect((await clients.owner.rpc('set_member_role', { p_profile_id: owner.id, p_role: 'member' })).error?.message).toBe(
      "the owner's own role can't be changed",
    )
    expect(await roleOf(owner)).toBe('owner')
    expect(await roleOf(member)).toBe('member')
  })
})

describe('owner-only deletes', () => {
  it('deletes a market nobody has bet on, and refuses one with bets', async () => {
    const empty = await createTestMarket(clients.member, ['Yes', 'No'], { title: 'Empty' })
    const busy = await createTestMarket(clients.member, ['Yes', 'No'], { title: 'Busy' })
    const { error: betErr } = await clients.member.rpc('place_bet', { p_market_id: busy.marketId, p_outcome_id: busy.outcomeIds[0], p_amount: 5 })
    if (betErr) throw betErr

    expect((await clients.admin.rpc('delete_market', { p_market_id: empty.marketId })).error?.message).toBe('only the owner can delete a market')
    expect((await clients.owner.rpc('delete_market', { p_market_id: empty.marketId })).error).toBeNull()
    expect((await clients.owner.rpc('delete_market', { p_market_id: busy.marketId })).error?.message).toBe('this market has bets, so void it instead')

    const { data } = await serviceClient().from('markets').select('title').in('id', [empty.marketId, busy.marketId])
    expect(data?.map((m) => m.title)).toEqual(['Busy'])
  })

  it('deletes a task nobody has submitted, and refuses one with submissions', async () => {
    const { taskId: fresh } = await createTestTask(owner, { title: 'Fresh' })
    const { taskId: used } = await createTestTask(owner, { title: 'Used' })
    await clients.member.rpc('submit_task_completion', { p_task_id: used })

    expect((await clients.admin.rpc('delete_task', { p_task_id: fresh })).error?.message).toBe('only the owner can delete a task')
    expect((await clients.owner.rpc('delete_task', { p_task_id: fresh })).error).toBeNull()
    expect((await clients.owner.rpc('delete_task', { p_task_id: used })).error?.message).toBe(
      'members have submitted this task, so deactivate it instead',
    )
  })

  it("removes any member's open bet with a full refund", async () => {
    const market = await createTestMarket(clients.admin, ['Yes', 'No'])
    await clients.member.rpc('place_bet', { p_market_id: market.marketId, p_outcome_id: market.outcomeIds[0], p_amount: 30 })
    const { data: bet } = await serviceClient().from('bets').select('id').eq('market_id', market.marketId).single()

    expect((await clients.admin.rpc('remove_bet', { p_bet_id: bet!.id })).error?.message).toBe('only the owner can remove a bet')
    expect((await clients.owner.rpc('remove_bet', { p_bet_id: bet!.id })).error).toBeNull()

    const db = serviceClient()
    const { data: profile } = await db.from('profiles').select('balance').eq('id', member.id).single()
    expect(profile?.balance).toBe(100)
    const { data: pool } = await db.from('market_outcomes').select('pool_total').eq('id', market.outcomeIds[0]).single()
    expect(pool?.pool_total).toBe(0)
    const { data: cancelled } = await db.from('cancelled_bets').select('id').eq('id', bet!.id)
    expect(cancelled).toHaveLength(1)
  })

  it('refuses to remove a bet once its market has closed, before anyone resolves it (#272)', async () => {
    const market = await createTestMarket(clients.admin, ['Yes', 'No'])
    await clients.member.rpc('place_bet', { p_market_id: market.marketId, p_outcome_id: market.outcomeIds[0], p_amount: 30 })
    const db = serviceClient()
    const { data: bet } = await db.from('bets').select('id').eq('market_id', market.marketId).single()
    await db.from('markets').update({ close_at: new Date(Date.now() - 1000).toISOString() }).eq('id', market.marketId)

    expectError((await clients.owner.rpc('remove_bet', { p_bet_id: bet!.id })).error, "this market has closed, so the bet can't be removed")
    const { data: still } = await db.from('bets').select('id').eq('id', bet!.id)
    expect(still).toHaveLength(1)
    const { data: profile } = await db.from('profiles').select('balance').eq('id', member.id).single()
    expect(profile?.balance).toBe(70)
  })
})
