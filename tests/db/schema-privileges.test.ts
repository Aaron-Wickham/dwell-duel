import { describe, it, expect } from 'vitest'
import { pgQuery } from './pg-query'

// A schema-wide sweep of what anon and authenticated can reach (#274), so a migration that forgets
// its `revoke ... from public, anon` or `enable row level security` fails here instead of exposing
// an object to anyone holding the publishable key.

// A trigger function: EXECUTE isn't checked when a trigger fires, so this grant opens nothing.
const ANON_EXECUTABLE = ['cache_market_sparkline']

// Every SECURITY DEFINER function a signed-in account can call. A definer function skips RLS, so
// each one must check who is calling (is_invited, has_role, auth.uid()) itself. Adding one here is
// the review step: check that it does.
const AUTHENTICATED_DEFINER = [
  'adjust_balance',
  'approve_task_completion',
  'can_resolve_market',
  'cancel_bet',
  'create_market',
  'delete_market',
  'delete_market_comment',
  'delete_task',
  'economy_summary',
  'has_role',
  'has_stake_in_market',
  'is_admin',
  'is_invited',
  'leaderboard_awards',
  'leaderboard_month',
  'leaderboard_race_steps',
  'member_activity',
  'member_emails',
  'member_records',
  'member_stats',
  'my_role',
  'my_task_streaks',
  'place_bet',
  'place_parlay',
  'place_slip',
  'place_slip_v2',
  'reject_task_completion',
  'remove_bet',
  'remove_member',
  'resolve_market',
  'resolve_over_under',
  'review_task_completions',
  'save_push_subscription',
  'set_member_role',
  'submit_task_completion',
  'update_market',
  'update_my_profile',
  'void_market',
  'weekly_recap',
]

describe('schema-wide privileges', () => {
  it('has row level security on every table in public', async () => {
    const open = await pgQuery<{ relname: string }>(`
      select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity
      order by 1
    `)
    expect(open).toEqual([])
  })

  it('grants anon nothing on any table, view or sequence in public', async () => {
    const granted = await pgQuery<{ relname: string }>(`
      select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and case
          when c.relkind = 'S' then has_sequence_privilege('anon', c.oid, 'usage, select, update')
          when c.relkind in ('r', 'p', 'v', 'm', 'f') then has_table_privilege('anon', c.oid, 'select, insert, update, delete, truncate, references, trigger')
          else false
        end
      order by 1
    `)
    expect(granted).toEqual([])
  })

  it('grants anon no column of any table in public', async () => {
    const granted = await pgQuery<{ relname: string; attname: string }>(`
      select c.relname, a.attname
      from pg_attribute a
      join pg_class c on c.oid = a.attrelid
      join pg_namespace n on n.oid = c.relnamespace
      cross join lateral aclexplode(a.attacl) x
      where n.nspname = 'public' and a.attacl is not null
        and (x.grantee = 0 or x.grantee = 'anon'::regrole)
      order by 1, 2
    `)
    expect(granted).toEqual([])
  })

  it('lets anon execute no function in public but the allowlisted trigger', async () => {
    const executable = await pgQuery<{ proname: string }>(`
      select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')
      order by 1
    `)
    expect(executable.map((r) => r.proname)).toEqual(ANON_EXECUTABLE)
  })

  it('lets authenticated execute only the allowlisted SECURITY DEFINER functions', async () => {
    const executable = await pgQuery<{ proname: string }>(`
      select distinct p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.prosecdef and has_function_privilege('authenticated', p.oid, 'execute')
      order by 1
    `)
    expect(executable.map((r) => r.proname)).toEqual([...AUTHENTICATED_DEFINER].sort())
  })

  it('gives anon nothing, and PUBLIC no EXECUTE, on objects postgres creates from now on (0079)', async () => {
    const defaults = await pgQuery<{ schema: string | null; objtype: string; grantee: string; privilege: string }>(`
      select nullif(d.defaclnamespace::regnamespace::text, '-') as schema, d.defaclobjtype as objtype,
             case when x.grantee = 0 then 'PUBLIC' else x.grantee::regrole::text end as grantee, x.privilege_type as privilege
      from pg_default_acl d cross join lateral aclexplode(d.defaclacl) x
      where d.defaclrole = 'postgres'::regrole and (d.defaclnamespace = 0 or d.defaclnamespace = 'public'::regnamespace)
    `)
    expect(defaults.filter((d) => d.grantee === 'anon')).toEqual([])
    // A global entry for functions exists, and it no longer includes PUBLIC.
    const globalFunctions = defaults.filter((d) => d.schema === null && d.objtype === 'f')
    expect(globalFunctions.length).toBeGreaterThan(0)
    expect(globalFunctions.filter((d) => d.grantee === 'PUBLIC')).toEqual([])
  })
})
