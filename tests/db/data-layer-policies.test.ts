import { describe, it, expect } from 'vitest'
import { pgQuery } from './pg-query'

interface Policy {
  tablename: string
  policyname: string
  cmd: string
  permissive: string
  roles: string[]
  qual: string | null
  with_check: string | null
}

type Expression = Pick<Policy, 'tablename' | 'policyname' | 'cmd' | 'qual' | 'with_check'>

// pg_policies as migration 0032 left them. 0033 may only wrap the helper calls.
const BEFORE_0033: Expression[] = [
  { tablename: 'allowed_emails', policyname: 'admin_delete_invites', cmd: 'DELETE', qual: 'is_admin()', with_check: null },
  { tablename: 'allowed_emails', policyname: 'admin_insert_invites', cmd: 'INSERT', qual: null, with_check: 'is_admin()' },
  { tablename: 'allowed_emails', policyname: 'admin_select_invites', cmd: 'SELECT', qual: 'is_admin()', with_check: null },
  { tablename: 'bets', policyname: 'select_invited_bets', cmd: 'SELECT', qual: '(is_invited() OR is_admin())', with_check: null },
  {
    tablename: 'coin_transactions',
    policyname: 'select_own_or_admin_transactions',
    cmd: 'SELECT',
    qual: '((profile_id = ( SELECT auth.uid() AS uid)) OR is_admin())',
    with_check: null,
  },
  { tablename: 'market_outcomes', policyname: 'select_market_outcomes', cmd: 'SELECT', qual: 'is_invited()', with_check: null },
  { tablename: 'market_resolutions', policyname: 'select_market_resolutions', cmd: 'SELECT', qual: 'is_invited()', with_check: null },
  { tablename: 'markets', policyname: 'select_markets', cmd: 'SELECT', qual: 'is_invited()', with_check: null },
  { tablename: 'parlay_legs', policyname: 'select_invited_parlay_legs', cmd: 'SELECT', qual: '(is_invited() OR is_admin())', with_check: null },
  { tablename: 'parlays', policyname: 'select_invited_parlays', cmd: 'SELECT', qual: '(is_invited() OR is_admin())', with_check: null },
  {
    tablename: 'profiles',
    policyname: 'insert_own_profile',
    cmd: 'INSERT',
    qual: null,
    with_check:
      "((id = ( SELECT auth.uid() AS uid)) AND is_invited() AND (balance = 0) AND (is_admin = false) AND (lower(email) = lower((( SELECT auth.jwt() AS jwt) ->> 'email'::text))))",
  },
  { tablename: 'profiles', policyname: 'select_all_profiles', cmd: 'SELECT', qual: 'is_invited()', with_check: null },
  {
    tablename: 'task_completions',
    policyname: 'select_task_completions',
    cmd: 'SELECT',
    qual: "((profile_id = ( SELECT auth.uid() AS uid)) OR is_admin() OR ((status = 'approved'::text) AND is_invited()))",
    with_check: null,
  },
  { tablename: 'tasks', policyname: 'admin_insert_tasks', cmd: 'INSERT', qual: null, with_check: 'is_admin()' },
  { tablename: 'tasks', policyname: 'admin_update_tasks', cmd: 'UPDATE', qual: 'is_admin()', with_check: 'is_admin()' },
  { tablename: 'tasks', policyname: 'select_tasks', cmd: 'SELECT', qual: 'is_invited()', with_check: null },
]

// How Postgres prints `(select is_invited())`. `is_admin = false` in insert_own_profile is the
// column, so only a call with parentheses counts.
const WRAPPED_CALL = /\( SELECT (is_invited|is_admin)\(\) AS \1\)/g
const BARE_CALL = /\bis_(invited|admin)\(\)/

function unwrap(expression: string | null): string | null {
  return expression === null ? null : expression.replace(WRAPPED_CALL, '$1()')
}

function byName(a: { tablename: string; policyname: string }, b: { tablename: string; policyname: string }) {
  const left = `${a.tablename}.${a.policyname}`
  const right = `${b.tablename}.${b.policyname}`
  return left < right ? -1 : left > right ? 1 : 0
}

async function publicPolicies(): Promise<Policy[]> {
  const rows = await pgQuery<Policy>(
    "select tablename, policyname, cmd, permissive, roles::text[] as roles, qual, with_check from pg_policies where schemaname = 'public'",
  )
  return rows.sort(byName)
}

describe('access rules after 0033', () => {
  it('keeps every policy as it was, apart from the (select …) wraps', async () => {
    const policies = await publicPolicies()

    expect(
      policies.map((p) => ({
        tablename: p.tablename,
        policyname: p.policyname,
        cmd: p.cmd,
        qual: unwrap(p.qual),
        with_check: unwrap(p.with_check),
      })),
    ).toEqual([...BEFORE_0033].sort(byName))
    for (const p of policies) {
      expect(p.permissive).toBe('PERMISSIVE')
      expect(p.roles).toEqual(['authenticated'])
    }
  })

  it('calls is_invited() and is_admin() only inside a (select …), so each runs once per statement', async () => {
    const bare = (await publicPolicies()).flatMap((p) =>
      [p.qual, p.with_check]
        .filter((expression): expression is string => expression !== null)
        .filter((expression) => BARE_CALL.test(expression.replace(WRAPPED_CALL, '')))
        .map((expression) => `${p.tablename}.${p.policyname}: ${expression}`),
    )
    expect(bare).toEqual([])
  })
})
