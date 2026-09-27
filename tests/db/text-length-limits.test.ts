import { describe, it, expect, beforeEach } from 'vitest'
import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js'
import { serviceClient } from './helpers'
import { seedMembers, clientFor, createTestMarket, createTestTask, type Member, type TestMarket } from './fixtures'
import { pgQuery } from './pg-query'

let alice: Member
let bob: Member
let adminClient: SupabaseClient
let market: TestMarket
let taskId: string
let completionId: string

beforeEach(async () => {
  ;[alice, bob] = await seedMembers()
  const db = serviceClient()
  const { error: adminErr } = await db.from('profiles').update({ is_admin: true }).eq('id', alice.id)
  if (adminErr) throw adminErr
  adminClient = await clientFor(alice)
  market = await createTestMarket(adminClient, ['Yes', 'No'])
  ;({ taskId } = await createTestTask(alice))
  const { data, error } = await db
    .from('task_completions')
    .insert({ task_id: taskId, profile_id: bob.id, reward_amount: 10, period_key: 'once' })
    .select('id')
    .single()
  if (error) throw error
  completionId = data.id
})

type Write = (value: string) => PromiseLike<{ error: PostgrestError | null }>

const CASES: { constraint: string; max: number; write: Write }[] = [
  {
    constraint: 'markets_title_length',
    max: 120,
    write: (v) => serviceClient().from('markets').update({ title: v }).eq('id', market.marketId),
  },
  {
    constraint: 'markets_description_length',
    max: 1000,
    write: (v) => serviceClient().from('markets').update({ description: v }).eq('id', market.marketId),
  },
  {
    constraint: 'market_outcomes_label_length',
    max: 60,
    write: (v) => serviceClient().from('market_outcomes').update({ label: v }).eq('id', market.outcomeIds[0]),
  },
  {
    constraint: 'tasks_title_length',
    max: 120,
    write: (v) => serviceClient().from('tasks').update({ title: v }).eq('id', taskId),
  },
  {
    constraint: 'tasks_description_length',
    max: 1000,
    write: (v) => serviceClient().from('tasks').update({ description: v }).eq('id', taskId),
  },
  {
    constraint: 'task_completions_review_note_length',
    max: 500,
    write: (v) => serviceClient().from('task_completions').update({ review_note: v }).eq('id', completionId),
  },
  {
    constraint: 'allowed_emails_email_length',
    max: 254,
    write: (v) => serviceClient().from('allowed_emails').insert({ email: v }),
  },
  {
    constraint: 'profiles_display_name_length',
    max: 80,
    write: (v) => serviceClient().from('profiles').update({ display_name: v }).eq('id', bob.id),
  },
]

describe('text length limits', () => {
  // 'é' is two bytes in UTF-8, so accepting it at the limit shows the check counts characters.
  it.each(CASES)('$constraint accepts $max characters and refuses one more', async ({ constraint, max, write }) => {
    const atLimit = await write('é'.repeat(max))
    expect(atLimit.error).toBeNull()

    const over = await write('b'.repeat(max + 1))
    expect(over.error?.code).toBe('23514')
    expect(over.error?.message).toContain(constraint)
  })

  it('adds every limit without checking the rows already there', async () => {
    const rows = await pgQuery<{ conname: string; convalidated: boolean }>(`
      select conname, convalidated from pg_constraint
      where conname in (${CASES.map((c) => `'${c.constraint}'`).join(', ')})
      order by conname
    `)
    expect(rows).toEqual(
      CASES.map((c) => ({ conname: c.constraint, convalidated: false })).sort((a, b) => a.conname.localeCompare(b.conname)),
    )
  })

  it('leaves an older over-limit row in place, refuses other edits to it, and lets it be shortened', async () => {
    // A CHECK can't be bypassed by the service role or session_replication_role, so the older row
    // is made the way production rows were: with the limit absent. All three statements run in one
    // transaction, and the limit comes back exactly as 0034 adds it.
    const longTitle = 't'.repeat(121)
    await pgQuery(`
      alter table public.tasks drop constraint tasks_title_length;
      insert into public.tasks (title, reward_amount, created_by) values ('${longTitle}', 5, '${alice.id}');
      alter table public.tasks add constraint tasks_title_length check (char_length(title) <= 120) not valid;
    `)
    const db = serviceClient()
    const { data: older, error: readErr } = await db.from('tasks').select('id').eq('title', longTitle).single()
    expect(readErr).toBeNull()

    const { error: rewardErr } = await db.from('tasks').update({ reward_amount: 6 }).eq('id', older!.id)
    expect(rewardErr?.code).toBe('23514')
    expect(rewardErr?.message).toContain('tasks_title_length')

    const { error: shortenErr } = await db.from('tasks').update({ title: 'Read Genesis 1-3' }).eq('id', older!.id)
    expect(shortenErr).toBeNull()
    const { data: after } = await db.from('tasks').select('title').eq('id', older!.id).single()
    expect(after?.title).toBe('Read Genesis 1-3')
  })
})

describe('adjust_balance reason limit', () => {
  async function bobsAdjustments(): Promise<{ amount: number; reason: string }[]> {
    const { data, error } = await serviceClient()
      .from('coin_transactions')
      .select('amount, meta')
      .eq('profile_id', bob.id)
      .eq('type', 'admin_adjustment')
    if (error) throw error
    return data.map((t) => ({ amount: t.amount, reason: t.meta.reason }))
  }

  async function bobsBalance(): Promise<number> {
    const { data, error } = await serviceClient().from('profiles').select('balance').eq('id', bob.id).single()
    if (error) throw error
    return data.balance
  }

  it('refuses a reason over 200 characters, changing nothing', async () => {
    const before = await bobsBalance()

    const { error } = await adminClient.rpc('adjust_balance', {
      p_profile_id: bob.id,
      p_amount: 5,
      p_reason: 'r'.repeat(201),
    })

    expect(error?.message).toBe('reason too long')
    expect(await bobsBalance()).toBe(before)
    expect(await bobsAdjustments()).toEqual([])
  })

  it('still adjusts with a reason of exactly 200 characters', async () => {
    const before = await bobsBalance()
    const reason = 'é'.repeat(200)

    const { error } = await adminClient.rpc('adjust_balance', { p_profile_id: bob.id, p_amount: 5, p_reason: reason })

    expect(error).toBeNull()
    expect(await bobsBalance()).toBe(before + 5)
    expect(await bobsAdjustments()).toEqual([{ amount: 5, reason }])
  })

  it('keeps its grants and its locked-down search path', async () => {
    const [fn] = await pgQuery<{
      anon: boolean
      authenticated: boolean
      service_role: boolean
      security_definer: boolean
      config: string
    }>(`
      select
        has_function_privilege('anon', 'public.adjust_balance(uuid, integer, text)', 'execute') as anon,
        has_function_privilege('authenticated', 'public.adjust_balance(uuid, integer, text)', 'execute') as authenticated,
        has_function_privilege('service_role', 'public.adjust_balance(uuid, integer, text)', 'execute') as service_role,
        p.prosecdef as security_definer,
        array_to_string(p.proconfig, ',') as config
      from pg_proc p
      where p.oid = 'public.adjust_balance(uuid, integer, text)'::regprocedure
    `)
    expect(fn).toEqual({ anon: false, authenticated: true, service_role: true, security_definer: true, config: 'search_path=""' })
  })
})
