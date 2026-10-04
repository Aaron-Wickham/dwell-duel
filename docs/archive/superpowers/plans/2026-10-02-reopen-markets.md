# Change a market's close time, and reopen a closed market (#326)

Since LMSR (#331–#335) nothing is set at close: bets are final and parlay multipliers are fixed at
placement. So changing the close time only moves `close_at` and re-arms the closing alerts.

## Rules
- Who: the creator (while invited) or an admin, as `update_market`. Only while `status = 'open'`,
  before or after close, never once resolved or voided.
- The new close must be in the future (later or earlier). No upper limit, as `create_market` has none.
- Every change is logged in `market_edits` (`old_close_at`, `new_close_at`) and sets `edited_at`.
- A change clears the market's `push_log` and `push_attempts` rows for `resolve_reminder` and
  `market_alert`, so both alerts fire again at the new close.
- No push to bettors on reopen: it would need a new push kind, recipients function and setting.

## Files
- `supabase/migrations/0106_market_close_time.sql`: `market_edits.old_close_at` / `new_close_at`;
  a five-argument `update_market(…, p_close_at)`. The four-argument version stays for the old build.
- `lib/supabase/database.types.ts`: regenerated.
- `lib/markets/update-market.ts`: optional `close_at` and optional `category` fields.
- `lib/markets/market-edits.ts`: read the close columns.
- `lib/markets/weekly-close.ts`: `localInputValue`, an ISO time as a `datetime-local` value in a zone.
- `app/(app)/markets/[id]/edit-market-dialog.tsx`: a `mode` (`edit`, `category`, `reopen`), a
  close-time field for `edit` and `reopen`, and a confirm step when the close time changes.
- `app/(app)/markets/[id]/page.tsx`: the Reopen trigger on a closed market, close-time lines in Edited.
- Docs: AGENTS.md, ARCHITECTURE, HOW-IT-WORKS, CHANGELOG.

## Tests
- `tests/db/market-close-time.test.ts`: permissions, future-only, settled refusal, logging, alerts
  re-armed (`due_market_alerts`), `markets_to_resolve` drops it, non-admin resolve refused until it
  closes again, a pending parlay leg unaffected and settled at the later resolution, title and
  category edits unaffected, ledger checked after each.
- `tests/lib/markets/update-market-action.test.ts`: the action passes `p_close_at` and refuses a past one.
- `tests/lib/markets/weekly-close.test.ts`, `tests/components/edit-market-dialog.test.tsx`, `e2e/reopen-market.spec.ts`.
