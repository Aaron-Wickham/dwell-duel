import { expect } from 'vitest'
import { ledgerViolations } from './helpers'

// Kept apart from helpers.ts: the e2e global setup imports helpers.ts under Playwright, which
// can't load vitest.

type RaisedError = { code?: string; message: string } | null

/**
 * Asserts that a call failed for the expected reason. A bare `error` is not null passes just as
 * happily when the function is missing (PGRST202) or the setup was wrong, so a permission or
 * money-guard test names what it was refused for: the message a function raised (a string is
 * matched as a substring, a RegExp as a pattern), or the SQLSTATE of a policy or constraint together with its message (a code alone can't pass).
 */
export function expectError(
  error: RaisedError | undefined,
  expected: string | RegExp | { code?: string; message: string | RegExp },
  label?: string,
): void {
  const spec = typeof expected === 'string' || expected instanceof RegExp ? { message: expected } : expected
  expect(error, label ?? 'expected the call to fail').toBeTruthy()
  if (spec.code !== undefined) expect(error!.code, label).toBe(spec.code)
  if (typeof spec.message === 'string') expect(error!.message, label).toContain(spec.message)
  else expect(error!.message, label).toMatch(spec.message)
}

/** Fails if any money invariant is broken (see ledgerViolations in helpers.ts). */
export async function assertLedgerConsistent(): Promise<void> {
  expect(await ledgerViolations(), 'ledger invariants').toEqual([])
}
