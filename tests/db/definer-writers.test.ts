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
  'reject_task_completion',
  'remove_bet',
  'review_task_completions',
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
      'update_market',
      'void_market',
    ])
    for (const { proname, src } of rows) {
      expect(src, proname).toMatch(/(= auth\.uid\(\)|auth\.uid\(\) = \w+) and public\.is_invited\(\)/)
    }
  })
})
