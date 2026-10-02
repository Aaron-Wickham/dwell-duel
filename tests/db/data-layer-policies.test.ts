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

// pg_policies as the latest migration leaves them: 0032's policies, unchanged apart from 0033's
// (select …) wraps, plus 0035's new policy on activity_events, 0037's on cancelled_bets, and
// 0040's role changes (new profiles start as members; reviewers read every completion), and
// 0042's proof_attachments, 0043's market_edits, 0053's feed_reactions and market_comments, and
// 0057's push_subscriptions and notification_prefs, and 0061's cron_heartbeats, and 0073's
// unclaimed-only invite delete and caller-named invite insert, and 0103's market_categories.
const POLICIES_NOW: Expression[] = [
  { tablename: 'activity_events', policyname: 'select_activity_events', cmd: 'SELECT', qual: 'is_invited()', with_check: null },
  {
    tablename: 'allowed_emails',
    policyname: 'admin_delete_invites',
    cmd: 'DELETE',
    qual: '(is_admin() AND (claimed_by IS NULL))',
    with_check: null,
  },
  {
    tablename: 'allowed_emails',
    policyname: 'admin_insert_invites',
    cmd: 'INSERT',
    qual: null,
    with_check: '(is_admin() AND (invited_by = ( SELECT auth.uid() AS uid)))',
  },
  { tablename: 'allowed_emails', policyname: 'admin_select_invites', cmd: 'SELECT', qual: 'is_admin()', with_check: null },
  { tablename: 'bets', policyname: 'select_invited_bets', cmd: 'SELECT', qual: '(is_invited() OR is_admin())', with_check: null },
  { tablename: 'cancelled_bets', policyname: 'select_invited_cancelled_bets', cmd: 'SELECT', qual: '(is_invited() OR is_admin())', with_check: null },
  {
    tablename: 'coin_transactions',
    policyname: 'select_own_or_admin_transactions',
    cmd: 'SELECT',
    qual: '((profile_id = ( SELECT auth.uid() AS uid)) OR is_admin())',
    with_check: null,
  },
  { tablename: 'cron_heartbeats', policyname: 'select_cron_heartbeats_admin', cmd: 'SELECT', qual: "has_role('admin'::text)", with_check: null },
  {
    tablename: 'feed_reactions',
    policyname: 'delete_own_feed_reactions',
    cmd: 'DELETE',
    qual: '(profile_id = ( SELECT auth.uid() AS uid))',
    with_check: null,
  },
  {
    tablename: 'feed_reactions',
    policyname: 'insert_own_feed_reactions',
    cmd: 'INSERT',
    qual: null,
    with_check: '((profile_id = ( SELECT auth.uid() AS uid)) AND is_invited())',
  },
  { tablename: 'feed_reactions', policyname: 'select_feed_reactions', cmd: 'SELECT', qual: 'is_invited()', with_check: null },
  { tablename: 'market_categories', policyname: 'select_market_categories', cmd: 'SELECT', qual: 'is_invited()', with_check: null },
  {
    tablename: 'market_comments',
    policyname: 'insert_own_market_comments',
    cmd: 'INSERT',
    qual: null,
    with_check: '((profile_id = ( SELECT auth.uid() AS uid)) AND is_invited())',
  },
  { tablename: 'market_comments', policyname: 'select_market_comments', cmd: 'SELECT', qual: 'is_invited()', with_check: null },
  { tablename: 'market_edits', policyname: 'select_market_edits', cmd: 'SELECT', qual: 'is_invited()', with_check: null },
  { tablename: 'market_outcomes', policyname: 'select_market_outcomes', cmd: 'SELECT', qual: 'is_invited()', with_check: null },
  { tablename: 'market_resolutions', policyname: 'select_market_resolutions', cmd: 'SELECT', qual: 'is_invited()', with_check: null },
  { tablename: 'markets', policyname: 'select_markets', cmd: 'SELECT', qual: 'is_invited()', with_check: null },
  { tablename: 'notification_prefs', policyname: 'insert_own_notification_prefs', cmd: 'INSERT', qual: null, with_check: '(profile_id = ( SELECT auth.uid() AS uid))' },
  { tablename: 'notification_prefs', policyname: 'select_own_notification_prefs', cmd: 'SELECT', qual: '(profile_id = ( SELECT auth.uid() AS uid))', with_check: null },
  { tablename: 'notification_prefs', policyname: 'update_own_notification_prefs', cmd: 'UPDATE', qual: '(profile_id = ( SELECT auth.uid() AS uid))', with_check: '(profile_id = ( SELECT auth.uid() AS uid))' },
  { tablename: 'parlay_legs', policyname: 'select_invited_parlay_legs', cmd: 'SELECT', qual: '(is_invited() OR is_admin())', with_check: null },
  { tablename: 'parlays', policyname: 'select_invited_parlays', cmd: 'SELECT', qual: '(is_invited() OR is_admin())', with_check: null },
  {
    tablename: 'profiles',
    policyname: 'insert_own_profile',
    cmd: 'INSERT',
    qual: null,
    with_check:
      "((id = ( SELECT auth.uid() AS uid)) AND is_invited() AND (balance = 0) AND (role = 'member'::text) AND (lower(email) = lower((( SELECT auth.jwt() AS jwt) ->> 'email'::text))))",
  },
  {
    tablename: 'proof_attachments',
    policyname: 'select_proof_attachments',
    cmd: 'SELECT',
    qual: "(((task_completion_id IS NOT NULL) AND (EXISTS ( SELECT 1\n   FROM task_completions c\n  WHERE ((c.id = proof_attachments.task_completion_id) AND ((c.profile_id = ( SELECT auth.uid() AS uid)) OR has_role('reviewer'::text)))))) OR ((resolution_id IS NOT NULL) AND is_invited()))",
    with_check: null,
  },
  { tablename: 'profiles', policyname: 'select_all_profiles', cmd: 'SELECT', qual: 'is_invited()', with_check: null },
  {
    tablename: 'task_completions',
    policyname: 'select_task_completions',
    cmd: 'SELECT',
    qual: "((profile_id = ( SELECT auth.uid() AS uid)) OR has_role('reviewer'::text) OR ((status = 'approved'::text) AND is_invited()))",
    with_check: null,
  },
  // No insert policy since 0067: save_push_subscription is the only writer.
  { tablename: 'push_subscriptions', policyname: 'delete_own_push_subscriptions', cmd: 'DELETE', qual: '(profile_id = ( SELECT auth.uid() AS uid))', with_check: null },
  { tablename: 'push_subscriptions', policyname: 'select_own_push_subscriptions', cmd: 'SELECT', qual: '(profile_id = ( SELECT auth.uid() AS uid))', with_check: null },
  { tablename: 'tasks', policyname: 'admin_insert_tasks', cmd: 'INSERT', qual: null, with_check: 'is_admin()' },
  { tablename: 'tasks', policyname: 'admin_update_tasks', cmd: 'UPDATE', qual: 'is_admin()', with_check: 'is_admin()' },
  { tablename: 'tasks', policyname: 'select_tasks', cmd: 'SELECT', qual: 'is_invited()', with_check: null },
]

// How Postgres prints `(select is_invited())` or `(select has_role('reviewer'))`.
const WRAPPED_CALL = /\( SELECT ((is_invited|is_admin)\(\)|has_role\('[a-z]+'::text\)) AS (is_invited|is_admin|has_role)\)/g
const BARE_CALL = /\b(is_invited|is_admin|has_role)\(/

function unwrap(expression: string | null): string | null {
  return expression === null ? null : expression.replace(WRAPPED_CALL, '$1')
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
    ).toEqual([...POLICIES_NOW].sort(byName))
    for (const p of policies) {
      expect(p.permissive).toBe('PERMISSIVE')
      expect(p.roles).toEqual(['authenticated'])
    }
  })

  it('calls is_invited(), is_admin() and has_role() only inside a (select …), so each runs once per statement', async () => {
    const bare = (await publicPolicies()).flatMap((p) =>
      [p.qual, p.with_check]
        .filter((expression): expression is string => expression !== null)
        .filter((expression) => BARE_CALL.test(expression.replace(WRAPPED_CALL, '')))
        .map((expression) => `${p.tablename}.${p.policyname}: ${expression}`),
    )
    expect(bare).toEqual([])
  })
})
