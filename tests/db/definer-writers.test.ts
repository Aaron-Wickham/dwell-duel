import { describe, it, expect } from 'vitest'
import { pgQuery } from './pg-query'

// #288: a security definer function runs with its owner's rights, so the gate it checks is the
// only gate there is. Every one a signed-in member can call that writes checks is_invited() itself,
// or is listed here with the reason it doesn't need to. A new writer fails this test until it does
// one or the other.
//
// Role-gated: has_role() and is_admin() answer for a role only while its holder is invited (0068),
// so a function gated on a role in every branch needs no is_invited() of its own.
const ROLE_GATED = [
  'adjust_balance',
  'approve_task_completion',
  'delete_market',
  'delete_task',
  // Admin › Markets › Categories (0103).
  'merge_market_categories',
  'reject_task_completion',
  // Owner only (0093): gives a removed member their invite back.
  'reinvite_member',
  'remove_bet',
  'rename_market_category',
  'review_task_completions',
  'set_market_category_hidden',
  'set_member_role',
]
// Delegating: the write happens in resolve_market_core, which checks the invite on the creator's
// branch and a role on every other.
const DELEGATING: Record<string, string> = {
  resolve_market: 'resolve_market_core',
  resolve_over_under: 'resolve_market',
}

// Writes to a table, or through a public function (apply_coin_transaction, record_proof and the like).
const WRITES = String.raw`\m(insert\s+into|update\s+public\.|delete\s+from|perform\s+public\.)`

// These tests read function bodies as text. They prove a guard call is present, and (below) that the
// first one comes before the first write, with comments stripped. They don't prove the guard's result
// decides every path to the write: a function that computed is_invited() and then ignored it would
// pass. The behavioural tests (remove-member, void-market, roles, security-integrity) cover that for
// the functions that exist today; these catch a new writer that forgets the guard or checks it late.
const GUARD = /\b(is_invited|has_role|is_admin|my_role)\s*\(/i
const WRITE = /\b(insert\s+into|update\s+public\.|delete\s+from|perform\s+public\.)/i
const withoutComments = (src: string) => src.replace(/--[^\n]*/g, '')

describe('security definer writers', () => {
  it('check the invite themselves, or are role-gated or delegating by name', async () => {
    const rows = await pgQuery<{ proname: string; src: string }>(`
      select p.proname, p.prosrc as src
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.prosecdef
        and p.prokind = 'f'
        and p.prorettype <> 'trigger'::regtype
        and has_function_privilege('authenticated', p.oid, 'execute')
        and p.prosrc ~* '${WRITES}'
        and p.prosrc !~* '\\mis_invited\\s*\\('
      order by 1
    `)
    expect(rows.map((r) => r.proname)).toEqual([...ROLE_GATED, ...Object.keys(DELEGATING)].sort())

    for (const { proname, src } of rows) {
      if (proname in DELEGATING) {
        expect(src, proname).toMatch(new RegExp(String.raw`perform\s+public\.${DELEGATING[proname]}\s*\(`))
      } else {
        expect(src, proname).toMatch(/\b(has_role|is_admin)\s*\(/)
      }
    }
  })

  it('check their guard before their first write', async () => {
    const rows = await pgQuery<{ proname: string; src: string }>(`
      select p.proname, p.prosrc as src
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.prosecdef
        and p.prokind = 'f'
        and p.prorettype <> 'trigger'::regtype
        and has_function_privilege('authenticated', p.oid, 'execute')
        and p.prosrc ~* '${WRITES}'
      order by 1
    `)
    expect(rows.length).toBeGreaterThan(Object.keys(DELEGATING).length)

    for (const { proname, src } of rows) {
      if (proname in DELEGATING) continue
      const body = withoutComments(src)
      const guard = body.search(GUARD)
      const write = body.search(WRITE)
      expect(guard, `${proname} has a guard`).toBeGreaterThanOrEqual(0)
      expect(guard, `${proname} guards before it writes`).toBeLessThan(write)
    }
  })

  it('check the invite on the creator’s and author’s own branches', async () => {
    const rows = await pgQuery<{ proname: string; src: string }>(`
      select p.proname, p.prosrc as src
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname in ('resolve_market_core', 'can_resolve_market', 'void_market', 'update_market', 'delete_market_comment')
      order by 1
    `)
    expect(rows.map((r) => r.proname)).toEqual([
      'can_resolve_market',
      'delete_market_comment',
      'resolve_market_core',
      // Both overloads: the three-argument one (0073) and the one with a category (0103).
      'update_market',
      'update_market',
      'void_market',
    ])
    for (const { proname, src } of rows) {
      expect(src, proname).toMatch(/(= auth\.uid\(\)|auth\.uid\(\) = \w+) and public\.is_invited\(\)/)
    }
  })
})
