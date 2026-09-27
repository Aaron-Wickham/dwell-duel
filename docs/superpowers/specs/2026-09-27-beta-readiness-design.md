# Beta readiness: polish, data hygiene and beta touches — design

**Date:** 2026-09-27
**Status:** approved, not yet implemented
**Sub-project 9, PR A.** Sub-project 9, "Beta readiness", ships in three steps:
- **PR A** (this spec): polish, data hygiene, the Beta badge and the feedback link.
- **PR B** (a later spec): scale follow-ups. The feed moves to an events table, and the markets list gets lighter during heavy betting.
- **Release:** tag `v0.1.0-beta` with release notes, and add the first wave of beta members to the invite list.

The user chose PR A first, so beta members see the finished app sooner.

## Goal

Before DwellDuel is called a beta, close the known rough edges:
- **404s:** a broken market link gets a real 404.
- **Live ranks:** ranks update live.
- **Tap targets:** every standalone link is a comfortable tap target.
- **Length limits:** text fields have limits, enforced by the database and explained in the form.
- **Startup check:** a missing setting fails loudly at startup.
- **Beta touches:** the app says it's a beta, and members have a one-tap way to send feedback.

## Non-goals

- Everything in PR B: the feed events table, and a lighter markets list.
- The release tag and member invites. They follow both PRs.
- Changing the splash screens or home-screen icon, which would need a reinstall to pick up new art.
- A feedback form or feedback storage. The user chose a `mailto:` link.
- Validating existing rows against the new length limits.

## Decisions (from the user)

- **Scope:** small polish, data hygiene and scale follow-ups, with scale split into PR B. For beta: a badge, a feedback link, a release tag and invites.
- **Feedback:** the user chose "Email you", to the Gmail address on the user's account.
- **Order:** polish and beta touches first.
- **Market 404:** use the member-page pattern, accepting that the market page loses its instant full-page skeleton.
- **Copy:** all pending copy from PRs C, native feel and PR A is approved as is.

## Design

### 1. Polish

**1a. A real 404 for broken market links.**
- **The problem:** `app/(app)/markets/[id]/loading.tsx` wraps the page in an implicit Suspense boundary. Its skeleton starts a 200 stream before the page's `isUuid` / `getMarket` check runs (`page.tsx:37-45`). So `notFound()` can only give a soft 404: a 200 status with `noindex`.
- **The fix:** follow `app/(app)/members/[id]/page.tsx`.
  - Delete `app/(app)/markets/[id]/loading.tsx`.
  - Nothing above the existence check may suspend. The page runs `isUuid(id)` and `getMarket(supabase, id)` first, and calls `notFound()` for a malformed or unknown id, before anything streams. The result is a real HTTP 404.
  - The heavy sections stream in behind `<Suspense>`, each with a skeleton that matches its final layout:
    - the chart
    - the bets list and its "Show more"
    - the outcomes card and bet form, with their slip and admin reads
  - Keep the fetches parallel. Once the market exists, the section reads start together, as today's `Promise.all` does.
- **Unchanged:**
  - the page's `<Page transition="drill-down">`, the back-swipe and `<LiveTables>`
  - every e2e-asserted string, role and count on the page
  - the `markets/loading.tsx` list skeleton
- **Why there's no `loading.tsx`:** add a one-line comment, as the member page has, so nobody puts it back.

**1b. Live ranks.** `lib/live/page-subscriptions.ts` gains an unfiltered `{ table: 'profiles' }`:
- in `home()`, alongside the existing entries
- in `member()`, replacing the `profiles id=eq.<memberId>` filter

Rank and member count (`getMemberStanding`) then refresh whenever any member's balance changes. The existing 400ms debounce and 2s maxWait bound the refresh rate. Update the pinned declarations test.

**1c. Tap targets.** These standalone links get a hit area at least 44px tall, using `inline-flex min-h-11 items-center` or an equivalent padded hit area. Their visual weight and underline stay as they are:
- `components/leaderboard/leaderboard-row.tsx:31` (member name)
- `app/(app)/admin/members/adjust-balance-form.tsx:30` (member name)
- `components/markets/market-card.tsx:86` (card title)
- `components/parlays/slip-pick.tsx:22` (pick's market title)
- `components/parlays/placed-parlay.tsx:47-49` (leg title)

Links inside a sentence are unchanged: `bet-list`, `pending-approvals`, `ledger-row`, `feed-item`, and "Review slip".

**1d. Dark-mode checkboxes and radios.** No change is expected. Every checkbox and radio uses `accent-primary`, and `color-scheme` flips with the theme. The visual check confirms it. If a native box is unreadable in dark mode, add the smallest token-based rule that fixes it.

### 2. Data hygiene

**2a. Length limits in the database** (`supabase/migrations/0034_text_length_limits.sql`, the only migration).

Each limit is a named CHECK constraint on `char_length(column)`, added `NOT VALID`:

| Table.column | Max |
|---|---|
| `markets.title` | 120 |
| `markets.description` | 1000 |
| `market_outcomes.label` | 60 |
| `tasks.title` | 120 |
| `tasks.description` | 1000 |
| `task_completions.review_note` | 500 |
| `allowed_emails.email` | 254 |
| `profiles.display_name` | 80 |

- **`NOT VALID`:** the constraints apply to every insert and update from now on, but existing rows aren't re-checked. So the migration can't fail on production data nobody has inspected.
- **Nullable columns:** a nullable column passes when it's null.
- **The balance-adjust reason:** it lives in the ledger's `meta` as JSON, not in a text column. So `adjust_balance` enforces its limit: it's recreated to raise `'reason too long'` when `char_length(p_reason) > 200`. It's a `create or replace` that keeps its grants, and nothing else about the function changes.

**2b. Friendly errors in the app.**
- **A shared helper.** `lib/forms/limits.ts` exports the limits as constants, `TEXT_LIMITS`, which the migration mirrors. It also exports `tooLong(label: string, max: number): string`, which returns `` `${label} can be at most ${max} characters.` ``.
- **Every form input** for these fields gets `maxLength={TEXT_LIMITS.x}`. That covers the market title, description and outcome labels; the task title and description; the review and rejection notes; the balance-adjust reason; and the invite email.
- **Every server action** writing these fields checks the length after trimming. When a field is too long, it returns the existing `{ formError, field }` shape with `tooLong(...)` and writes nothing. The existing `aria-invalid` / `aria-describedby` wiring then points at the error.
- **Outcome labels:** the message names the outcome, for example "Outcome 3 can be at most 60 characters."
- **Display name:** `lib/auth/create-own-profile.ts` trims a Google-supplied name to 80 characters before inserting, so sign-up never fails on a long name.

**2c. Settings check at startup.** `instrumentation.ts`, per `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/instrumentation.md`, exports `register()`. It calls `assertRequiredEnv()` from `lib/env/required.ts`:
- **Always required:** `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- **Also required in production** (`process.env.VERCEL_ENV === 'production'`): `SUPABASE_SERVICE_ROLE_KEY` and `CRON_SECRET`.
- **When anything is missing,** it throws one error naming every missing variable, for example "Missing required environment variables: CRON_SECRET". It never prints a value.
- **Environments:** tests, local development and Playwright need only the Supabase URL and key, which `.env.local` provides.

### 3. Beta touches

**3a. Beta badge.** `components/brand/beta-badge.tsx` renders a small pill reading "Beta".
- It uses tokens only, is legible in both themes, and has small uppercase tracking.
- It's a plain `<span>`, not a control.
- It renders next to `<Wordmark />` in both `AppNav` headers (`components/app-nav/app-nav.tsx:31, 143`), and under the symbol on the sign-in card (`app/(auth)/sign-in/page.tsx:11`).
- Where the wordmark sits inside a link, the badge sits outside the link, so the link's accessible name is unchanged. Check `e2e/*.spec.ts` for any locator on the wordmark or home link, and leave its name alone.

**3b. Feedback link.** Home's tile list (`components/home/home-tiles.tsx` via `app/(app)/(home)/page.tsx`) gains a last row: "Send feedback", with a message icon and the subtitle "Tell Aaron what’s working and what isn’t".
- It's a real `<a href="mailto:…">`. The address is in one constant, `FEEDBACK_EMAIL` in `lib/app-shell/feedback.ts`, set to the Gmail address on the user's account.
- The subject is "DwellDuel beta feedback".
- The body is pre-filled with `App version: <NEXT_PUBLIC_SW_VERSION>`, followed by a blank line. Build it with `encodeURIComponent`.
- The row takes the tile style: 44px or more, `no-underline`, and a chevron. The mail app opens outside DwellDuel, so it gets no `transitionTypes`.

## Copy (new, needs sign-off)

- "Beta"
- "Send feedback" / "Tell Aaron what’s working and what isn’t"
- Email subject: "DwellDuel beta feedback"
- The pattern "<Field> can be at most <N> characters.", for example "Title can be at most 120 characters." or "Outcome 3 can be at most 60 characters."

## Global constraints

- **Scope:** only what this spec lists.
- **One migration,** `0034`. It adds `NOT VALID` CHECKs, and it recreates `adjust_balance` with the reason limit and nothing else. No other change to coin-moving behaviour, and no change to access rules.
- **The e2e contract.** Every existing asserted string, role and count keeps resolving. The signed-out 307 is unchanged, and so is the member page's real 404. Existing specs may gain waits, never changed assertions.
- **UI conventions:**
  - tokens only, phone-first, 44px controls, real elements
  - reduced motion respected
  - links underlined unless they're styled as a control
  - errors shown inline with `aria-invalid` / `aria-describedby`

## Testing

- **DB:**
  - Each CHECK rejects a value one character over its limit and accepts one at the limit.
  - A pre-existing over-limit row survives the migration (`NOT VALID`), and updating it to a legal value works.
  - `adjust_balance` rejects a reason over 200 characters and still works under the limit.
- **Unit and jsdom:**
  - `tooLong` and `TEXT_LIMITS`.
  - Each action's too-long path: it returns the field error and doesn't call the RPC.
  - The display-name trim.
  - `assertRequiredEnv`: missing variables, present variables, production versus other environments, and that no value appears in the error.
  - `BetaBadge`, and its placement in `AppNav` and on sign-in.
  - The feedback tile's `mailto:` address, subject and body encoding.
  - The five links' `min-h-11` hit areas.
  - The pinned `page-subscriptions` for Home and the member page.
  - The market page sections' skeletons.
- **E2E** goes from 26 to 27, with no changed assertions. A new spec requests `/markets/<unknown uuid>` and `/markets/not-a-uuid` while signed in, and asserts HTTP 404 and the not-found page.

## Rollout

- **Before merging:** confirm that Vercel's production environment defines `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` and `CRON_SECRET`. Otherwise the new startup check stops production from booting. If that can't be verified from here, the user confirms it in the Vercel dashboard before merging.
- **On merge:** the Deploy Production Database workflow applies `0034`.
- **After deploy, check:**
  - a real 404 for a broken market link
  - the market page streams its sections
  - the Beta badge and the feedback tile
  - a too-long title is refused with the inline message
