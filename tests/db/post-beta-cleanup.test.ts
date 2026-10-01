import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { serviceClient } from './helpers'
import { seedMembers, createTestTask, type Member } from './fixtures'
import { pgQuery } from './pg-query'

// Reads the preflight guard out of the migration itself, so the test can't drift from what
// actually runs: the do $$ ... $$; block before any change. 0036 has a second do $$ block (the
// NOWAIT lock-retry loop), so this picks the one that actually raises the invariant-violation
// message, rather than assuming the guard is the file's only or first do block. Neither block
// nests $$ tags.
function readGuardBlock(): string {
  const sql = readFileSync(
    path.resolve(import.meta.dirname, '../../supabase/migrations/0036_post_beta_cleanup.sql'),
    'utf8',
  )
  const blocks = sql.match(/do \$\$[\s\S]*?\$\$;/g) ?? []
  const guard = blocks.find((b) => b.includes('rows already break the new invariants'))
  if (!guard) throw new Error('could not find the preflight do $$ block in 0036_post_beta_cleanup.sql')
  return guard
}

const FOREIGN_KEY_INDEXES: Record<string, string> = {
  activity_events_actor_id_idx: 'CREATE INDEX activity_events_actor_id_idx ON public.activity_events USING btree (actor_id)',
  activity_events_bet_id_idx: 'CREATE INDEX activity_events_bet_id_idx ON public.activity_events USING btree (bet_id)',
  activity_events_market_id_idx: 'CREATE INDEX activity_events_market_id_idx ON public.activity_events USING btree (market_id)',
  activity_events_outcome_id_idx: 'CREATE INDEX activity_events_outcome_id_idx ON public.activity_events USING btree (outcome_id)',
  activity_events_parlay_id_idx: 'CREATE INDEX activity_events_parlay_id_idx ON public.activity_events USING btree (parlay_id)',
  activity_events_resolution_id_idx:
    'CREATE INDEX activity_events_resolution_id_idx ON public.activity_events USING btree (resolution_id)',
  activity_events_task_completion_id_idx:
    'CREATE INDEX activity_events_task_completion_id_idx ON public.activity_events USING btree (task_completion_id)',
}

let alice: Member
let bob: Member

beforeEach(async () => {
  ;[alice, bob] = await seedMembers()
})

// A parlay row written directly is settled on paper only; this gives it the payout row the real
// settle_parlay would have written, so the ledger check still holds.
async function payParlay(parlayId: string, profileId: string, amount: number): Promise<void> {
  await pgQuery(`
    insert into public.coin_transactions (profile_id, amount, type, meta)
      values ('${profileId}', ${amount}, 'parlay_won', jsonb_build_object('parlay_id', '${parlayId}'));
    update public.profiles set balance = balance + ${amount} where id = '${profileId}'
  `)
}

describe('activity_events foreign key indexes', () => {
  it('indexes every column a source row delete looks events up by', async () => {
    const rows = await pgQuery<{ indexname: string; indexdef: string }>(
      `select indexname, indexdef from pg_indexes where schemaname = 'public' and indexname in (${Object.keys(FOREIGN_KEY_INDEXES)
        .map((name) => `'${name}'`)
        .join(', ')})`,
    )
    expect(Object.fromEntries(rows.map((r) => [r.indexname, r.indexdef]))).toEqual(FOREIGN_KEY_INDEXES)
  })
})

describe('timestamp invariants', () => {
  it('refuses an approved task completion with no reviewed_at, and accepts one with it', async () => {
    const db = serviceClient()
    const { taskId: first } = await createTestTask(alice, { title: 'First task' })
    const { taskId: second } = await createTestTask(alice, { title: 'Second task' })
    const completion = { profile_id: bob.id, reward_amount: 10, period_key: 'once' }

    const refused = await db.from('task_completions').insert({ ...completion, task_id: first, status: 'approved' })
    expect(refused.error?.code).toBe('23514')
    expect(refused.error?.message).toContain('task_completions_approved_has_reviewed_at')

    const pending = await db.from('task_completions').insert({ ...completion, task_id: first, status: 'pending' })
    expect(pending.error).toBeNull()

    const approved = await db.from('task_completions').insert({
      ...completion,
      task_id: second,
      status: 'approved',
      reviewed_at: new Date().toISOString(),
      reviewed_by: alice.id,
    })
    expect(approved.error).toBeNull()
  })

  it('refuses a won parlay with no settled_at, and accepts one with it', async () => {
    const db = serviceClient()
    const { data: parlay, error: insertErr } = await db
      .from('parlays')
      .insert({ profile_id: bob.id, stake: 10, max_multiplier: 20 })
      .select('id')
      .single()
    expect(insertErr).toBeNull()

    const refused = await db.from('parlays').update({ status: 'won', credited: 20 }).eq('id', parlay!.id)
    expect(refused.error?.code).toBe('23514')
    expect(refused.error?.message).toContain('parlays_won_has_settled_at')

    const won = await db
      .from('parlays')
      .update({ status: 'won', credited: 20, settled_at: new Date().toISOString() })
      .eq('id', parlay!.id)
    expect(won.error).toBeNull()
    await payParlay(parlay!.id, bob.id, 20)
  })

  it('adds both constraints validated', async () => {
    const rows = await pgQuery<{ conname: string; convalidated: boolean; definition: string }>(`
      select conname, convalidated, pg_get_constraintdef(oid) as definition from pg_constraint
      where conname in ('task_completions_approved_has_reviewed_at', 'parlays_won_has_settled_at')
      order by conname
    `)
    expect(rows).toEqual([
      {
        conname: 'parlays_won_has_settled_at',
        convalidated: true,
        definition: "CHECK (((status <> 'won'::text) OR (settled_at IS NOT NULL)))",
      },
      {
        conname: 'task_completions_approved_has_reviewed_at',
        convalidated: true,
        definition: "CHECK (((status <> 'approved'::text) OR (reviewed_at IS NOT NULL)))",
      },
    ])
  })

  it('the preflight guard passes clean rows and raises on rows that break either invariant, naming each count', async () => {
    // A guard with a wrong predicate (say, missing `and reviewed_at is null`) would still pass on
    // an empty table. Seeding one row that satisfies each invariant makes sure the clean-pass
    // check is actually exercising the guard's condition, not just running it on nothing.
    const db = serviceClient()
    const { taskId: cleanTaskId } = await createTestTask(alice)
    const cleanCompletion = await db.from('task_completions').insert({
      task_id: cleanTaskId,
      profile_id: bob.id,
      status: 'approved',
      reward_amount: 10,
      period_key: 'once',
      reviewed_at: new Date().toISOString(),
      reviewed_by: alice.id,
    })
    expect(cleanCompletion.error).toBeNull()
    const cleanParlay = await db
      .from('parlays')
      .insert({ profile_id: bob.id, stake: 10, max_multiplier: 20, status: 'won', credited: 20, settled_at: new Date().toISOString() })
      .select('id')
      .single()
    expect(cleanParlay.error).toBeNull()
    await payParlay(cleanParlay.data!.id, bob.id, 20)

    await expect(pgQuery(readGuardBlock())).resolves.toBeDefined()

    // The violating rows can only be made with the constraints gone, and with the events triggers
    // off, since they'd fail on the missing timestamp first. Everything runs in postgres-meta's one
    // implicit transaction, so the guard's raise rolls it all back: the constraints, triggers and
    // rows are exactly as they were. The last statement fails the test if the guard doesn't raise,
    // and rolls back just the same.
    const { taskId } = await createTestTask(alice)
    await expect(
      pgQuery(`
        alter table public.task_completions drop constraint task_completions_approved_has_reviewed_at;
        alter table public.parlays drop constraint parlays_won_has_settled_at;
        alter table public.task_completions disable trigger activity_events_from_task_completion;
        alter table public.parlays disable trigger activity_events_from_parlay;
        insert into public.task_completions (task_id, profile_id, status, reward_amount, period_key)
          values ('${taskId}', '${bob.id}', 'approved', 10, 'once');
        insert into public.parlays (profile_id, stake, max_multiplier, status, credited) values ('${bob.id}', 10, 20, 'won', 20);
        ${readGuardBlock()}
        do $$ begin raise exception 'the guard let the violating rows through'; end $$;
      `),
    ).rejects.toThrow(/task_completions approved without reviewed_at: 1, parlays won without settled_at: 1/)

    const [after] = await pgQuery<{ constraints: number; triggers: number; completions: number; parlays: number }>(`
      select
        (select count(*)::integer from pg_constraint
          where conname in ('task_completions_approved_has_reviewed_at', 'parlays_won_has_settled_at')) as constraints,
        (select count(*)::integer from pg_trigger
          where tgname in ('activity_events_from_task_completion', 'activity_events_from_parlay') and tgenabled = 'O') as triggers,
        (select count(*)::integer from public.task_completions) as completions,
        (select count(*)::integer from public.parlays) as parlays
    `)
    // The seeded clean completion and parlay from the top of this test are untouched by the
    // rolled-back violating insert, so they're still the only rows left.
    expect(after).toEqual({ constraints: 2, triggers: 2, completions: 1, parlays: 1 })
  })
})
