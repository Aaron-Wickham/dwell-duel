# Design Pass — PR C: Charts and Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the Design Pass. This PR adds:
- the probability chart on market detail, and a compact version on every market card
- animated numbers for balances, odds and payouts
- success toasts
- a confirmation dialog before voiding a market
- a phone bet-slip drawer on market pages

It also removes two unused dependencies.

**Architecture:**
- **Chart data** is each outcome's pool share after every bet. A pure builder computes it on the server from the market's `bets` rows in time order. There is no new table and no migration.
- **Chart component:** a client `ProbabilityChart`, built on Recharts v3 through a copied shadcn/ui chart wrapper. It draws the series with Base UI's ToggleGroup for the time ranges.
- **Dialog and drawer:** Base UI's `AlertDialog` for the void confirmation and its `Drawer` for the phone bet slip. Neither renders anything until opened.
- **Toasts:** sonner. A `withSuccessToast` helper fires the toast once the action resolves without an error, so the toast still shows when the form unmounts on success.
- **Animated numbers:** NumberFlow, through an `AnimatedText` wrapper that keeps an exact screen-reader and text-match twin of every number.

**Tech Stack:**
- Next.js 16 (App Router) and TypeScript
- Tailwind CSS v4.3
- `recharts` ^3.10.1, `@base-ui/react` ^1.8.0, `@number-flow/react` ^0.6.2 and `sonner` ^2.0.8
- Supabase
- Vitest 4 with React Testing Library and jsdom
- Playwright

**Spec:** [`docs/superpowers/specs/2026-09-25-design-pass-design.md`](../specs/2026-09-25-design-pass-design.md), section "PR C — Charts and polish" (it records the drawer, toast, dialog and chart-placement decisions) and "Testing". The visual source is the handoff [`docs/design/app-redesign-handoff.md`](../../design/app-redesign-handoff.md) and the Claude Design canvas <https://claude.ai/artifact/DkowpVq9ZMm7Gn9rL4cTqw>: `project/ProbabilityChart.dc.html`, `project/MarketCard.dc.html`, and the `Market` and `MarketResolved` artboards. Every task below carries the values it needs.

**How this plan was checked:** all eight tasks were applied in order to a fresh copy of `main` (`ffcfdd8`). Lint was clean, `npx vitest run` passed 520 tests (DB tests included), the build passed, and Playwright passed 18/18. One step was not run: Task 8's pinned-CLI re-run, because it restarts the local Supabase.

## Global Constraints

- **Scope: PR C only.**
  - No migrations and no access-policy changes.
  - No change to any coin-moving SQL function or server action's failure shape.
  - The speed/scale/reliability work is a separate PR after this one.
- **Tokens, never raw colours.**
  - Chart series use `var(--s1)`…`var(--s6)` via `outcomeSeries` (`lib/markets/outcome-series.ts`). Yes is `s2` and No is `s1`; multiple-choice outcomes are numbered in order.
  - The overlay tokens come from Task 6 (`bg-scrim`, `shadow-overlay`).
  - `shadow-tab` is the only selected-segment shadow.
- **Breakpoints.** The design is phone-first. Type sizes and padding switch at `md:`, and multi-column grids at `lg:`.
- **Controls.**
  - Use real elements, each at least 44px tall.
  - Icon-only controls get an `aria-label`; decorative icons are `aria-hidden`.
  - A visually hidden suffix keeps its separating space outside the `sr-only` span.
  - Links are underlined by default. A link styled as a button, tab or tile carries `no-underline`.
- **Forms.**
  - Every submit button that posts a server action is a `FormSubmitButton`.
  - Server errors render inline as `<Message tone="error" id>`, wired to the input with `aria-invalid` and `aria-describedby`.
  - Errors are never toasts.
- **The e2e contract.**
  - Every string and role in `e2e/*.spec.ts` keeps resolving to the same number of elements.
  - Toast copy never contains an e2e-asserted string or substring.
  - The drawer and the dialog render no content until opened, so a desktop page never shows a second "Place parlay", "Stake (DC)" or "Void this market".
  - Animated numbers keep a plain-text twin, so `getByText` matches still work, e.g. `/Balance: \d+ DC/`, `Combined: 16.00×` and `Potential payout: 80 DC`.
- **The chart's accessible contract.**
  - With at least one bet, the plot is a single `role="img"` whose `aria-label` is `Chance over time. Now: {label} {pct}%, …`. Outcomes are in the reader's order (`created_at`, then `label`), and pct is `Math.round(share * 100)`.
  - With no bets, it shows the visible text "No bets yet — the chart starts with the first bet." and no `role="img"`.
- **E2E counts:** 15 before PR C. Task 3 brings it to 16, Task 6 to 17, and Task 7 to 18.
- **Dependencies.**
  - Install each new dependency in the task that first uses it: Task 2 installs `recharts` and `@base-ui/react`; Task 4 installs `@number-flow/react`.
  - `package.json` and `package-lock.json` are committed with that task.
  - Task 8 removes `vaul` and `@radix-ui/react-dialog`.
- **Where files live.** Presentational pieces go in `components/<area>/`. Forms and client pieces that import server actions stay beside their route. Tests go in `tests/components/`, `tests/lib/` and `tests/db/`.
- **Code style:** single quotes, no semicolons, comments only for a non-obvious why, and quoted `(app)` / `[id]` paths in shell commands.
- **Local Supabase must be running.** `npx vitest run` includes `tests/db/`, which wipes and reseeds it. Next.js 16 differs from older versions, so read `node_modules/next/dist/docs/` before anything Next-specific.

## Rulings this plan makes

- **Phone toasts sit at the top,** just under the top bar. Desktop toasts sit bottom-right. A bottom toast on phone would cover the "Slip (n)" button right after a pick is added.
- **Bulk approve/reject get no toast.** Their inline summary ("2 approved.") already announces the result, so a toast would be a double announcement. Row approve/reject do get one.
- **The void confirmation uses Base UI's `AlertDialog`,** the destructive-confirm pattern (role `alertdialog`, no dismiss on outside click). The spec said "Dialog", and this is its alert variant.
- **Placed-parlay lines and the placement confirmation don't animate.** Their numbers are matched verbatim by e2e and have no previous value to animate from.
- **The compact card chart shades closed and resolved markets,** as the mockup's markets list does.
- **The markets list reads chart bets in one request at today's size.** The reader pages past Supabase's 1,000-row cap, so no bets are silently dropped. The later speed PR adds limits.

---

## Task 1: Pool-share series builder and chart-bet readers

This task builds the data behind the chart, with nothing rendered yet. An outcome's chance at any moment is its share of the pool, so the series recomputes every outcome's share after each bet, from that market's `bets` rows in time order. It needs no new table and no migration: invited members can already read `bets` (`select_invited_bets`, migration 0030).

The builder and the range helpers are pure functions with exact expected series. The two readers are thin and get DB tests. Task 2's chart and Task 3's pages consume both.

**Files:**
- Create: `lib/markets/probability-series.ts`
- Create: `lib/markets/chart-bets.ts`
- Test: `tests/lib/markets/probability-series.test.ts`
- Test: `tests/db/chart-bets.test.ts`

**Interfaces:**
- Consumes: `SupabaseClient` from `@supabase/supabase-js`; the `bets` table (`id bigint`, `market_id`, `outcome_id`, `amount integer > 0`, `created_at timestamptz`); the DB fixtures in `tests/db/fixtures.ts` (`seedMembers`, `makeMember`, `clientFor`, `createTestMarket`, `ensureInvited`) and `serviceClient` from `tests/db/helpers.ts`
- Produces (Tasks 2 and 3 consume these exact signatures):
  - `lib/markets/probability-series.ts`, pure, no Supabase:
    ```ts
    export type ChartBet = { outcomeId: string; amount: number; createdAt: string }
    export type SeriesPoint = { t: number; shares: Record<string, number> }
    export type RangeKey = '1D' | '1W' | 'All'
    export const RANGE_MS: Record<Exclude<RangeKey, 'All'>, number> // 1D and 1W in ms; Task 2 reads it for the plot's start
    export function buildProbabilitySeries(outcomeIds: string[], bets: ChartBet[]): SeriesPoint[]
    export function sliceRange(points: SeriesPoint[], range: RangeKey, now: number): SeriesPoint[]
    export function availableRanges(points: SeriesPoint[], now: number): RangeKey[]
    ```
    - `buildProbabilitySeries` returns one point per bet, after applying that bet. `t` is epoch ms. `shares` has a key for every id in `outcomeIds` (0 for an outcome nobody has backed yet), and the shares sum to 1. There is no point before the first bet, so no bets means `[]`. Bets are sorted by time with a stable sort, so bets on the same instant keep the input order, which the readers make `created_at` then `id`. A bet on an outcome id that isn't listed is skipped.
    - `sliceRange` returns the points within `[now - range, now]`, plus a carried-in point at the range start that holds the last shares before it. It adds no carried-in point when nothing came before the range, or when a point already sits exactly on the start. `'All'` returns the input array itself.
    - `availableRanges`: `'1D'` only if a point falls in the last day; `'1W'` only if a point falls in the last week *and* at least one falls before the last day; `'All'` whenever there is at least one point. No points gives `[]`.
  - `lib/markets/chart-bets.ts`, RLS-bound readers:
    ```ts
    export async function getChartBets(supabase: SupabaseClient, marketId: string): Promise<ChartBet[]>
    export async function listChartBets(supabase: SupabaseClient, marketIds: string[]): Promise<Map<string, ChartBet[]>>
    ```
    - Both read `bets` ordered by `created_at` ascending, then `id` ascending, selecting only `market_id, outcome_id, amount, created_at`.
    - `listChartBets` reads every listed market in one query. Empty input returns an empty map without querying. Every requested id gets an entry, `[]` for a market with no bets (or none the session may see).
    - **Paging.** PostgREST caps every response at `max_rows` (1000, `supabase/config.toml`), and it doesn't raise an error. An oldest-first list cut at 1000 would silently drop the *newest* bets, and the chart's end values would stop matching the outcome rows. So both readers read in pages of 1000 with `.range()` until a short page comes back. At today's size that is a single request. The DB test proves the cap is real: without paging, it gets 1000 rows back instead of 1001.

**Why the shares are exact.** The expected series use amounts whose shares are exact binary fractions (1, 0.25, 0.75, 0.625, 0.375), so `toEqual` compares floats with no tolerance.

- [ ] **Step 1: Write the failing unit tests**

Create `tests/lib/markets/probability-series.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import {
  availableRanges,
  buildProbabilitySeries,
  sliceRange,
  type ChartBet,
  type SeriesPoint,
} from '@/lib/markets/probability-series'

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
const NOW = Date.parse('2026-09-25T12:00:00.000Z')

function bet(outcomeId: string, amount: number, createdAt: string): ChartBet {
  return { outcomeId, amount, createdAt }
}

function point(t: number, yes: number, no: number): SeriesPoint {
  return { t, shares: { yes, no } }
}

describe('buildProbabilitySeries', () => {
  it('has no points before the first bet', () => {
    expect(buildProbabilitySeries(['yes', 'no'], [])).toEqual([])
  })

  it("recomputes every outcome's pool share after each bet, in time order", () => {
    const series = buildProbabilitySeries(
      ['yes', 'no'],
      [
        bet('yes', 10, '2026-09-20T09:00:00.000Z'),
        bet('no', 30, '2026-09-21T09:00:00.000Z'),
        bet('yes', 40, '2026-09-22T09:00:00.000Z'),
      ],
    )
    expect(series).toEqual([
      { t: Date.parse('2026-09-20T09:00:00.000Z'), shares: { yes: 1, no: 0 } },
      { t: Date.parse('2026-09-21T09:00:00.000Z'), shares: { yes: 0.25, no: 0.75 } },
      { t: Date.parse('2026-09-22T09:00:00.000Z'), shares: { yes: 0.625, no: 0.375 } },
    ])
  })

  it('gives every listed outcome a share, including ones nobody has bet on', () => {
    const series = buildProbabilitySeries(
      ['tom', 'sarah', 'mia'],
      [bet('sarah', 20, '2026-09-20T09:00:00.000Z'), bet('tom', 60, '2026-09-20T10:00:00.000Z')],
    )
    expect(series).toEqual([
      { t: Date.parse('2026-09-20T09:00:00.000Z'), shares: { tom: 0, sarah: 1, mia: 0 } },
      { t: Date.parse('2026-09-20T10:00:00.000Z'), shares: { tom: 0.75, sarah: 0.25, mia: 0 } },
    ])
  })

  it('sorts bets that arrive out of time order', () => {
    const series = buildProbabilitySeries(
      ['yes', 'no'],
      [bet('no', 30, '2026-09-21T09:00:00.000Z'), bet('yes', 10, '2026-09-20T09:00:00.000Z')],
    )
    expect(series.map((p) => p.shares)).toEqual([
      { yes: 1, no: 0 },
      { yes: 0.25, no: 0.75 },
    ])
  })

  it('keeps the input order for bets placed at the same instant, one point per bet', () => {
    const at = '2026-09-20T09:00:00.000Z'
    const series = buildProbabilitySeries(['yes', 'no'], [bet('no', 10, at), bet('yes', 30, at)])
    expect(series).toEqual([
      { t: Date.parse(at), shares: { yes: 0, no: 1 } },
      { t: Date.parse(at), shares: { yes: 0.75, no: 0.25 } },
    ])
  })

  it('reads Postgres timestamps with microseconds and an offset', () => {
    const series = buildProbabilitySeries(['yes', 'no'], [bet('yes', 5, '2026-09-20T09:00:00.123456+00:00')])
    expect(series).toEqual([{ t: Date.parse('2026-09-20T09:00:00.123Z'), shares: { yes: 1, no: 0 } }])
  })

  it('ignores a bet on an outcome it was not given', () => {
    const series = buildProbabilitySeries(
      ['yes', 'no'],
      [bet('yes', 10, '2026-09-20T09:00:00.000Z'), bet('other', 90, '2026-09-20T10:00:00.000Z')],
    )
    expect(series).toEqual([{ t: Date.parse('2026-09-20T09:00:00.000Z'), shares: { yes: 1, no: 0 } }])
  })
})

describe('sliceRange', () => {
  const points = [
    point(NOW - 10 * DAY, 1, 0),
    point(NOW - 3 * DAY, 0.5, 0.5),
    point(NOW - 2 * HOUR, 0.25, 0.75),
  ]

  it("returns every point for 'All'", () => {
    expect(sliceRange(points, 'All', NOW)).toBe(points)
  })

  it('carries the last shares before the range in as a point at the range start', () => {
    expect(sliceRange(points, '1D', NOW)).toEqual([point(NOW - DAY, 0.5, 0.5), point(NOW - 2 * HOUR, 0.25, 0.75)])
    expect(sliceRange(points, '1W', NOW)).toEqual([
      point(NOW - 7 * DAY, 1, 0),
      point(NOW - 3 * DAY, 0.5, 0.5),
      point(NOW - 2 * HOUR, 0.25, 0.75),
    ])
  })

  it('adds no carried-in point when nothing came before the range', () => {
    const recent = [point(NOW - 2 * HOUR, 1, 0)]
    expect(sliceRange(recent, '1W', NOW)).toEqual(recent)
  })

  it('holds just the carried-in point when every bet is older than the range', () => {
    expect(sliceRange([point(NOW - 3 * DAY, 1, 0)], '1D', NOW)).toEqual([point(NOW - DAY, 1, 0)])
  })

  it('keeps a point exactly at the range start without carrying another in', () => {
    const edge = [point(NOW - 2 * DAY, 1, 0), point(NOW - DAY, 0.5, 0.5)]
    expect(sliceRange(edge, '1D', NOW)).toEqual([point(NOW - DAY, 0.5, 0.5)])
  })
})

describe('availableRanges', () => {
  it('offers nothing before the first bet', () => {
    expect(availableRanges([], NOW)).toEqual([])
  })

  it("offers only 'All' when every bet is more than a week old", () => {
    expect(availableRanges([point(NOW - 8 * DAY, 1, 0), point(NOW - 9 * DAY, 0.5, 0.5)], NOW)).toEqual(['All'])
  })

  it("offers '1D' and 'All' when every bet is from the last day", () => {
    expect(availableRanges([point(NOW - 3 * HOUR, 1, 0), point(NOW - HOUR, 0.5, 0.5)], NOW)).toEqual(['1D', 'All'])
  })

  it("offers '1W' and 'All' when the latest bet is days old but inside the week", () => {
    expect(availableRanges([point(NOW - 10 * DAY, 1, 0), point(NOW - 3 * DAY, 0.5, 0.5)], NOW)).toEqual(['1W', 'All'])
  })

  it('offers all three when bets span the last day, the week and before', () => {
    expect(
      availableRanges([point(NOW - 10 * DAY, 1, 0), point(NOW - 3 * DAY, 0.5, 0.5), point(NOW - HOUR, 0.25, 0.75)], NOW),
    ).toEqual(['1D', '1W', 'All'])
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/lib/markets/probability-series.test.ts`
Expected: FAIL with `Failed to resolve import "@/lib/markets/probability-series"`

- [ ] **Step 3: Write `lib/markets/probability-series.ts`**

```typescript
export type ChartBet = { outcomeId: string; amount: number; createdAt: string }
export type SeriesPoint = { t: number; shares: Record<string, number> }
export type RangeKey = '1D' | '1W' | 'All'

const DAY_MS = 24 * 60 * 60 * 1000
export const RANGE_MS: Record<Exclude<RangeKey, 'All'>, number> = { '1D': DAY_MS, '1W': 7 * DAY_MS }

export function buildProbabilitySeries(outcomeIds: string[], bets: ChartBet[]): SeriesPoint[] {
  const pools = new Map(outcomeIds.map((id) => [id, 0]))
  let total = 0
  // Array.prototype.sort is stable, so bets on the same instant keep the reader's id order.
  const ordered = bets
    .map((bet) => ({ bet, t: Date.parse(bet.createdAt) }))
    .sort((a, b) => a.t - b.t)

  const points: SeriesPoint[] = []
  for (const { bet, t } of ordered) {
    const pool = pools.get(bet.outcomeId)
    if (pool === undefined) continue
    pools.set(bet.outcomeId, pool + bet.amount)
    total += bet.amount
    const shares: Record<string, number> = {}
    for (const [id, amount] of pools) shares[id] = amount / total
    points.push({ t, shares })
  }
  return points
}

export function sliceRange(points: SeriesPoint[], range: RangeKey, now: number): SeriesPoint[] {
  if (range === 'All') return points
  const start = now - RANGE_MS[range]
  const inside = points.filter((p) => p.t >= start && p.t <= now)
  const before = points.filter((p) => p.t < start).at(-1)
  if (!before || inside[0]?.t === start) return inside
  return [{ t: start, shares: before.shares }, ...inside]
}

export function availableRanges(points: SeriesPoint[], now: number): RangeKey[] {
  if (points.length === 0) return []
  const within = (ms: number) => points.some((p) => p.t >= now - ms && p.t <= now)
  const ranges: RangeKey[] = []
  if (within(RANGE_MS['1D'])) ranges.push('1D')
  if (within(RANGE_MS['1W']) && points.some((p) => p.t < now - RANGE_MS['1D'])) ranges.push('1W')
  ranges.push('All')
  return ranges
}
```

- [ ] **Step 4: Run them to verify they pass**

Run: `npx vitest run tests/lib/markets/probability-series.test.ts`
Expected: PASS (17 tests)

- [ ] **Step 5: Write the failing DB tests for the readers**

Local Supabase must be running (`npm run db:start`). The 1001-row test inserts its bets directly with the service client: 1001 `place_bet` calls would take minutes, and the reader never looks at pools. The same-instant test rewrites `created_at` with the service client, so that only the `id` can order two of the bets.

Create `tests/db/chart-bets.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { serviceClient } from './helpers'
import { seedMembers, makeMember, clientFor, createTestMarket, ensureInvited, type Member } from './fixtures'
import { getChartBets, listChartBets } from '@/lib/markets/chart-bets'

let alice: Member
let bob: Member
let aliceClient: SupabaseClient
let bobClient: SupabaseClient

beforeEach(async () => {
  ;[alice, bob] = await seedMembers()
  aliceClient = await clientFor(alice)
  bobClient = await clientFor(bob)
  await ensureInvited(bobClient)
})

async function placeBet(client: SupabaseClient, marketId: string, outcomeId: string, amount: number) {
  const { error } = await client.rpc('place_bet', { p_market_id: marketId, p_outcome_id: outcomeId, p_amount: amount })
  if (error) throw error
}

describe('getChartBets', () => {
  it("reads every member's bets on the market, oldest first, and nothing from other markets", async () => {
    const market = await createTestMarket(aliceClient, ['Yes', 'No'])
    const other = await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'Other market' })
    await placeBet(aliceClient, market.marketId, market.outcomeIds[0], 10)
    await placeBet(bobClient, market.marketId, market.outcomeIds[1], 20)
    await placeBet(bobClient, other.marketId, other.outcomeIds[0], 5)

    const bets = await getChartBets(bobClient, market.marketId)
    expect(bets.map((b) => [b.outcomeId, b.amount])).toEqual([
      [market.outcomeIds[0], 10],
      [market.outcomeIds[1], 20],
    ])
    expect(Date.parse(bets[0].createdAt)).toBeLessThanOrEqual(Date.parse(bets[1].createdAt))
  })

  it('orders bets placed at the same instant by id', async () => {
    const market = await createTestMarket(aliceClient, ['Yes', 'No'])
    await placeBet(aliceClient, market.marketId, market.outcomeIds[0], 10)
    await placeBet(bobClient, market.marketId, market.outcomeIds[1], 20)
    await placeBet(aliceClient, market.marketId, market.outcomeIds[0], 30)
    // Put the last bet first in time, then tie the other two, so only the id can order them.
    const db = serviceClient()
    const { data: rows, error } = await db.from('bets').select('id').eq('market_id', market.marketId).order('id')
    if (error) throw error
    const at = '2026-09-20T09:00:00+00:00'
    for (const [id, createdAt] of [
      [rows[0].id, at],
      [rows[1].id, at],
      [rows[2].id, '2026-09-19T09:00:00+00:00'],
    ] as const) {
      const { error: updateErr } = await db.from('bets').update({ created_at: createdAt }).eq('id', id)
      if (updateErr) throw updateErr
    }

    const bets = await getChartBets(bobClient, market.marketId)
    expect(bets.map((b) => b.amount)).toEqual([30, 10, 20])
  })

  it('reads past the 1000-row response cap', async () => {
    const market = await createTestMarket(aliceClient, ['Yes', 'No'])
    const start = Date.parse('2026-09-01T00:00:00.000Z')
    // Inserted directly: 1001 place_bet calls would take minutes, and the reader never looks at pools.
    const rows = Array.from({ length: 1001 }, (_, i) => ({
      market_id: market.marketId,
      outcome_id: market.outcomeIds[i % 2],
      profile_id: alice.id,
      amount: i + 1,
      created_at: new Date(start + i * 60_000).toISOString(),
    }))
    const { error } = await serviceClient().from('bets').insert(rows)
    if (error) throw error

    const bets = await getChartBets(bobClient, market.marketId)
    expect(bets).toHaveLength(1001)
    expect(bets.at(-1)?.amount).toBe(1001)
  })

  it('is empty for an uninvited session', async () => {
    const market = await createTestMarket(aliceClient, ['Yes', 'No'])
    await placeBet(aliceClient, market.marketId, market.outcomeIds[0], 10)

    const carol = await makeMember('Carol')
    const carolClient = await clientFor(carol)
    expect(await getChartBets(carolClient, market.marketId)).toEqual([])
  })
})

describe('listChartBets', () => {
  it("groups each listed market's bets, oldest first, and gives a market with no bets an empty list", async () => {
    const first = await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'First' })
    const second = await createTestMarket(aliceClient, ['Tom', 'Sarah', 'Mia'], { title: 'Second' })
    const quiet = await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'Quiet' })
    const unlisted = await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'Unlisted' })
    await placeBet(aliceClient, first.marketId, first.outcomeIds[0], 10)
    await placeBet(bobClient, second.marketId, second.outcomeIds[2], 15)
    await placeBet(bobClient, first.marketId, first.outcomeIds[1], 20)
    await placeBet(aliceClient, second.marketId, second.outcomeIds[0], 25)
    await placeBet(aliceClient, unlisted.marketId, unlisted.outcomeIds[0], 5)

    const byMarket = await listChartBets(bobClient, [first.marketId, second.marketId, quiet.marketId])
    expect([...byMarket.keys()].sort()).toEqual([first.marketId, second.marketId, quiet.marketId].sort())
    expect(byMarket.get(first.marketId)?.map((b) => [b.outcomeId, b.amount])).toEqual([
      [first.outcomeIds[0], 10],
      [first.outcomeIds[1], 20],
    ])
    expect(byMarket.get(second.marketId)?.map((b) => [b.outcomeId, b.amount])).toEqual([
      [second.outcomeIds[2], 15],
      [second.outcomeIds[0], 25],
    ])
    expect(byMarket.get(quiet.marketId)).toEqual([])
    expect(byMarket.has(unlisted.marketId)).toBe(false)
  })

  it('returns an empty map for no markets', async () => {
    expect(await listChartBets(bobClient, [])).toEqual(new Map())
  })

  it("gives an uninvited session empty lists, never another member's bets", async () => {
    const market = await createTestMarket(aliceClient, ['Yes', 'No'])
    await placeBet(aliceClient, market.marketId, market.outcomeIds[0], 10)

    const carol = await makeMember('Carol')
    const carolClient = await clientFor(carol)
    expect(await listChartBets(carolClient, [market.marketId])).toEqual(new Map([[market.marketId, []]]))
  })
})
```

- [ ] **Step 6: Run them to verify they fail**

Run: `npx vitest run tests/db/chart-bets.test.ts`
Expected: FAIL with `Failed to resolve import "@/lib/markets/chart-bets"`

- [ ] **Step 7: Write `lib/markets/chart-bets.ts`**

```typescript
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ChartBet } from '@/lib/markets/probability-series'

// PostgREST caps every response at max_rows (1000, supabase/config.toml) without an error, and
// a truncated oldest-first list would drop the newest bets, so read in pages of that size.
const PAGE_SIZE = 1000

type BetRow = { market_id: string; outcome_id: string; amount: number; created_at: string }

async function readBets(supabase: SupabaseClient, marketIds: string[]): Promise<BetRow[]> {
  const rows: BetRow[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('bets')
      .select('market_id, outcome_id, amount, created_at')
      .in('market_id', marketIds)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1)
    if (error) throw error
    rows.push(...(data ?? []))
    if ((data ?? []).length < PAGE_SIZE) return rows
  }
}

function toChartBet(row: BetRow): ChartBet {
  return { outcomeId: row.outcome_id, amount: row.amount, createdAt: row.created_at }
}

export async function getChartBets(supabase: SupabaseClient, marketId: string): Promise<ChartBet[]> {
  return (await readBets(supabase, [marketId])).map(toChartBet)
}

export async function listChartBets(supabase: SupabaseClient, marketIds: string[]): Promise<Map<string, ChartBet[]>> {
  const byMarket = new Map<string, ChartBet[]>()
  if (marketIds.length === 0) return byMarket
  for (const id of marketIds) byMarket.set(id, [])
  for (const row of await readBets(supabase, marketIds)) byMarket.get(row.market_id)?.push(toChartBet(row))
  return byMarket
}
```

- [ ] **Step 8: Run them to verify they pass**

Run: `npx vitest run tests/db/chart-bets.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 9: Verify**

Run: `npm run lint && npx vitest run && npm run build`
Expected: all PASS. Nothing imports the new modules yet, so the build output is unchanged.

Run: `lsof -ti:3000 | xargs -r kill 2>/dev/null; npx playwright test`
Expected: 15 passed

- [ ] **Step 10: Commit**

```bash
git add lib/markets/probability-series.ts lib/markets/chart-bets.ts tests/lib/markets/probability-series.test.ts tests/db/chart-bets.test.ts
git commit -m "Add the pool-share series builder and chart-bet readers"
```

---

## Task 2: `ProbabilityChart`, the chart wrapper and the range control

This task builds the chart itself, tested on its own. Task 3 places it on market detail and on every `MarketCard`, so nothing renders it yet. It has:
- one `stepAfter` line per outcome, drawn by Recharts v3 through a copied-in shadcn/ui `chart` wrapper
- a crosshair tooltip, and end-of-line labels showing name and %
- the 1D / 1W / All ranges on a Base UI `ToggleGroup`, hidden when only one range applies
- closed-market shading ("Closed {day}" / "Resolved: {outcome}")
- a no-bets state and a compact card size
- an accessible text summary

**Files:**
- Modify: `package.json`, `package-lock.json` (add `recharts` and `@base-ui/react`)
- Create: `components/ui/chart.tsx`
- Create: `components/markets/probability-chart.tsx`
- Test: `tests/components/probability-chart.test.tsx`

**Interfaces:**
- Consumes:
  - Task 1: `SeriesPoint`, `RangeKey`, `RANGE_MS`, `sliceRange`, `availableRanges` (`lib/markets/probability-series.ts`)
  - the repo: `SERIES_BG` (`components/markets/outcome-row.tsx`), `formatDay` (`lib/markets/format-date.ts`), `Series` (`lib/markets/outcome-series.ts`), `cn` (`lib/utils.ts`)
  - `recharts` 3.10: `LineChart`, `Line`, `XAxis`, `YAxis`, `ReferenceArea`, `ReferenceLine`, `Tooltip`, `ResponsiveContainer` and `type TooltipContentProps`, all from `'recharts'`
  - `@base-ui/react` 1.8: `ToggleGroup` from `'@base-ui/react/toggle-group'` and `Toggle` from `'@base-ui/react/toggle'`
- Produces:
  - `components/ui/chart.tsx` (`'use client'`), a trimmed copy of shadcn/ui's Recharts v3 chart wrapper:
    - `type ChartConfig = Record<string, { label?: ReactNode; color?: string }>`
    - `ChartContainer({ config, initialDimension?, className, children, ...divProps })`: a `div[data-chart]` that sets `--color-<key>` for each config entry, around a `ResponsiveContainer`
    - `ChartTooltip`, which is Recharts' `Tooltip`
    - `ChartTooltipContent({ active, payload, label, labelFormatter?, valueFormatter?, className? })`: the mockup's tooltip card
  - `components/markets/probability-chart.tsx` (`'use client'`):
    ```ts
    export type ChartOutcome = { id: string; label: string; series: Series }
    export function ProbabilityChart(props: {
      outcomes: ChartOutcome[]
      points: SeriesPoint[]        // from buildProbabilitySeries, computed on the server
      now: number                  // epoch ms from the server, so server and client render the same ranges
      closedAt?: string | null     // ISO; when <= now, shade after it and label "Closed {day}"
      resolvedLabel?: string | null // when set, the shaded zone reads "Resolved: {label}"
      compact?: boolean            // MarketCard size: no axes, no range control, no tooltip, end dots only
    }): JSX.Element
    ```
  - **The accessible contract (Task 3's e2e relies on it).** With at least one point, in both full and compact mode, the plot is one `role="img"` element whose `aria-label` is `Chance over time. Now: {label} {pct}%, {label} {pct}%.`, listing the outcomes in the order given. For example: `Chance over time. Now: Yes 75%, No 25%.`. Each `pct` is `Math.round(share * 100)`, the same rounding `OutcomeRow` uses. Everything drawn inside that element is `aria-hidden`. With no points there is no `role="img"`, only the visible `<p>` "No bets yet — the chart starts with the first bet."

**Sizes and layout** (from `ProbabilityChart.dc.html`, the phone artboards' `height: 220, gutter: 76, labelSize: 20` and the desktop artboards' `height: 300, gutter: 128, labelSize: 26`):

| | Phone | From `md` | Compact |
|---|---|---|---|
| Plot height | 220px | 300px | 84px |
| Right gutter (end labels) | 76px | 128px | none |
| End-label % size | 20px | 26px | no labels, end dots only |
| Y-axis % labels in the gutter | hidden | 100/75/50/25/0% | none |
| Dashed grid lines | 100/75/50/25/0% | same | 50% only |
| X ticks | start, middle, end | five, evenly spaced | none |
| Line width / end dot / halo | 2.25 / 10px / 5px | same | 1.75 / 8px / 3px |

Above the plot, in full mode only, one row holds the bet count ("3 bets") on the left and the range control on the right (`min-h-11`, wrapping). The mockup's summary reads "80 DC pooled · 3 bets", but the fixed props carry shares, not amounts, so the chart shows only the count. The Outcomes card beside it already shows the pool.

**How time works on the x-axis.**
- **Numeric epoch domain.** The x-axis is `type="number"` over epoch ms, hidden. Ticks, grid, zone label, end dots and end labels are HTML overlays placed by percentage, using the same `start`/`end` as the axis domain. So they line up with the lines, and they render on the server before Recharts has measured anything.
- **Plot start.** `'All'` starts at the first bet, while 1D and 1W start at `now - RANGE_MS[range]`. `sliceRange`'s carried-in point sits exactly there, so the line starts at the left edge. A span under an hour is widened to an hour, so a single fresh bet still draws.
- **Extending to now.** `stepAfter` holds each value until the next point. The chart appends one synthetic row at `lineEnd`, copying the last shares, so the final step runs flat to the right edge. `lineEnd` is `now` for an open market and `closedAt` once it has closed. Points with the same `t` collapse to the last one, which is the state after all of them.
- **Closed markets.** When `closedAt <= now`, a Recharts `ReferenceArea` fills from the close to the plot's end in `var(--sunk)`, under the lines. A dashed 2px `ReferenceLine` in `var(--line-s)` marks the close. An HTML label sits top-left in the zone, so long outcome names wrap. On `'All'`, the plot's end is `min(now, lineEnd + span × 0.14 / 0.86)`, so the zone always takes the mockup's 14% of the width (`xmax: 0.86`) however long ago the market closed. The last tick then sits at the close, showing its date instead of "Now". A closed market opens on `'All'`, because nothing moves after the close. An open one opens on 1W when that's offered, otherwise on `'All'`, which matches the mockup's `initial`.
- **Labels.** Ticks are times ("3:30 PM", "9 AM") when the drawn span is 36 hours or less, and dates ("Sep 18") otherwise. The last tick of an open market is "Now". The tooltip reads "Thu 3:30 PM" or "Sep 18, 6 PM" in the same way, and "Now" on the final row.
- **Time zones.** The server can't know the viewer's zone. So `useTimeZone` (`useSyncExternalStore`, the same trick as `LocalTime`) formats in UTC on the server and in the browser's zone after hydration, with no hydration mismatch.

**Colours in both themes.** Each outcome's config entry is `{ label, color: 'var(--s<N>)' }`, keyed `o0`, `o1`, and so on. `ChartContainer` writes `--color-o0: var(--s2)` scoped to its own `[data-chart]`, and each `Line` strokes `var(--color-o0)`. `--s1`…`--s6` already switch under `[data-theme="dark"]` and `prefers-color-scheme`, so the lines follow the theme with no per-theme config. That is why the copy drops shadcn's `theme` option. The HTML pieces use literal classes (`bg-s2`, `text-s2`, `ring-s2/22`) from lookup maps, so Tailwind sees every class name. The zone is `var(--sunk)`, the crosshair and zone edge `var(--line-s)`, and the active-dot ring `var(--surface)`.

**Recharts in the browser and in jsdom.**
- `ChartContainer` gets `initialDimension={{ width: -1, height: -1 }}`. `ResponsiveContainer` then renders nothing until it has measured a positive size, which it does with `getBoundingClientRect` in an effect and a `ResizeObserver` after that. So the server never renders an SVG at a guessed width that would jump, or overflow a phone, on hydration.
- `LineChart` gets `accessibilityLayer={false}`, because Recharts 3 otherwise makes the surface `tabindex="0"`. A focusable element inside a `role="img"` is hidden from assistive tech. The tooltip is pointer-only, as in the mockup, and the text summary carries the current state.
- `[&_.recharts-surface]:overflow-visible` stops a line at exactly 0% or 100% losing half its stroke.
- jsdom has no layout, so the test file stubs `ResizeObserver` and mocks `HTMLElement.prototype.getBoundingClientRect` to 600×300. Recharts then draws real paths, and the tests assert their coordinates. Recharts applies mouse moves on the next animation frame, so the hover test waits with `findByText`.

**The range control.** It is a Base UI `ToggleGroup` (`role="group"`, `aria-label="Time range"`) of `Toggle` buttons (`aria-pressed`, `data-pressed`), styled as the mockup's segmented control: `bg-sunk` track, 44px-tall segments, pressed `bg-surface text-ink shadow-tab`. In single mode, pressing the pressed toggle again would leave the group empty. `onValueChange` ignores an empty value, so one range always stays selected.

**End labels.** Each outcome's label (name 13px bold, % in 20px or 26px) sits in the gutter at its line's height. `spreadLabels` pushes labels apart to a 40px gap on phones and 48px from `md`, kept 20px inside the plot. On the mockup's sample (40/25/20/15% at 300px) it reproduces the artboard's exact tops: 136, 184, 232 and 280px. Tops are computed for both heights and applied as `top-(--label-top) md:top-(--label-top-md)`, so no measuring is needed.

**Copy** (new, for sign-off): "1 bet" / "{n} bets", "Time range" (the group's accessible name), "Closed {day}", "Resolved: {label}", and "Now" (last tick and tooltip). "No bets yet — the chart starts with the first bet." is handoff copy, used verbatim. None of these contain an e2e-asserted string.

- [ ] **Step 1: Install the packages**

Run: `npm install recharts@^3.10.1 @base-ui/react@^1.8.0`
Expected: `package.json` gains `"@base-ui/react": "^1.8.0"` and `"recharts": "^3.10.1"`, with no peer-dependency warnings (Recharts' `react-is` peer is already satisfied).

- [ ] **Step 2: Write the failing tests**

Create `tests/components/probability-chart.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { render, screen, within, fireEvent } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import userEvent from '@testing-library/user-event'
import { ProbabilityChart, type ChartOutcome } from '@/components/markets/probability-chart'
import type { SeriesPoint } from '@/lib/markets/probability-series'

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
const NOW = Date.parse('2026-09-25T12:00:00.000Z')
const WIDTH = 600
const HEIGHT = 300

const yesNo: ChartOutcome[] = [
  { id: 'yes', label: 'Yes', series: 2 },
  { id: 'no', label: 'No', series: 1 },
]

function point(t: number, yes: number, no: number): SeriesPoint {
  return { t, shares: { yes, no } }
}

// Bets on both sides of the last day and the last week, so every range is offered.
const spread = [point(NOW - 10 * DAY, 1, 0), point(NOW - 3 * DAY, 0.5, 0.5), point(NOW - 2 * HOUR, 0.75, 0.25)]

// Recharts renders nothing until ResponsiveContainer measures a positive size, and jsdom has no layout.
beforeAll(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: WIDTH,
    bottom: HEIGHT,
    width: WIDTH,
    height: HEIGHT,
    toJSON: () => ({}),
  } as DOMRect)
})

afterAll(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('ProbabilityChart', () => {
  it('names the chart with a text summary of the current chances', () => {
    render(<ProbabilityChart outcomes={yesNo} points={spread} now={NOW} />)
    expect(screen.getByRole('img', { name: 'Chance over time. Now: Yes 75%, No 25%.' })).toBeInTheDocument()
  })

  it('draws one stepped line per outcome', () => {
    const { container } = render(<ProbabilityChart outcomes={yesNo} points={spread} now={NOW} />)
    const lines = container.querySelectorAll('.recharts-line-curve')
    expect(lines).toHaveLength(2)
    expect(lines[0]).toHaveAttribute('stroke', 'var(--color-o0)')
    expect(lines[1]).toHaveAttribute('stroke', 'var(--color-o1)')
    expect(container.querySelector('style')?.textContent).toContain('--color-o0: var(--s2);')
  })

  it("carries the last value flat to now, so the line ends at the plot's right edge", () => {
    const { container } = render(<ProbabilityChart outcomes={yesNo} points={spread} now={NOW} />)
    const d = container.querySelector('.recharts-line-curve')?.getAttribute('d')
    // The default range is 1W: Yes's carried-in 100% starts at x=0, and its 75% runs flat to the right edge.
    expect(d).toMatch(new RegExp(`^M0,0L.*L${WIDTH},75$`))
  })

  it('labels the end of each line with its name and chance', () => {
    render(<ProbabilityChart outcomes={yesNo} points={spread} now={NOW} />)
    expect(screen.getByText('Yes').parentElement).toHaveTextContent(/^Yes75%$/)
    expect(screen.getByText('No').parentElement).toHaveTextContent(/^No25%$/)
  })

  it('counts the bets above the chart', () => {
    render(<ProbabilityChart outcomes={yesNo} points={spread} now={NOW} />)
    expect(screen.getByText('3 bets')).toBeInTheDocument()
  })

  it('offers 1D, 1W and All with 1W pressed, and switches range on click', async () => {
    const user = userEvent.setup()
    render(<ProbabilityChart outcomes={yesNo} points={spread} now={NOW} />)
    const group = screen.getByRole('group', { name: 'Time range' })
    const buttons = within(group).getAllByRole('button')
    expect(buttons.map((b) => b.textContent)).toEqual(['1D', '1W', 'All'])
    expect(within(group).getByRole('button', { name: '1W' })).toHaveAttribute('aria-pressed', 'true')

    await user.click(within(group).getByRole('button', { name: '1D' }))
    expect(within(group).getByRole('button', { name: '1D' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(group).getByRole('button', { name: '1W' })).toHaveAttribute('aria-pressed', 'false')

    // Pressing the selected range again keeps it selected rather than leaving no range.
    await user.click(within(group).getByRole('button', { name: '1D' }))
    expect(within(group).getByRole('button', { name: '1D' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('shows time ticks for a day, date ticks for longer, and ends on Now', async () => {
    const user = userEvent.setup()
    const { container } = render(<ProbabilityChart outcomes={yesNo} points={spread} now={NOW} />)
    const tickRow = () => [...container.querySelectorAll('.mr-\\[76px\\] span')].map((s) => s.textContent)
    // The browser render uses the machine's time zone, so these check the label shapes rather than exact times.
    expect(tickRow()).toHaveLength(5)
    expect(tickRow().at(-1)).toBe('Now')
    expect(tickRow()[0]).toMatch(/^[A-Z][a-z]{2} \d{1,2}$/)

    await user.click(screen.getByRole('button', { name: '1D' }))
    expect(tickRow().at(-1)).toBe('Now')
    expect(tickRow()[0]).toMatch(/^\d{1,2}(:\d{2})?\s[AP]M$/)
  })

  it('hides the range control when only one range applies', () => {
    render(<ProbabilityChart outcomes={yesNo} points={[point(NOW - 10 * DAY, 1, 0)]} now={NOW} />)
    expect(screen.queryByRole('group', { name: 'Time range' })).not.toBeInTheDocument()
    expect(screen.getByText('1 bet')).toBeInTheDocument()
  })

  it('shows a crosshair tooltip with the time and every chance on hover', async () => {
    const { container } = render(<ProbabilityChart outcomes={yesNo} points={spread} now={NOW} />)
    const wrapper = container.querySelector('.recharts-wrapper') as HTMLElement
    fireEvent.mouseMove(wrapper, { clientX: WIDTH - 1, clientY: 100 })
    const tooltip = container.querySelector('.recharts-tooltip-wrapper') as HTMLElement
    // Recharts applies mouse moves on the next animation frame.
    expect(await within(tooltip).findByText('Now')).toBeInTheDocument()
    expect(within(tooltip).getByText('Yes')).toBeInTheDocument()
    expect(within(tooltip).getByText('75%')).toBeInTheDocument()
    expect(within(tooltip).getByText('25%')).toBeInTheDocument()
    expect(container.querySelector('.recharts-tooltip-cursor')).toBeInTheDocument()
  })

  it('shades after the close and labels it with the close day', () => {
    const closedAt = new Date(NOW - 5 * DAY).toISOString()
    const { container } = render(
      <ProbabilityChart outcomes={yesNo} points={[point(NOW - 12 * DAY, 1, 0), point(NOW - 6 * DAY, 0.4, 0.6)]} now={NOW} closedAt={closedAt} />,
    )
    expect(screen.getByText('Closed Sep 20')).toBeInTheDocument()
    expect(container.querySelector('.recharts-reference-area')).toBeInTheDocument()
    // A closed market opens on All, where the close sits 86% of the way across and Yes's line stops there at 40%.
    expect(container.querySelector('.recharts-line-curve')?.getAttribute('d')).toMatch(/L51[56](\.\d+)?,180$/)
    expect(screen.queryByRole('group', { name: 'Time range' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('img', { name: 'Chance over time. Now: Yes 40%, No 60%.' })).toBeInTheDocument()
  })

  it('labels a resolved market with its winning outcome', () => {
    render(
      <ProbabilityChart
        outcomes={yesNo}
        points={[point(NOW - 12 * DAY, 1, 0), point(NOW - 6 * DAY, 0.4, 0.6)]}
        now={NOW}
        closedAt={new Date(NOW - 5 * DAY).toISOString()}
        resolvedLabel="Yes"
      />,
    )
    expect(screen.getByText('Resolved: Yes')).toBeInTheDocument()
    expect(screen.queryByText(/^Closed/)).not.toBeInTheDocument()
  })

  it('does not shade a market that has not closed yet', () => {
    const { container } = render(
      <ProbabilityChart outcomes={yesNo} points={spread} now={NOW} closedAt={new Date(NOW + DAY).toISOString()} />,
    )
    expect(container.querySelector('.recharts-reference-area')).not.toBeInTheDocument()
    expect(screen.queryByText(/^Closed/)).not.toBeInTheDocument()
  })

  it('says so when there are no bets, with no chart, ranges or summary image', () => {
    const { container } = render(<ProbabilityChart outcomes={yesNo} points={[]} now={NOW} />)
    expect(screen.getByText('No bets yet — the chart starts with the first bet.')).toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(screen.queryByRole('group')).not.toBeInTheDocument()
    expect(container.querySelector('.recharts-wrapper')).not.toBeInTheDocument()
  })

  it('draws the compact card chart with no axes, ranges, tooltip or end labels', () => {
    const { container } = render(<ProbabilityChart outcomes={yesNo} points={spread} now={NOW} compact />)
    expect(screen.getByRole('img', { name: 'Chance over time. Now: Yes 75%, No 25%.' })).toBeInTheDocument()
    expect(container.querySelectorAll('.recharts-line-curve')).toHaveLength(2)
    expect(screen.queryByRole('group')).not.toBeInTheDocument()
    expect(screen.queryByText('75%')).not.toBeInTheDocument()
    expect(screen.queryByText('Now')).not.toBeInTheDocument()
    expect(screen.queryByText('3 bets')).not.toBeInTheDocument()

    fireEvent.mouseMove(container.querySelector('.recharts-wrapper') as HTMLElement, { clientX: WIDTH - 1, clientY: 40 })
    expect(container.querySelector('.recharts-tooltip-wrapper')).not.toBeInTheDocument()
  })

  it('server-renders the summary and labels in UTC, leaving the lines until the browser can measure', () => {
    const html = renderToString(
      <ProbabilityChart
        outcomes={yesNo}
        points={[point(NOW - 12 * DAY, 1, 0), point(NOW - 6 * DAY, 0.4, 0.6)]}
        now={NOW}
        closedAt="2026-09-20T23:30:00.000Z"
      />,
    )
    expect(html).toContain('aria-label="Chance over time. Now: Yes 40%, No 60%."')
    expect(html).toContain('Closed Sep 20')
    expect(html).not.toContain('recharts-line-curve')
  })

  it('never puts a focusable element inside the summary image', () => {
    render(<ProbabilityChart outcomes={yesNo} points={spread} now={NOW} />)
    expect(screen.getByRole('img').querySelector('[tabindex="0"]')).toBeNull()
  })
})
```

- [ ] **Step 3: Run them to verify they fail**

Run: `npx vitest run tests/components/probability-chart.test.tsx`
Expected: FAIL with `Failed to resolve import "@/components/markets/probability-chart"`

- [ ] **Step 4: Write `components/ui/chart.tsx`**

This is shadcn/ui's Recharts v3 `chart.tsx`, adapted: single quotes, no semicolons, our tokens instead of shadcn's, and trimmed to what the chart uses. The legend and the per-theme colour option are gone. The generated id is stripped to `[a-zA-Z0-9_-]`, and the style selector quotes it, because React 19's `useId` output isn't a safe bare CSS identifier.

```tsx
'use client'

// Adapted from the shadcn/ui chart component (Recharts v3), copied in rather than installed.
// Our colour tokens already switch with the theme, so the per-theme colour option is gone.
import { createContext, useContext, useId, type ComponentProps, type ReactNode } from 'react'
import * as RechartsPrimitive from 'recharts'
import type { TooltipContentProps } from 'recharts'
import { cn } from '@/lib/utils'

export type ChartConfig = Record<string, { label?: ReactNode; color?: string }>

const ChartContext = createContext<{ config: ChartConfig } | null>(null)

function useChart() {
  const context = useContext(ChartContext)
  if (!context) throw new Error('useChart must be used within a <ChartContainer />')
  return context
}

export function ChartContainer({
  id,
  className,
  children,
  config,
  initialDimension = { width: 320, height: 200 },
  ...props
}: ComponentProps<'div'> & {
  config: ChartConfig
  children: ComponentProps<typeof RechartsPrimitive.ResponsiveContainer>['children']
  initialDimension?: { width: number; height: number }
}) {
  const uniqueId = useId()
  const chartId = `chart-${(id ?? uniqueId).replace(/[^a-zA-Z0-9_-]/g, '')}`

  return (
    <ChartContext.Provider value={{ config }}>
      <div
        data-slot="chart"
        data-chart={chartId}
        className={cn(
          'flex justify-center text-xs [&_.recharts-layer]:outline-hidden [&_.recharts-surface]:overflow-visible [&_.recharts-surface]:outline-hidden',
          className,
        )}
        {...props}
      >
        <ChartStyle id={chartId} config={config} />
        <RechartsPrimitive.ResponsiveContainer initialDimension={initialDimension}>{children}</RechartsPrimitive.ResponsiveContainer>
      </div>
    </ChartContext.Provider>
  )
}

function ChartStyle({ id, config }: { id: string; config: ChartConfig }) {
  const colors = Object.entries(config).filter(([, item]) => item.color)
  if (!colors.length) return null
  return (
    <style
      dangerouslySetInnerHTML={{
        __html: `[data-chart="${id}"] {\n${colors.map(([key, item]) => `  --color-${key}: ${item.color};`).join('\n')}\n}`,
      }}
    />
  )
}

export const ChartTooltip = RechartsPrimitive.Tooltip

export function ChartTooltipContent({
  active,
  payload,
  label,
  labelFormatter,
  valueFormatter,
  className,
}: Partial<Pick<TooltipContentProps<number, string>, 'active' | 'payload' | 'label'>> & {
  labelFormatter?: (label: string | number | undefined) => ReactNode
  valueFormatter?: (value: number) => ReactNode
  className?: string
}) {
  const { config } = useChart()
  if (!active || !payload?.length) return null

  return (
    <div
      className={cn(
        'flex min-w-[150px] flex-col gap-1.5 rounded-control border border-line bg-surface px-3 py-2.5 text-ink shadow-card',
        className,
      )}
    >
      <span className="whitespace-nowrap text-xs font-bold text-ink2">{labelFormatter ? labelFormatter(label) : label}</span>
      {payload.map((item) => {
        const key = String(item.dataKey ?? item.name)
        const value = Number(item.value)
        return (
          <div key={key} className="flex items-center gap-2 text-sm">
            <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
            <span className="grow">{config[key]?.label ?? item.name}</span>
            <strong className="tabular-nums">{valueFormatter ? valueFormatter(value) : value}</strong>
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 5: Write `components/markets/probability-chart.tsx`**

```tsx
'use client'

import { useState, useSyncExternalStore, type CSSProperties } from 'react'
import { Line, LineChart, ReferenceArea, ReferenceLine, XAxis, YAxis } from 'recharts'
import { Toggle } from '@base-ui/react/toggle'
import { ToggleGroup } from '@base-ui/react/toggle-group'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import { SERIES_BG } from '@/components/markets/outcome-row'
import { formatDay } from '@/lib/markets/format-date'
import type { Series } from '@/lib/markets/outcome-series'
import { RANGE_MS, availableRanges, sliceRange, type RangeKey, type SeriesPoint } from '@/lib/markets/probability-series'
import { cn } from '@/lib/utils'

export type ChartOutcome = { id: string; label: string; series: Series }

const SERIES_TEXT: Record<Series, string> = {
  1: 'text-s1',
  2: 'text-s2',
  3: 'text-s3',
  4: 'text-s4',
  5: 'text-s5',
  6: 'text-s6',
}

const SERIES_HALO: Record<Series, string> = {
  1: 'ring-s1/22',
  2: 'ring-s2/22',
  3: 'ring-s3/22',
  4: 'ring-s4/22',
  5: 'ring-s5/22',
  6: 'ring-s6/22',
}

const HOUR_MS = 60 * 60 * 1000
const MIN_SPAN_MS = HOUR_MS
const TIME_TICKS_UNDER_MS = 36 * HOUR_MS
// The mockup gives a closed market's shaded zone 14% of the plot, however long ago it closed.
const ZONE_SHARE = 0.14
const TICK_FRACTIONS = [0, 0.25, 0.5, 0.75, 1]
const GRID = [100, 75, 50, 25, 0]
// Plot heights and label spacing per breakpoint, from the phone and desktop artboards.
const PHONE = { height: 220, gap: 40 }
const DESKTOP = { height: 300, gap: 48 }
const LABEL_PAD = 20
const EMPTY_TEXT = 'No bets yet — the chart starts with the first bet.'

type Row = { t: number } & Record<string, number>

const subscribe = () => () => {}

// The server can't know the viewer's time zone, so it formats in UTC and the browser re-renders in local time.
function useTimeZone(): string | undefined {
  return useSyncExternalStore(
    subscribe,
    () => undefined,
    () => 'UTC',
  )
}

function formatTime(t: number, timeZone?: string): string {
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone }).format(t).replace(':00', '')
}

function formatWeekday(t: number, timeZone?: string): string {
  return new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone }).format(t)
}

function percent(share: number | undefined): number {
  return Math.round((share ?? 0) * 100)
}

// Nothing moves after the close, so a closed market opens on its whole history.
function initialRange(ranges: RangeKey[], closed: boolean): RangeKey {
  return !closed && ranges.includes('1W') ? '1W' : 'All'
}

// Pushes end labels apart so they never overlap, keeping each as close to its line as it can.
function spreadLabels(targets: number[], height: number, gap: number): number[] {
  const min = LABEL_PAD
  const max = height - LABEL_PAD
  const step = targets.length > 1 ? Math.min(gap, (max - min) / (targets.length - 1)) : 0
  const order = targets.map((y, index) => ({ y, index })).sort((a, b) => a.y - b.y)
  const ys: number[] = []
  let previous = -Infinity
  for (const { y } of order) {
    previous = Math.max(y, min, previous + step)
    ys.push(previous)
  }
  let next = Infinity
  for (let k = ys.length - 1; k >= 0; k--) {
    ys[k] = Math.min(ys[k], max, next - step)
    next = ys[k]
  }
  const tops: number[] = []
  order.forEach(({ index }, k) => {
    tops[index] = ys[k]
  })
  return tops
}

export function ProbabilityChart({
  outcomes,
  points,
  now,
  closedAt = null,
  resolvedLabel = null,
  compact = false,
}: {
  outcomes: ChartOutcome[]
  points: SeriesPoint[]
  now: number
  closedAt?: string | null
  resolvedLabel?: string | null
  compact?: boolean
}) {
  const timeZone = useTimeZone()
  const ranges = availableRanges(points, now)
  const closedMs = closedAt ? Date.parse(closedAt) : null
  const closed = closedMs !== null && closedMs <= now
  const [picked, setPicked] = useState<RangeKey>(() => initialRange(ranges, closed))
  const range = !compact && ranges.includes(picked) ? picked : initialRange(ranges, closed)

  const plotRight = compact ? 'right-0' : 'right-[76px] md:right-[128px]'
  const boxHeight = compact ? 'h-[84px]' : 'h-[220px] md:h-[300px]'
  const grid = compact ? [50] : GRID

  const gridLines = grid.map((p) => (
    <div key={p} aria-hidden="true" className="absolute inset-x-0 border-t border-dashed border-line" style={{ top: `${100 - p}%` }} />
  ))

  const last = points.at(-1)
  if (!last) {
    return (
      <div className={cn('relative', boxHeight)}>
        <div className={cn('absolute inset-y-0 left-0', plotRight)}>
          {gridLines}
          <p
            className={cn(
              'absolute inset-0 flex items-center justify-center px-4 text-center font-bold text-ink2',
              compact ? 'text-xs' : 'text-sm',
            )}
          >
            {EMPTY_TEXT}
          </p>
        </div>
      </div>
    )
  }

  const visible = sliceRange(points, range, now)
  const lastVisibleT = visible.at(-1)?.t ?? last.t
  const lineEnd = Math.max(closed ? closedMs : now, lastVisibleT)
  let start = range === 'All' ? (visible[0]?.t ?? last.t) : now - RANGE_MS[range]
  let end = now
  if (range === 'All' && closed) end = Math.min(now, lineEnd + ((lineEnd - start) * ZONE_SHARE) / (1 - ZONE_SHARE))
  if (end - start < MIN_SPAN_MS) start = end - MIN_SPAN_MS
  const xPercent = (t: number) => Math.min(100, Math.max(0, ((t - start) / (end - start)) * 100))

  const keys = outcomes.map((_, index) => `o${index}`)
  const config: ChartConfig = Object.fromEntries(
    outcomes.map((outcome, index) => [keys[index], { label: outcome.label, color: `var(--s${outcome.series})` }]),
  )

  const rows: Row[] = []
  for (const point of visible) {
    const row: Row = { t: point.t }
    outcomes.forEach((outcome, index) => {
      row[keys[index]] = (point.shares[outcome.id] ?? 0) * 100
    })
    if (rows.at(-1)?.t === point.t) rows[rows.length - 1] = row
    else rows.push(row)
  }
  const lastRow = rows.at(-1)
  if (lastRow && lastRow.t < lineEnd) rows.push({ ...lastRow, t: lineEnd })

  const summary = `Chance over time. Now: ${outcomes.map((o) => `${o.label} ${percent(last.shares[o.id])}%`).join(', ')}.`
  const zoneLabel = resolvedLabel ? `Resolved: ${resolvedLabel}` : closedAt ? `Closed ${formatDay(closedAt, timeZone)}` : ''

  const span = lineEnd - start
  const formatTick = (t: number) => (span <= TIME_TICKS_UNDER_MS ? formatTime(t, timeZone) : formatDay(new Date(t).toISOString(), timeZone))
  const formatHover = (t: number) => {
    if (t === lineEnd && !closed) return 'Now'
    if (span <= TIME_TICKS_UNDER_MS) return `${formatWeekday(t, timeZone)} ${formatTime(t, timeZone)}`
    return `${formatDay(new Date(t).toISOString(), timeZone)}, ${formatTime(t, timeZone)}`
  }
  const ticks = TICK_FRACTIONS.map((fraction, index) => {
    const t = start + fraction * (lineEnd - start)
    const left = xPercent(t)
    return {
      key: fraction,
      label: index === TICK_FRACTIONS.length - 1 && !closed ? 'Now' : formatTick(t),
      left,
      shift: index === 0 ? '' : left >= 95 ? '-translate-x-full' : '-translate-x-1/2',
      // Five labels overlap in a phone-width plot, so phones keep the start, middle and end.
      phone: index % 2 === 0,
    }
  })

  const phoneTops = spreadLabels(outcomes.map((o) => (1 - (last.shares[o.id] ?? 0)) * PHONE.height), PHONE.height, PHONE.gap)
  const desktopTops = spreadLabels(
    outcomes.map((o) => (1 - (last.shares[o.id] ?? 0)) * DESKTOP.height),
    DESKTOP.height,
    DESKTOP.gap,
  )

  return (
    <div className="flex flex-col gap-3">
      {!compact && (
        <div className="flex min-h-11 flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-ink2">{points.length === 1 ? '1 bet' : `${points.length} bets`}</p>
          {ranges.length > 1 && (
            <ToggleGroup
              aria-label="Time range"
              value={[range]}
              onValueChange={(value) => {
                if (value[0]) setPicked(value[0])
              }}
              className="flex gap-0.5 rounded-control bg-sunk p-[3px]"
            >
              {ranges.map((key) => (
                <Toggle
                  key={key}
                  value={key}
                  className="min-h-11 min-w-[52px] cursor-pointer rounded-[9px] px-3 text-sm font-extrabold text-ink2 data-pressed:bg-surface data-pressed:text-ink data-pressed:shadow-tab"
                >
                  {key}
                </Toggle>
              ))}
            </ToggleGroup>
          )}
        </div>
      )}
      <div className={cn('relative', boxHeight)}>
        <div role="img" aria-label={summary} className={cn('absolute inset-y-0 left-0', plotRight, !compact && 'cursor-crosshair')}>
          {gridLines}
          <ChartContainer config={config} initialDimension={{ width: -1, height: -1 }} className="absolute inset-0" aria-hidden="true">
            <LineChart data={rows} margin={{ top: 0, right: 0, bottom: 0, left: 0 }} accessibilityLayer={false}>
              <XAxis dataKey="t" type="number" domain={[start, end]} hide />
              <YAxis type="number" domain={[0, 100]} hide />
              {closed && <ReferenceArea x1={closedMs} x2={end} fill="var(--sunk)" fillOpacity={1} stroke="none" />}
              {closed && <ReferenceLine x={closedMs} stroke="var(--line-s)" strokeWidth={2} strokeDasharray="6 4" />}
              {!compact && (
                <ChartTooltip
                  isAnimationActive={false}
                  position={{ y: 8 }}
                  offset={14}
                  cursor={{ stroke: 'var(--line-s)', strokeWidth: 1.5 }}
                  content={<ChartTooltipContent labelFormatter={(t) => formatHover(Number(t))} valueFormatter={(v) => `${Math.round(v)}%`} />}
                />
              )}
              {keys.map((key) => (
                <Line
                  key={key}
                  dataKey={key}
                  type="stepAfter"
                  stroke={`var(--color-${key})`}
                  strokeWidth={compact ? 1.75 : 2.25}
                  strokeLinejoin="round"
                  dot={false}
                  activeDot={compact ? false : { r: 6, fill: `var(--color-${key})`, stroke: 'var(--surface)', strokeWidth: 2 }}
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ChartContainer>
          {closed && zoneLabel && (
            <span
              aria-hidden="true"
              className="absolute top-2 right-1 text-xs leading-tight font-extrabold text-ink2"
              style={{ left: `calc(${xPercent(closedMs)}% + 8px)` }}
            >
              {zoneLabel}
            </span>
          )}
          {outcomes.map((outcome) => (
            <span
              key={outcome.id}
              aria-hidden="true"
              className={cn(
                'absolute -translate-1/2 rounded-full',
                SERIES_BG[outcome.series],
                SERIES_HALO[outcome.series],
                compact ? 'size-2 ring-3' : 'size-2.5 ring-5',
              )}
              style={{ left: `${xPercent(lineEnd)}%`, top: `${100 - (last.shares[outcome.id] ?? 0) * 100}%` }}
            />
          ))}
        </div>
        {!compact && (
          <div aria-hidden="true" className="absolute inset-y-0 right-0 w-[76px] md:w-[128px]">
            {outcomes.map((outcome, index) => (
              <div
                key={outcome.id}
                className={cn(
                  'absolute left-3.5 top-(--label-top) -translate-y-1/2 leading-[1.05] md:top-(--label-top-md)',
                  SERIES_TEXT[outcome.series],
                )}
                style={{ '--label-top': `${phoneTops[index]}px`, '--label-top-md': `${desktopTops[index]}px` } as CSSProperties}
              >
                <div className="text-[13px] font-bold">{outcome.label}</div>
                <div className="text-xl font-extrabold tracking-[-0.02em] tabular-nums md:text-[26px]">
                  {percent(last.shares[outcome.id])}%
                </div>
              </div>
            ))}
            {GRID.map((p) => (
              <span
                key={p}
                className="absolute right-0 hidden -translate-y-1/2 text-[11px] font-bold text-ink2 md:block"
                style={{ top: `${100 - p}%` }}
              >
                {p}%
              </span>
            ))}
          </div>
        )}
      </div>
      {!compact && (
        <div aria-hidden="true" className="relative mr-[76px] h-5 text-xs font-bold text-ink2 md:mr-[128px]">
          {ticks.map((tick) => (
            <span
              key={tick.key}
              className={cn('absolute top-0 whitespace-nowrap', tick.shift, !tick.phone && 'hidden md:block')}
              style={{ left: `${tick.left}%` }}
            >
              {tick.label}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 6: Run them to verify they pass**

Run: `npx vitest run tests/components/probability-chart.test.tsx`
Expected: PASS (16 tests)

- [ ] **Step 7: Verify**

Run: `npm run lint && npx vitest run && npm run build`
Expected: all PASS. Nothing renders the chart yet, so the build output is unchanged.

Run: `lsof -ti:3000 | xargs -r kill 2>/dev/null; npx playwright test`
Expected: 15 passed

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json components/ui/chart.tsx components/markets/probability-chart.tsx tests/components/probability-chart.test.tsx
git commit -m "Add ProbabilityChart with ranges, tooltip, end labels and closed-zone shading"
```

---

## Task 3: Wire the chart into the market detail page and every `MarketCard`

This task has no new pure logic of its own — it wires Task 1's series builder and
readers, and Task 2's `ProbabilityChart`, into the two pages that show markets. The
market detail page gets a full-size "Chance over time" `SectionCard`, positioned as
in `Market--{phone,desktop}-light.html` and `MarketResolved--{phone,desktop}-light`
(above "Outcomes", in its own row). Every `MarketCard` on the markets list gets a
compact chart, matching `MarketCard.html`'s layout (chart above the outcome list).

**Files:**
- Modify (rewrite): `components/markets/market-card.tsx`
- Modify (rewrite): `app/(app)/markets/page.tsx`
- Modify (rewrite): `app/(app)/markets/[id]/page.tsx`
- Test: `tests/components/market-card.test.tsx` (add cases)
- Test: `e2e/charts.spec.ts` (create)

**Interfaces:**
- Consumes:
  - Task 1, `lib/markets/probability-series.ts`: `type SeriesPoint`, `buildProbabilitySeries(outcomeIds, bets): SeriesPoint[]`
  - Task 1, `lib/markets/chart-bets.ts`: `getChartBets(supabase, marketId): Promise<ChartBet[]>`, `listChartBets(supabase, marketIds): Promise<Map<string, ChartBet[]>>`
  - Task 2, `components/markets/probability-chart.tsx`: `ProbabilityChart`, `type ChartOutcome`
  - The repo: `listMarkets` / `MarketSummary` (`lib/markets/list-markets.ts`), `getMarket` / `getMarketBets` (`lib/markets/get-market.ts`), `computeOdds` (`lib/markets/odds.ts`), `outcomeSeries` (`lib/markets/outcome-series.ts`), `marketCardStatus` (`lib/markets/market-status.ts`), the existing `MarketCard`, `SectionCard`
- Produces:
  - `MarketCardProps` (`components/markets/market-card.tsx`) gains one new field:
    ```ts
    export interface MarketCardChart {
      outcomes: ChartOutcome[]
      points: SeriesPoint[]
      now: number
    }
    // added to MarketCardProps:
    chart?: MarketCardChart
    ```
    `MarketCard` renders
    ```tsx
    <ProbabilityChart
      outcomes={chart.outcomes}
      points={chart.points}
      now={chart.now}
      closedAt={closeAt}
      resolvedLabel={status === 'resolved' ? resolvedOutcomeLabel : null}
      compact
    />
    ```
    only when `chart` is given and the card already has bets (`outcomes.some(o => o.pct !== null)`), directly above the existing percentage list. With no bets there's nothing to chart, so the existing pills + "no bets yet" branch is untouched and no chart renders.
  - `e2e/charts.spec.ts`: a market with a bet shows its chart, by accessible name, on both the market page and its list card.

**Chart placement, decided from the mockup.** On `Market--desktop-light.html`, the left column of the two-column grid stacks `Chance over time`, then `Outcomes`, then `Bets`; the right column (`Place a bet` / `Resolve market`) spans all three rows. `Market--phone-light.html` stacks the same three left-column cards in the same order, in document order, with the bet/resolve cards in between (unchanged from PR B — this task doesn't touch that ordering, only inserts the chart card before `Outcomes`). The existing `lg:grid-rows-[auto_1fr]` becomes `lg:grid-rows-[auto_auto_1fr]`: the chart is row 1, `Outcomes` moves to row 2, `Bets` moves to row 3, and the right-hand column becomes `lg:row-span-3`.

**`now` and `closedAt`/`resolvedLabel`, decided from Task 2's interface.** Both pages compute `points` on the server with `buildProbabilitySeries`, and pass `now` as a single `Date.now()` read, per the interface note. Confirmed in a scratch copy (`npx eslint` against a throwaway file) that `Date.now()` needs the `// eslint-disable-next-line react-hooks/purity` comment the codebase already uses for `isPastClose`, but `new Date(someVariable)` and `someDate.getTime()` do not — so both pages take exactly one disabled `Date.now()` read and derive everything else from that number, avoiding a second impure call. `closedAt` is always the market's `closeAt` (the component itself only shades when it's `<= now`), and `resolvedLabel` is the market's `resolvedOutcomeLabel` only when its status is `'resolved'` (null for open, awaiting and voided, so a voided market shows the plain "Closed {date}" shading, not a resolution label it doesn't have).

**Compact charts shade too.** The markets list's mockup (`Markets--{phone,desktop}-light.html`, and the sample card data in `MarketCard.html`) shades closed/resolved compact charts the same way the full chart does, so `MarketCard`'s compact `ProbabilityChart` gets `closedAt` and `resolvedLabel` with exactly the same rule as the detail page — sourced from the card's own already-existing `closeAt`, `status` and `resolvedOutcomeLabel` props, not from anything new added to `MarketCardChart` (which stays just `outcomes`/`points`/`now`, the data Task 1 computes; `closedAt`/`resolvedLabel` are derived per-render from props already on the card, like the detail page derives them from `market`).

- [ ] **Step 1: Write the failing `MarketCard` chart tests**

Rewrite `tests/components/market-card.test.tsx` in full — the existing four tests are unchanged, and a `vi.mock` plus two new tests are added. The mock stands in for Task 2's `ProbabilityChart`: this file tests that `MarketCard` wires the right props to the right slot, not the chart's own rendering (that's `tests/components/probability-chart.test.tsx` in Task 2):

```typescript
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MarketCard } from '@/components/markets/market-card'

vi.mock('@/components/markets/probability-chart', () => ({
  ProbabilityChart: (props: {
    outcomes: { label: string }[]
    points: unknown[]
    now: number
    closedAt?: string | null
    resolvedLabel?: string | null
    compact?: boolean
  }) => (
    <div
      data-testid="chart"
      data-compact={String(!!props.compact)}
      data-now={props.now}
      data-points={props.points.length}
      data-closed-at={props.closedAt ?? ''}
      data-resolved-label={props.resolvedLabel ?? ''}
    >
      {props.outcomes.map((o) => o.label).join(',')}
    </div>
  ),
}))

describe('MarketCard', () => {
  it('shows an open market\'s status, meta line, title link and outcome percentages', () => {
    const { container } = render(
      <MarketCard
        id="m1"
        title="Who wins the chili cook-off?"
        status="open"
        kind="multiple_choice"
        closeAt="2026-10-04T16:30:00.000Z"
        resolvedAt={null}
        outcomes={[
          { id: 'a', label: 'Tom', pct: 60 },
          { id: 'b', label: 'Sarah', pct: 40 },
        ]}
        resolvedOutcomeLabel={null}
      />,
    )
    expect(screen.getByText('Open')).toBeInTheDocument()
    expect(container.textContent).toContain('Closes')
    expect(container.querySelector('time')).toHaveAttribute('datetime', '2026-10-04T16:30:00.000Z')
    expect(screen.getByRole('link', { name: 'Who wins the chili cook-off?' })).toHaveAttribute('href', '/markets/m1')
    expect(screen.getByText('60%')).toBeInTheDocument()
    expect(screen.getByText('40%')).toBeInTheDocument()
    expect(screen.queryByText('no bets yet')).not.toBeInTheDocument()
  })

  it('shows outcome pills and "no bets yet" when nothing has been staked', () => {
    render(
      <MarketCard
        id="m2"
        title="Who brings the best dessert?"
        status="awaiting"
        kind="multiple_choice"
        closeAt="2026-09-30T12:00:00.000Z"
        resolvedAt={null}
        outcomes={[
          { id: 'a', label: 'Grace', pct: null },
          { id: 'b', label: 'Josh', pct: null },
        ]}
        resolvedOutcomeLabel={null}
      />,
    )
    expect(screen.getByText('Awaiting resolution')).toBeInTheDocument()
    expect(screen.getByText('Grace')).toBeInTheDocument()
    expect(screen.getByText('Josh')).toBeInTheDocument()
    expect(screen.getByText('no bets yet')).toBeInTheDocument()
  })

  it('shows the resolved winner line when the market has a winning outcome', () => {
    const { container } = render(
      <MarketCard
        id="m3"
        title="Did it rain on the picnic?"
        status="resolved"
        kind="binary"
        closeAt="2026-09-21T09:00:00.000Z"
        resolvedAt="2026-09-21T09:05:00.000Z"
        outcomes={[
          { id: 'a', label: 'Yes', pct: 70 },
          { id: 'b', label: 'No', pct: 30 },
        ]}
        resolvedOutcomeLabel="Yes"
      />,
    )
    // The chip and the meta line ("Resolved <time>") both read "Resolved" as their own text.
    expect(screen.getAllByText('Resolved')).toHaveLength(2)
    expect(container.querySelector('time')).toHaveAttribute('datetime', '2026-09-21T09:05:00.000Z')
    expect(screen.getByText('Winning outcome: Yes')).toBeInTheDocument()
  })

  it('draws a colour dot before each outcome, coloured by its series, and hides it from screen readers', () => {
    const { container } = render(
      <MarketCard
        id="m4"
        title="Did it rain on the picnic?"
        status="open"
        kind="binary"
        closeAt="2026-09-21T09:00:00.000Z"
        resolvedAt={null}
        outcomes={[
          { id: 'a', label: 'Yes', pct: 70 },
          { id: 'b', label: 'No', pct: 30 },
        ]}
        resolvedOutcomeLabel={null}
      />,
    )
    const dots = container.querySelectorAll('li span[aria-hidden="true"].size-2\\.5')
    expect(dots).toHaveLength(2)
    // Binary markets always colour Yes as series 2 and No as series 1, regardless of row order.
    expect(dots[0]).toHaveClass('bg-s2')
    expect(dots[1]).toHaveClass('bg-s1')
  })

  it('renders a compact chart above the outcome list when bets exist and chart data is given', () => {
    const { container } = render(
      <MarketCard
        id="m5"
        title="Will the charts render?"
        status="open"
        kind="binary"
        closeAt="2026-10-04T16:30:00.000Z"
        resolvedAt={null}
        outcomes={[
          { id: 'a', label: 'Yes', pct: 70 },
          { id: 'b', label: 'No', pct: 30 },
        ]}
        resolvedOutcomeLabel={null}
        chart={{
          outcomes: [
            { id: 'a', label: 'Yes', series: 2 as const },
            { id: 'b', label: 'No', series: 1 as const },
          ],
          points: [{ t: 1000, shares: { a: 0.7, b: 0.3 } }],
          now: 2000,
        }}
      />,
    )
    const chart = screen.getByTestId('chart')
    expect(chart).toHaveAttribute('data-compact', 'true')
    expect(chart).toHaveAttribute('data-now', '2000')
    expect(chart).toHaveAttribute('data-points', '1')
    expect(chart).toHaveAttribute('data-closed-at', '2026-10-04T16:30:00.000Z')
    expect(chart).toHaveAttribute('data-resolved-label', '')
    expect(chart).toHaveTextContent('Yes,No')
    // The chart sits before the percentage list, matching MarketCard.html.
    const article = container.querySelector('article')!
    const chartIndex = Array.from(article.children).findIndex((el) => el.contains(chart))
    const listIndex = Array.from(article.children).findIndex((el) => el.tagName === 'UL')
    expect(chartIndex).toBeLessThan(listIndex)
  })

  it('passes the close time and winning outcome to a resolved market\'s compact chart', () => {
    render(
      <MarketCard
        id="m7"
        title="Did it rain on the picnic?"
        status="resolved"
        kind="binary"
        closeAt="2026-09-21T09:00:00.000Z"
        resolvedAt="2026-09-21T09:05:00.000Z"
        outcomes={[
          { id: 'a', label: 'Yes', pct: 70 },
          { id: 'b', label: 'No', pct: 30 },
        ]}
        resolvedOutcomeLabel="Yes"
        chart={{
          outcomes: [
            { id: 'a', label: 'Yes', series: 2 as const },
            { id: 'b', label: 'No', series: 1 as const },
          ],
          points: [{ t: 1000, shares: { a: 0.7, b: 0.3 } }],
          now: 2000,
        }}
      />,
    )
    const chart = screen.getByTestId('chart')
    expect(chart).toHaveAttribute('data-closed-at', '2026-09-21T09:00:00.000Z')
    expect(chart).toHaveAttribute('data-resolved-label', 'Yes')
  })

  it('omits the chart when there is no chart data, even with bets', () => {
    render(
      <MarketCard
        id="m6"
        title="Will the charts render?"
        status="open"
        kind="binary"
        closeAt="2026-10-04T16:30:00.000Z"
        resolvedAt={null}
        outcomes={[
          { id: 'a', label: 'Yes', pct: 70 },
          { id: 'b', label: 'No', pct: 30 },
        ]}
        resolvedOutcomeLabel={null}
      />,
    )
    expect(screen.queryByTestId('chart')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/components/market-card.test.tsx`
Expected: FAIL. The two new tests fail because `MarketCardProps` has no `chart` field yet (`chart` is stripped by nothing — TypeScript will actually fail the whole file to compile: `Object literal may only specify known properties, and 'chart' does not exist in type 'IntrinsicAttributes & MarketCardProps'`), and the compact-chart test fails at `screen.getByTestId('chart')` with "Unable to find an element by \[data-testid=\"chart\"\]".

- [ ] **Step 3: Rewrite `components/markets/market-card.tsx`**

```typescript
import Link from 'next/link'
import { Trophy } from 'lucide-react'
import { cardClass } from '@/components/ui/card'
import { StatusChip } from '@/components/ui/status-chip'
import { LocalTime } from '@/components/ui/local-time'
import { SERIES_BG } from '@/components/markets/outcome-row'
import { ProbabilityChart, type ChartOutcome } from '@/components/markets/probability-chart'
import { outcomeSeries } from '@/lib/markets/outcome-series'
import type { SeriesPoint } from '@/lib/markets/probability-series'
import { cn } from '@/lib/utils'
import type { MarketCardStatus } from '@/lib/markets/market-status'

const STATUS_LABEL: Record<MarketCardStatus, string> = {
  open: 'Open',
  awaiting: 'Awaiting resolution',
  resolved: 'Resolved',
  voided: 'Voided',
}

const STATUS_TONE: Record<MarketCardStatus, 'open' | 'wait' | 'done' | 'lost' | 'void'> = {
  open: 'open',
  awaiting: 'wait',
  resolved: 'done',
  voided: 'void',
}

export interface MarketCardOutcome {
  id: string
  label: string
  pct: number | null
}

export interface MarketCardChart {
  outcomes: ChartOutcome[]
  points: SeriesPoint[]
  now: number
}

export interface MarketCardProps {
  id: string
  title: string
  status: MarketCardStatus
  kind: 'binary' | 'multiple_choice'
  closeAt: string
  resolvedAt: string | null
  outcomes: MarketCardOutcome[]
  resolvedOutcomeLabel: string | null
  chart?: MarketCardChart
}

export function MarketCard({
  id,
  title,
  status,
  kind,
  closeAt,
  resolvedAt,
  outcomes,
  resolvedOutcomeLabel,
  chart,
}: MarketCardProps) {
  const hasBets = outcomes.some((outcome) => outcome.pct !== null)

  return (
    <article className={cn(cardClass, 'flex flex-col gap-3 p-[18px]')}>
      <div className="flex flex-wrap items-center gap-2">
        <StatusChip tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</StatusChip>
        <span className="text-sm text-ink2">
          {status === 'open' && (
            <>
              Closes <LocalTime iso={closeAt} format="dateTime" />
            </>
          )}
          {status === 'resolved' && resolvedAt ? (
            <>
              Resolved <LocalTime iso={resolvedAt} format="day" />
            </>
          ) : status !== 'open' ? (
            <>
              Closed <LocalTime iso={closeAt} format="day" />
            </>
          ) : null}
        </span>
      </div>
      <h3 className="text-[18px] font-extrabold leading-[1.3] tracking-[-0.01em]">
        <Link href={`/markets/${id}`}>{title}</Link>
      </h3>
      {hasBets ? (
        <>
          {chart && (
            <ProbabilityChart
              outcomes={chart.outcomes}
              points={chart.points}
              now={chart.now}
              closedAt={closeAt}
              resolvedLabel={status === 'resolved' ? resolvedOutcomeLabel : null}
              compact
            />
          )}
          <ul className="flex flex-col gap-1.5">
            {outcomes.map((outcome, index) => (
              <li key={outcome.id} className="flex min-h-7 items-center gap-2.5">
                <span
                  aria-hidden="true"
                  className={cn('size-2.5 shrink-0 rounded-full', SERIES_BG[outcomeSeries(kind, outcome.label, index)])}
                />
                <span className="flex-1 font-bold">{outcome.label}</span>
                <span className="min-w-12 text-right font-extrabold tabular-nums">{outcome.pct}%</span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {outcomes.map((outcome) => (
              <span
                key={outcome.id}
                className="inline-flex h-6 items-center whitespace-nowrap rounded-full bg-sunk px-[9px] text-xs font-extrabold text-ink2"
              >
                {outcome.label}
              </span>
            ))}
          </div>
          <p className="text-ink2">no bets yet</p>
        </>
      )}
      {status === 'resolved' && resolvedOutcomeLabel && (
        <p className="flex items-center gap-2 font-extrabold text-win">
          <Trophy aria-hidden="true" className="size-5" />
          <span>Winning outcome: {resolvedOutcomeLabel}</span>
        </p>
      )}
    </article>
  )
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run tests/components/market-card.test.tsx`
Expected: PASS (7 tests)

- [ ] **Step 5: Rewrite `app/(app)/markets/page.tsx`**

This page has no unit test of its own (it's an async server component — Step 8 verifies it through the build and through `e2e/charts.spec.ts`). It reads every listed market's bets in one call with `listChartBets`, then builds each card's `points` with `buildProbabilitySeries`, using the same `odds` array (and therefore the same index-to-series mapping) the percentage list already uses. A market with no bets gets no `chart` field at all, so `MarketCard` falls through to its existing pills/"no bets yet" branch untouched.

```typescript
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ChartColumn, Plus } from 'lucide-react'
import { requireUser } from '@/lib/auth/require-user'
import { listMarkets } from '@/lib/markets/list-markets'
import { computeOdds } from '@/lib/markets/odds'
import { outcomeSeries } from '@/lib/markets/outcome-series'
import { marketCardStatus, type MarketCardStatus } from '@/lib/markets/market-status'
import { listChartBets } from '@/lib/markets/chart-bets'
import { buildProbabilitySeries } from '@/lib/markets/probability-series'
import { Page, PageHeader, h2Class } from '@/components/ui/page'
import { EmptyState } from '@/components/ui/empty-state'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { MarketCard, type MarketCardChart } from '@/components/markets/market-card'

const GROUPS: { id: MarketCardStatus; heading: string }[] = [
  { id: 'open', heading: 'Open' },
  { id: 'awaiting', heading: 'Awaiting resolution' },
  { id: 'resolved', heading: 'Resolved' },
  { id: 'voided', heading: 'Voided' },
]

export default async function MarketsPage() {
  const { supabase, user } = await requireUser()
  if (!user) redirect('/sign-in')

  const markets = await listMarkets(supabase)
  const chartBetsByMarket = await listChartBets(
    supabase,
    markets.map((m) => m.id),
  )
  // eslint-disable-next-line react-hooks/purity
  const nowMs = Date.now()
  const now = new Date(nowMs)

  const cards = markets.map((market) => {
    const odds = computeOdds(market.outcomes.map((o) => ({ id: o.id, label: o.label, pool_total: o.poolTotal })))
    const chartBets = chartBetsByMarket.get(market.id) ?? []
    const chart: MarketCardChart | undefined =
      chartBets.length > 0
        ? {
            outcomes: odds.map((o, index) => ({
              id: o.outcomeId,
              label: o.label,
              series: outcomeSeries(market.kind, o.label, index),
            })),
            points: buildProbabilitySeries(
              odds.map((o) => o.outcomeId),
              chartBets,
            ),
            now: nowMs,
          }
        : undefined
    return {
      id: market.id,
      title: market.title,
      status: marketCardStatus(market.status, market.closeAt, now),
      kind: market.kind,
      closeAt: market.closeAt,
      resolvedAt: market.resolvedAt,
      outcomes: odds.map((o) => ({
        id: o.outcomeId,
        label: o.label,
        pct: o.impliedProbability === null ? null : Math.round(o.impliedProbability * 100),
      })),
      resolvedOutcomeLabel: market.resolvedOutcomeLabel,
      chart,
    }
  })

  const groups = GROUPS.map((group) => ({
    ...group,
    markets: cards.filter((card) => card.status === group.id),
  })).filter((group) => group.markets.length > 0)

  return (
    <Page>
      <PageHeader
        title="Markets"
        action={
          <Link
            href="/markets/new"
            className={cn(buttonVariants({ variant: 'primary', size: 'sm' }), 'md:min-h-12 md:px-5 md:text-base')}
          >
            <Plus aria-hidden="true" className="size-5" />
            Create market
          </Link>
        }
      />
      {groups.length === 0 ? (
        <EmptyState
          icon={ChartColumn}
          title="No markets yet."
          action={
            <Link href="/markets/new" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
              Create market
            </Link>
          }
        >
          Open the first one and get the duel started.
        </EmptyState>
      ) : (
        groups.map((group) => (
          <section key={group.id} aria-labelledby={`markets-${group.id}-heading`} className="flex flex-col gap-3">
            <h2 id={`markets-${group.id}-heading`} className={h2Class}>
              {group.heading}
            </h2>
            <div className="grid items-start gap-5 lg:grid-cols-3">
              {group.markets.map((market) => (
                <MarketCard key={market.id} {...market} />
              ))}
            </div>
          </section>
        ))
      )}
    </Page>
  )
}
```

- [ ] **Step 6: Rewrite `app/(app)/markets/[id]/page.tsx`**

Adds the full "Chance over time" card and re-derives `isPastClose` from the same `Date.now()` read the chart uses, so the page only calls one impure function. `getMarketBets` (for the "Bets" list) and `getChartBets` (for the chart) are independent reads of the same table for different shapes, run together with `Promise.all`.

```typescript
import Link from 'next/link'
import { redirect, notFound } from 'next/navigation'
import { Layers, Trophy } from 'lucide-react'
import { requireUser } from '@/lib/auth/require-user'
import { isAdmin } from '@/lib/auth/is-admin'
import { getMarket, getMarketBets } from '@/lib/markets/get-market'
import { getChartBets } from '@/lib/markets/chart-bets'
import { buildProbabilitySeries } from '@/lib/markets/probability-series'
import { computeOdds } from '@/lib/markets/odds'
import { outcomeSeries } from '@/lib/markets/outcome-series'
import { rowState } from '@/lib/markets/row-state'
import { readSlip } from '@/lib/parlays/slip'
import { MAX_PICKS, legOddsBp } from '@/lib/parlays/odds'
import { addToSlipAction, removeFromSlipAction } from '@/lib/parlays/slip-actions'
import { BackLink } from '@/components/ui/back-link'
import { LocalTime } from '@/components/ui/local-time'
import { Message } from '@/components/ui/message'
import { Page, h1Class } from '@/components/ui/page'
import { SectionCard } from '@/components/ui/section-card'
import { StatusChip } from '@/components/ui/status-chip'
import { BetList } from '@/components/markets/bet-list'
import { OutcomeRow } from '@/components/markets/outcome-row'
import { ProbabilityChart } from '@/components/markets/probability-chart'
import { BetForm } from './bet-form'
import { ResolveForm } from './resolve-form'
import { VoidButton } from './void-button'

export default async function MarketDetailPage(props: PageProps<'/markets/[id]'>) {
  const { id } = await props.params
  const { supabase, user } = await requireUser()
  if (!user) redirect('/sign-in')

  const market = await getMarket(supabase, id)
  if (!market) notFound()

  const [bets, chartBets] = await Promise.all([getMarketBets(supabase, id), getChartBets(supabase, id)])
  const admin = await isAdmin(supabase)
  const odds = computeOdds(market.outcomes.map((o) => ({ id: o.id, label: o.label, pool_total: o.poolTotal })))
  const totalPool = odds.reduce((sum, o) => sum + o.poolTotal, 0)
  const chartOutcomes = odds.map((o, index) => ({
    id: o.outcomeId,
    label: o.label,
    series: outcomeSeries(market.kind, o.label, index),
  }))
  const chartPoints = buildProbabilitySeries(
    chartOutcomes.map((o) => o.id),
    chartBets,
  )

  const isCreator = market.createdBy === user.id
  // Server Components render once per request with no re-render/
  // reconciliation cycle for React to keep consistent across -- the
  // purity rule protects Client Components from that, which doesn't
  // apply here, and this page already does non-deterministic async DB
  // reads (getMarket, getMarketBets, isAdmin) on every invocation regardless.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now()
  const isPastClose = new Date(market.closeAt).getTime() <= now
  const canBet = market.status === 'open' && !isPastClose
  const canResolve = market.status === 'open' && ((isCreator && isPastClose) || admin)
  const canOverride = market.status === 'resolved' && admin
  const canVoid = market.status === 'open' && (isCreator || admin)
  const showResolve = canResolve || canOverride
  const resolvedLabel = market.status === 'resolved' ? market.resolvedOutcomeLabel : null

  const slip = await readSlip()
  const marketInSlip = market.outcomes.some((o) => slip.includes(o.id))
  const slipFull = slip.length >= MAX_PICKS && !marketInSlip

  const statusTone =
    market.status === 'resolved' ? 'done' : market.status === 'voided' ? 'void' : isPastClose ? 'wait' : 'open'

  const when =
    market.status === 'resolved' && market.resolvedAt ? (
      <>
        Resolved <LocalTime iso={market.resolvedAt} format="day" /> ·{' '}
      </>
    ) : market.status === 'open' ? (
      <>
        {isPastClose ? 'Closed' : 'Closes'} <LocalTime iso={market.closeAt} format="dateTime" /> ·{' '}
      </>
    ) : null

  const closedCopy =
    market.status === 'resolved' ? (
      <>
        This market resolved
        {market.resolvedAt && (
          <>
            {' '}
            on <LocalTime iso={market.resolvedAt} format="day" />
          </>
        )}{' '}
        and payouts have been sent.
      </>
    ) : market.status === 'voided' ? (
      'This market was voided, and every bet and parlay leg was refunded.'
    ) : (
      <>
        This market closed <LocalTime iso={market.closeAt} format="dateTime" /> and is awaiting resolution.
      </>
    )

  const manageHint = canOverride
    ? 'You’re an admin. A new outcome reverses the payouts and pays the new winners.'
    : !isCreator
      ? 'You’re an admin. Only admins and this market’s creator see this.'
      : canResolve
        ? 'You created this market. Only you and admins see this.'
        : 'You created this market. You can resolve it once it closes.'

  return (
    <Page>
      <BackLink href="/markets">Markets</BackLink>

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <StatusChip tone={statusTone}>
            Status: {market.status === 'open' && isPastClose ? 'awaiting resolution' : market.status}
          </StatusChip>
          <span className="text-sm text-ink2">
            {when}Created by {isCreator ? 'you' : market.creatorName}
          </span>
        </div>
        <h1 className={h1Class}>{market.title}</h1>
        {market.description && <p className="max-w-[68ch] text-ink2">{market.description}</p>}
        {market.status === 'resolved' && market.resolvedOutcomeLabel && (
          <Message tone="ok" icon={Trophy} className="self-start">
            Winning outcome: {market.resolvedOutcomeLabel}
          </Message>
        )}
      </div>

      <div className="flex flex-col gap-5 lg:grid lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:grid-rows-[auto_auto_1fr] lg:items-start lg:gap-7">
        <SectionCard title="Chance over time" titleId="chart-title" className="gap-3 lg:col-start-1 lg:row-start-1">
          <ProbabilityChart
            outcomes={chartOutcomes}
            points={chartPoints}
            now={now}
            closedAt={market.closeAt}
            resolvedLabel={resolvedLabel}
          />
        </SectionCard>

        <SectionCard
          title="Outcomes"
          titleId="outcomes-title"
          action={<span className="text-sm text-ink2 tabular-nums">{totalPool} DC in the pool</span>}
          className="gap-1 lg:col-start-1 lg:row-start-2"
        >
          {canBet && slipFull && (
            <Message tone="gold" icon={Layers} id="slip-full-note" className="mt-2">
              Your slip is full ({MAX_PICKS} picks).{' '}
              <Link href="/parlays" className="text-inherit">
                Review slip
              </Link>
            </Message>
          )}
          <ul className="flex flex-col divide-y divide-line">
            {odds.map((o, index) => (
              <li key={o.outcomeId}>
                <OutcomeRow
                  label={o.label}
                  poolTotal={o.poolTotal}
                  probability={o.impliedProbability}
                  oddsBp={legOddsBp(totalPool, o.poolTotal)}
                  series={outcomeSeries(market.kind, o.label, index)}
                  state={rowState(o.outcomeId, o.poolTotal, { slip, canBet, slipFull })}
                  winner={market.status === 'resolved' && o.label === market.resolvedOutcomeLabel}
                  addAction={addToSlipAction.bind(null, o.outcomeId)}
                  removeAction={removeFromSlipAction.bind(null, o.outcomeId)}
                  disabledReasonId={slipFull ? 'slip-full-note' : undefined}
                />
              </li>
            ))}
          </ul>
        </SectionCard>

        <div className="flex flex-col gap-5 lg:col-start-2 lg:row-span-3 lg:row-start-1 lg:gap-7">
          {canBet ? (
            <SectionCard title="Place a bet" titleId="bet-title" className="gap-4">
              <BetForm marketId={market.id} outcomes={market.outcomes} />
            </SectionCard>
          ) : (
            <SectionCard title="Betting closed" titleId="closed-title" className="gap-2">
              <p className="text-ink2">{closedCopy}</p>
            </SectionCard>
          )}

          {(showResolve || canVoid) && (
            <SectionCard
              title={canOverride ? 'Override resolution' : 'Resolve market'}
              titleId="manage-title"
              className="gap-1"
            >
              <p className="text-sm text-ink2">{manageHint}</p>
              <div className="mt-3 flex flex-col gap-4">
                {showResolve && <ResolveForm marketId={market.id} outcomes={market.outcomes} />}
                {canVoid && (
                  <VoidButton marketId={market.id} className={showResolve ? 'border-t border-line pt-4' : undefined} />
                )}
              </div>
            </SectionCard>
          )}
        </div>

        <SectionCard title="Bets" titleId="bets-title" className="gap-1 lg:col-start-1 lg:row-start-3">
          <BetList bets={bets} outcomes={market.outcomes} viewerId={user.id} canBet={canBet} />
        </SectionCard>
      </div>
    </Page>
  )
}
```

- [ ] **Step 7: Write `e2e/charts.spec.ts`**

Uses Task 2's confirmed accessible contract: `ProbabilityChart` renders an element with `role="img"` whose `aria-label` is `"Chance over time. Now: {label} {pct}%, …"` (`pct = Math.round(share * 100)`), and renders no `role="img"` element at all when there are no points. After this test places one 10 DC bet on "Yes" in a fresh binary market, "Yes" holds the entire pool, so its share is `1` and its rounded percentage is `100`. The summary lists outcomes in the page's outcome order, which `getMarket` / `listMarkets` pin to insertion time and then label. A binary market's two outcomes are inserted together, so "No" sorts before "Yes". The full summary is therefore `"Chance over time. Now: No 0%, Yes 100%."`, and the test asserts all of it, anchored. An earlier draft expected "Yes" first and could never match.

```typescript
import { test, expect } from '@playwright/test'
import { localDateTimeString } from './local-date-time'

test('a market with a bet shows its chart, on the market page and its list card', async ({ page }) => {
  await page.goto('/markets/new')
  await page.getByLabel('Title').fill('Will the charts render?')
  await page.getByLabel('Close time').fill(localDateTimeString(new Date(Date.now() + 60 * 60 * 1000)))
  await page.getByRole('button', { name: 'Create market' }).click()
  await expect(page).toHaveURL(/\/markets\/[0-9a-f-]+/)

  await page.getByRole('combobox').first().selectOption({ label: 'Yes' })
  await page.getByPlaceholder('Amount (DC)').fill('10')
  await page.getByRole('button', { name: 'Place bet' }).click()
  await expect(page.getByText('10 DC on Yes')).toBeVisible()

  await expect(page.getByRole('img', { name: /^Chance over time\. Now: No 0%, Yes 100%\.$/ })).toBeVisible()

  await page.goto('/markets')
  const card = page.getByRole('article').filter({ hasText: 'Will the charts render?' })
  await expect(card.getByRole('img', { name: /^Chance over time\. Now: No 0%, Yes 100%\.$/ })).toBeVisible()
})
```

- [ ] **Step 8: Verify**

Run: `npm run lint && npx vitest run && npm run build`
Expected: all PASS.

Run: `lsof -ti:3000 | xargs -r kill 2>/dev/null; npx playwright test`
Expected: 16 passed (Task 3 adds the one new spec to the 15 existing).

- [ ] **Step 9: Commit**

```bash
git add components/markets/market-card.tsx "app/(app)/markets/page.tsx" "app/(app)/markets/[id]/page.tsx" tests/components/market-card.test.tsx e2e/charts.spec.ts
git commit -m "Wire the probability chart into the market page and every MarketCard"
```

---

## Task 4: NumberFlow for balances, odds and payouts

`@number-flow/react` renders a custom element, `<number-flow-react>`. Its light DOM (what
Playwright's `getByText` and Testing Library's `getByText` both read) is **not** a reliable
place to assert text:

- **On the server**, it renders a declarative-shadow-DOM `<template>` plus a plain-text
  fallback `<span>{formattedValue}</span>` as a *sibling* of that template, via
  `dangerouslySetInnerHTML`.
- **Once the client upgrades it**, the element attaches a real shadow root and builds the
  visible digits *inside* it, one `<span>` per digit position with nine extra `inert`
  sibling spans (the odometer wheel). The light DOM goes back to empty.
- **In jsdom** (this repo's unit-test environment), neither path behaves like a browser:
  a fresh render leaves the static server-style fallback markup sitting inertly in the
  light DOM (no live shadow root attaches), and updating an already-mounted instance's
  `value` throws (`this.el?.willUpdate is not a function`) because jsdom never upgraded
  the element to the class that defines those methods.

So every number this task animates keeps an exact, plain-text twin the e2e suite and
screen readers actually read, with `<NumberFlow>` rendered only as a decorative,
`aria-hidden` echo next to it. `components/app-nav/app-nav.tsx`'s `BalanceChip` already
does exactly this (a `sr-only` span with the real text, an `aria-hidden` span with the
display copy) — this task generalizes that one-off pattern into a shared component and
reuses it everywhere else NumberFlow appears.

Two numbers are explicitly **not** animated — see "What's skipped" at the end.

**Files:**
- Modify: `package.json`, `package-lock.json` (add `@number-flow/react`)
- Create: `components/ui/animated-text.tsx`
- Create: `tests/components/animated-text.test.tsx`
- Modify: `components/app-nav/app-nav.tsx`
- Modify: `components/home/home-hero.tsx`
- Modify: `components/markets/outcome-row.tsx`
- Modify: `tests/components/outcome-row.test.tsx`
- Modify: `components/parlays/slip-pick.tsx`
- Modify: `tests/components/slip-pick.test.tsx`
- Modify: `app/(app)/parlays/slip-form.tsx`
- Modify: `tests/components/slip-form.test.tsx`

**Interfaces:**
- Consumes: `formatOdds` (`lib/parlays/odds.ts`), `potentialPayout` (`lib/parlays/odds.ts`)
- Produces:
  ```ts
  // components/ui/animated-text.tsx
  export function AnimatedText({ plainText, className, children }: {
    plainText: string    // the exact text e2e and assistive tech read (sr-only)
    className?: string   // applied to the visible, aria-hidden, animated copy
    children: ReactNode  // one or more <NumberFlow> elements (plus literal text/parens)
  }): JSX.Element
  ```

---

- [ ] **Step 1: Install `@number-flow/react`**

  Run: `npm install @number-flow/react@^0.6.2`

  `git add package.json package-lock.json` when this task commits.

- [ ] **Step 2: Write the failing test for `AnimatedText`**

  Create `tests/components/animated-text.test.tsx`:

  ```tsx
  // @vitest-environment jsdom
  import { describe, it, expect } from 'vitest'
  import { render, screen } from '@testing-library/react'
  import { AnimatedText } from '@/components/ui/animated-text'

  describe('AnimatedText', () => {
    it('keeps the plain text for assistive tech and Playwright, and hides the animated copy from both', () => {
      render(
        <AnimatedText plainText="42 DC">
          <span>should-not-matter</span>
        </AnimatedText>,
      )
      const plain = screen.getByText('42 DC')
      expect(plain).toHaveClass('sr-only')
      expect(plain.nextElementSibling).toHaveAttribute('aria-hidden', 'true')
    })

    it('applies the given className to the visible, animated copy only', () => {
      render(
        <AnimatedText plainText="42 DC" className="text-2xl">
          <span>42 DC</span>
        </AnimatedText>,
      )
      // getAllByText would return the child <span>, not the aria-hidden wrapper that takes the class.
      const plain = screen.getByText('42 DC', { selector: '.sr-only' })
      expect(plain).not.toHaveClass('text-2xl')
      expect(plain.nextElementSibling).toHaveClass('text-2xl')
    })
  })
  ```

  Run: `npx vitest run tests/components/animated-text.test.tsx`
  Expected: FAIL with `Failed to resolve import "@/components/ui/animated-text"`

- [ ] **Step 3: Write `components/ui/animated-text.tsx`**

  ```tsx
  import type { ReactNode } from 'react'

  // NumberFlow's own light DOM is either its static server-rendered fallback text, or
  // nothing at all once it upgrades into a real shadow root, so it's never a reliable
  // place for Playwright's getByText or an assistive-technology reader to look. Every
  // animated number keeps this exact plain-text twin instead: real content for screen
  // readers and e2e, with the animated copy hidden from both so it isn't seen or
  // announced twice.
  export function AnimatedText({
    plainText,
    className,
    children,
  }: {
    plainText: string
    className?: string
    children: ReactNode
  }) {
    return (
      <>
        <span className="sr-only">{plainText}</span>
        <span aria-hidden="true" className={className}>
          {children}
        </span>
      </>
    )
  }
  ```

  Run: `npx vitest run tests/components/animated-text.test.tsx`
  Expected: PASS (2 tests)

- [ ] **Step 4: Wire the nav balance chip and the home hero balance**

  In `components/app-nav/app-nav.tsx`, add the imports:

  ```typescript
  import NumberFlow from '@number-flow/react'
  ```

  and

  ```typescript
  import { AnimatedText } from '@/components/ui/animated-text'
  ```

  next to the other `@/components/...` imports. Replace the `BalanceChip` function:

  ```tsx
  function BalanceChip({ balance }: { balance: number }) {
    return (
      <span className="inline-flex h-9 items-center gap-1 whitespace-nowrap rounded-full bg-gold-soft pr-2.5 pl-1.5 text-[15px] font-extrabold tabular-nums text-gold md:gap-1.5 md:pr-3 md:pl-2">
        <CircleDot aria-hidden="true" className="size-4 md:size-[18px]" />
        <AnimatedText plainText={`Balance ${balance} DC`}>
          <NumberFlow value={balance} suffix=" DC" />
        </AnimatedText>
      </span>
    )
  }
  ```

  In `components/home/home-hero.tsx`, add the same two imports, then replace the balance
  paragraph:

  ```tsx
  import NumberFlow from '@number-flow/react'
  import { cn } from '@/lib/utils'
  import { AnimatedText } from '@/components/ui/animated-text'
  import { eyebrowClass } from '@/components/ui/page'
  import { heroCaption } from '@/lib/home/copy'

  export function HomeHero({
    balance,
    rank,
    memberCount,
    pendingCount,
    pendingDc,
  }: {
    balance: number
    rank: number
    memberCount: number
    pendingCount: number
    pendingDc: number
  }) {
    return (
      <section
        aria-label="Your balance"
        className="flex flex-col gap-2 rounded-[22px] bg-hero px-[22px] pt-[22px] pb-6 text-on-hero md:px-9 md:py-8"
      >
        <p className={cn(eyebrowClass, 'text-hero-2')}>Dwell Coin</p>
        <p className="text-xl font-bold md:text-2xl">
          Balance:{' '}
          <AnimatedText
            plainText={`${balance} DC`}
            className="text-[44px] leading-none font-extrabold tracking-[-0.03em] tabular-nums text-[#72DB2B] md:text-[60px]"
          >
            <NumberFlow value={balance} suffix=" DC" />
          </AnimatedText>
        </p>
        <p className="text-sm text-hero-2">{heroCaption(rank, memberCount, pendingCount, pendingDc)}</p>
      </section>
    )
  }
  ```

  Run: `npx vitest run tests/components/app-nav.test.tsx tests/components/home-hero.test.tsx`
  Expected: PASS, unchanged. (`app-nav.test.tsx`'s `getAllByText('Balance 120 DC')` still
  resolves to exactly the two `sr-only` spans — the visible echo says `120 DC` with no
  "Balance" prefix, so it never collides. `home-hero.test.tsx`'s check is a custom
  predicate scoped to `element.tagName === 'P'`, and the `sr-only`/`aria-hidden` spans it
  now contains are `<span>`s, not `<p>`s, so it still finds exactly the one paragraph.)

- [ ] **Step 5: Wire `OutcomeRow`'s percentage, pool and payout multiplier**

  In `components/markets/outcome-row.tsx`, add:

  ```typescript
  import NumberFlow from '@number-flow/react'
  import { AnimatedText } from '@/components/ui/animated-text'
  ```

  Replace the percentage/pool line and the payout-multiplier line:

  ```tsx
  <span className="shrink-0 font-extrabold tabular-nums">
    <AnimatedText plainText={`${Math.round(percent)}% (${poolTotal} DC)`}>
      <NumberFlow value={Math.round(percent)} suffix="% (" />
      <NumberFlow value={poolTotal} suffix=" DC)" />
    </AnimatedText>
  </span>
  ```

  and

  ```tsx
  <span className="text-sm text-ink2">
    {oddsBp !== null && (
      <AnimatedText plainText={`${formatOdds(oddsBp)}× payout per DC`}>
        <NumberFlow
          value={Number(formatOdds(oddsBp))}
          format={{ minimumFractionDigits: 2, maximumFractionDigits: 2 }}
          suffix="× payout per DC"
        />
      </AnimatedText>
    )}
  </span>
  ```

  Everything else in the file (imports, `SERIES_BG`, the `add`/`inslip`/`disabled` forms)
  stays exactly as it is — Task 5 touches those forms.

  Update `tests/components/outcome-row.test.tsx`. Add a mock at the top (after the
  existing imports, before the `OutcomeRow` import) so jsdom never has to model the real
  custom element, and scope the percentage/payout assertions to the `sr-only` copy (the
  real, animated copy now duplicates the same text, so an unscoped `getByText` would
  match two elements):

  ```tsx
  // @vitest-environment jsdom
  import { describe, it, expect, vi } from 'vitest'
  import { render, screen, waitFor } from '@testing-library/react'
  import userEvent from '@testing-library/user-event'
  import { OutcomeRow, type OutcomeRowState } from '@/components/markets/outcome-row'

  vi.mock('@number-flow/react', () => ({
    default: ({ value, suffix }: { value: number; suffix?: string }) => `${value}${suffix ?? ''}`,
  }))

  function renderRow(state: OutcomeRowState, overrides: Partial<Parameters<typeof OutcomeRow>[0]> = {}) {
    const addAction = vi.fn()
    const removeAction = vi.fn()
    render(
      <OutcomeRow
        label="Yes"
        poolTotal={60}
        probability={0.75}
        oddsBp={13333}
        series={2}
        state={state}
        addAction={addAction}
        removeAction={removeAction}
        {...overrides}
      />,
    )
    return { addAction, removeAction }
  }

  describe('OutcomeRow', () => {
    it('shows the chance, the pool and the payout multiplier', () => {
      renderRow('add')
      expect(screen.getByText('75% (60 DC)', { selector: '.sr-only' })).toBeInTheDocument()
      expect(screen.getByText('1.33× payout per DC', { selector: '.sr-only' })).toBeInTheDocument()
    })

    it('adds the outcome to the slip, naming the outcome for screen readers', async () => {
      const { addAction } = renderRow('add')
      const add = screen.getByRole('button', { name: 'Add to parlay Yes' })
      expect(add).toBeEnabled()
      expect(add).toHaveAttribute('type', 'submit')
      await userEvent.click(add)
      await waitFor(() => expect(addAction).toHaveBeenCalledWith(expect.any(FormData)))
    })

    it('marks an outcome already in the slip and removes it', async () => {
      const { removeAction } = renderRow('inslip')
      expect(screen.getByText('In your slip')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /Add to parlay/ })).not.toBeInTheDocument()
      await userEvent.click(screen.getByRole('button', { name: 'Remove Yes' }))
      await waitFor(() => expect(removeAction).toHaveBeenCalledWith(expect.any(FormData)))
    })

    it('shows Add to parlay disabled when the slip is full', () => {
      renderRow('disabled')
      expect(screen.getByRole('button', { name: 'Add to parlay Yes' })).toBeDisabled()
      expect(screen.getByText('1.33× payout per DC', { selector: '.sr-only' })).toBeInTheDocument()
    })

    it('links the disabled Add to parlay button to the reason it is disabled', () => {
      renderRow('disabled', { disabledReasonId: 'slip-full-note' })
      expect(screen.getByRole('button', { name: 'Add to parlay Yes' })).toHaveAttribute('aria-describedby', 'slip-full-note')
    })

    it('has no aria-describedby on the disabled button when no reason is given', () => {
      renderRow('disabled')
      expect(screen.getByRole('button', { name: 'Add to parlay Yes' })).not.toHaveAttribute('aria-describedby')
    })

    it('hides the payout and every action when there is nothing to do', () => {
      renderRow('none')
      expect(screen.getByText('75% (60 DC)', { selector: '.sr-only' })).toBeInTheDocument()
      expect(screen.queryByRole('button')).not.toBeInTheDocument()
      expect(screen.queryByText(/payout per DC/)).not.toBeInTheDocument()
    })

    it('flags only the winning outcome', () => {
      renderRow('none', { winner: true })
      expect(screen.getByText('Winner')).toBeInTheDocument()
    })

    it('does not flag an outcome that did not win', () => {
      renderRow('none')
      expect(screen.queryByText('Winner')).not.toBeInTheDocument()
    })

    it('reads 0% before anyone has bet', () => {
      renderRow('none', { poolTotal: 0, probability: null, oddsBp: null })
      expect(screen.getByText('0% (0 DC)', { selector: '.sr-only' })).toBeInTheDocument()
    })

    it('gives every row its own button name', () => {
      const noop = vi.fn()
      render(
        <ul>
          {['Yes', 'No'].map((label) => (
            <li key={label}>
              <OutcomeRow
                label={label}
                poolTotal={10}
                probability={0.5}
                oddsBp={20000}
                series={label === 'Yes' ? 2 : 1}
                state="add"
                addAction={noop}
                removeAction={noop}
              />
            </li>
          ))}
        </ul>,
      )
      expect(screen.getByRole('button', { name: 'Add to parlay Yes' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Add to parlay No' })).toBeInTheDocument()
    })
  })
  ```

  Run: `npx vitest run tests/components/outcome-row.test.tsx`
  Expected: PASS (11 tests)

- [ ] **Step 6: Wire `SlipPick`'s odds**

  In `components/parlays/slip-pick.tsx`, add the same two imports and replace the odds
  span:

  ```tsx
  import Link from 'next/link'
  import NumberFlow from '@number-flow/react'
  import { AnimatedText } from '@/components/ui/animated-text'
  import { FormSubmitButton } from '@/components/ui/form-submit-button'
  import { StatusChip } from '@/components/ui/status-chip'
  import type { SlipPick as SlipPickView } from '@/lib/parlays/get-slip'
  import { formatOdds } from '@/lib/parlays/odds'

  export function SlipPick({
    pick,
    removeAction,
  }: {
    pick: SlipPickView
    removeAction: (formData: FormData) => void | Promise<void>
  }) {
    return (
      <div className="flex items-center gap-3 py-3.5">
        <div className="flex min-w-0 grow flex-col gap-1">
          <Link href={`/markets/${pick.marketId}`} className="text-sm">
            {pick.marketTitle}
          </Link>
          <span className="text-[17px] font-extrabold leading-[1.3]">{pick.outcomeLabel}</span>
        </div>
        {pick.available && pick.oddsBp !== null ? (
          <span className="whitespace-nowrap text-lg font-extrabold tabular-nums">
            <AnimatedText plainText={`${formatOdds(pick.oddsBp)}×`}>
              <NumberFlow
                value={Number(formatOdds(pick.oddsBp))}
                format={{ minimumFractionDigits: 2, maximumFractionDigits: 2 }}
                suffix="×"
              />
            </AnimatedText>
          </span>
        ) : (
          <StatusChip tone="lost">No longer available</StatusChip>
        )}
        <form action={removeAction}>
          <FormSubmitButton variant="quiet" size="sm">
            Remove{' '}
            <span className="sr-only">{`${pick.outcomeLabel}, ${pick.marketTitle}`}</span>
          </FormSubmitButton>
        </form>
      </div>
    )
  }
  ```

  (The `<form>` around Remove is untouched here — Task 5 replaces it.)

  Update `tests/components/slip-pick.test.tsx`:

  ```tsx
  // @vitest-environment jsdom
  import { describe, it, expect, vi } from 'vitest'
  import { render, screen, waitFor } from '@testing-library/react'
  import userEvent from '@testing-library/user-event'
  import { SlipPick } from '@/components/parlays/slip-pick'
  import type { SlipPick as SlipPickView } from '@/lib/parlays/get-slip'

  vi.mock('@number-flow/react', () => ({
    default: ({ value, suffix }: { value: number; suffix?: string }) => `${value}${suffix ?? ''}`,
  }))

  const live: SlipPickView = {
    outcomeId: 'o1',
    outcomeLabel: 'No',
    marketId: 'm1',
    marketTitle: 'Will it rain on the church picnic?',
    oddsBp: 40_000,
    available: true,
  }

  describe('SlipPick', () => {
    it('shows a live pick with its market link, outcome and odds', () => {
      render(<SlipPick pick={live} removeAction={vi.fn()} />)
      expect(screen.getByRole('link', { name: 'Will it rain on the church picnic?' })).toHaveAttribute('href', '/markets/m1')
      expect(screen.getByText('No')).toBeInTheDocument()
      expect(screen.getByText('4.00×', { selector: '.sr-only' })).toBeInTheDocument()
      expect(screen.queryByText('No longer available')).toBeNull()
    })

    it('marks a pick that is no longer available instead of showing odds', () => {
      render(<SlipPick pick={{ ...live, available: false, oddsBp: null }} removeAction={vi.fn()} />)
      expect(screen.getByText('No longer available')).toHaveClass('bg-loss-soft', 'text-loss')
      expect(screen.queryByText(/×/)).toBeNull()
    })

    it('names the Remove button after the pick and submits the remove action', async () => {
      const removeAction = vi.fn()
      render(<SlipPick pick={live} removeAction={removeAction} />)
      const button = screen.getByRole('button', { name: 'Remove No, Will it rain on the church picnic?' })
      expect(button).toHaveClass('min-h-11')
      await userEvent.click(button)
      await waitFor(() => expect(removeAction).toHaveBeenCalledTimes(1))
    })
  })
  ```

  Run: `npx vitest run tests/components/slip-pick.test.tsx`
  Expected: PASS (3 tests)

- [ ] **Step 7: Wire the slip's combined odds and potential payout**

  In `app/(app)/parlays/slip-form.tsx`, add the same two imports and replace the combined
  line and the potential-payout line:

  ```tsx
  <p className="font-extrabold">
    Combined:{' '}
    <AnimatedText plainText={`${formatOdds(slip.multiplierBp)}×${slip.capped ? ' (capped at 20×)' : ''}`}>
      <NumberFlow
        value={Number(formatOdds(slip.multiplierBp))}
        format={{ minimumFractionDigits: 2, maximumFractionDigits: 2 }}
        suffix={slip.capped ? '× (capped at 20×)' : '×'}
      />
    </AnimatedText>
  </p>
  ```

  ```tsx
  {showPayout && (
    <p className="text-lg">
      Potential payout:{' '}
      <strong className="tabular-nums">
        <AnimatedText plainText={`${potentialPayout(stakeNumber, slip.legBps)} DC`}>
          <NumberFlow value={potentialPayout(stakeNumber, slip.legBps)} suffix=" DC" />
        </AnimatedText>
      </strong>
    </p>
  )}
  ```

  The rest of the file — including the `Parlay placed at … — potential payout … DC.`
  success `Message` — is unchanged (see "What's skipped").

  Update `tests/components/slip-form.test.tsx`: add the mock, and change the three
  `getByText('Combined: …')` assertions (which needed the *whole* `<p>`'s text to match
  exactly, and no longer can, now that the label and the number are separate nodes) to
  check the `sr-only` copy instead. The one exception is the stale-pick case. There the
  live pick's odds and the combined odds are both 4.00×, so a bare `'4.00×'` query matches
  two `sr-only` spans. That case matches the Combined line's text content instead, which
  is a test-only change: the markup is correct, and the two numbers are genuinely
  different values that happen to coincide. The `Potential payout` assertions already use
  `toHaveTextContent`, which does substring matching, so they're untouched.

  ```tsx
  // @vitest-environment jsdom
  import { describe, it, expect, vi, beforeEach } from 'vitest'
  import { render, screen, within } from '@testing-library/react'
  import userEvent from '@testing-library/user-event'
  import type { SlipPick as SlipPickView, SlipView } from '@/lib/parlays/get-slip'
  import { combineOdds } from '@/lib/parlays/odds'

  vi.mock('@number-flow/react', () => ({
    default: ({ value, suffix }: { value: number; suffix?: string }) => `${value}${suffix ?? ''}`,
  }))

  const { placeParlayAction } = vi.hoisted(() => ({ placeParlayAction: vi.fn() }))
  vi.mock('@/lib/parlays/place-parlay', () => ({ placeParlayAction }))
  vi.mock('@/lib/parlays/slip-actions', () => ({ removeFromSlipAction: vi.fn() }))

  import { SlipForm } from '@/app/(app)/parlays/slip-form'

  function pick(n: number, available = true): SlipPickView {
    return { outcomeId: `o${n}`, outcomeLabel: 'Yes', marketId: `m${n}`, marketTitle: `Market ${n}?`, oddsBp: 40_000, available }
  }

  function slipView(picks: SlipPickView[]): SlipView {
    const legBps = picks.flatMap((p) => (p.available && p.oddsBp !== null ? [p.oddsBp] : []))
    return { picks, legBps, ...combineOdds(legBps), canPlace: picks.length >= 2 && picks.every((p) => p.available) }
  }

  beforeEach(() => {
    placeParlayAction.mockReset()
  })

  describe('SlipForm', () => {
    it('shows the empty state when the slip has no picks', () => {
      render(<SlipForm slip={slipView([])} />)
      const card = screen.getByRole('region', { name: 'Your slip' })
      expect(within(card).getByText('Empty')).toBeInTheDocument()
      expect(within(card).getByText('Your slip is empty.')).toBeInTheDocument()
      expect(within(card).getByText('Add picks from any open market.')).toBeInTheDocument()
      expect(within(card).getByRole('link', { name: 'Browse markets' })).toHaveAttribute('href', '/markets')
      expect(screen.queryByRole('button', { name: 'Place parlay' })).toBeNull()
    })

    it('asks for another pick instead of offering a stake when there is only one', () => {
      render(<SlipForm slip={slipView([pick(1)])} />)
      expect(screen.getByText('1 pick · max 6')).toBeInTheDocument()
      expect(screen.getByText('Add at least one more pick to place a parlay.')).toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'Browse markets' })).toHaveAttribute('href', '/markets')
      expect(screen.queryByLabelText('Stake (DC)')).toBeNull()
      expect(screen.queryByRole('button', { name: 'Place parlay' })).toBeNull()
    })

    it('shows the combined odds, and the payout once a stake is typed', async () => {
      render(<SlipForm slip={slipView([pick(1), pick(2)])} />)
      expect(screen.getByText('2 picks · max 6')).toBeInTheDocument()
      expect(screen.getAllByRole('button', { name: /^Remove Yes, Market \d\?$/ })).toHaveLength(2)
      expect(screen.getByText('16.00×', { selector: '.sr-only' })).toBeInTheDocument()
      expect(screen.queryByText(/Potential payout/)).toBeNull()
      await userEvent.type(screen.getByLabelText('Stake (DC)'), '5')
      expect(screen.getByText(/Potential payout:/)).toHaveTextContent('Potential payout: 80 DC')
      expect(screen.getByRole('button', { name: 'Place parlay' })).toBeEnabled()
    })

    it('notes a capped multiplier and caps the payout', async () => {
      render(<SlipForm slip={slipView([pick(1), pick(2), pick(3)])} />)
      expect(screen.getByText('20.00× (capped at 20×)', { selector: '.sr-only' })).toBeInTheDocument()
      await userEvent.type(screen.getByLabelText('Stake (DC)'), '5')
      expect(screen.getByText(/Potential payout:/)).toHaveTextContent('Potential payout: 100 DC')
    })

    it('blocks placing while a pick is no longer available, and says why', () => {
      render(<SlipForm slip={slipView([pick(1), pick(2, false)])} />)
      expect(screen.getByText('No longer available')).toBeInTheDocument()
      // The live pick's own odds are also 4.00×, so match the Combined line's text rather than a bare number.
      expect(screen.getByText(/^Combined:/)).toHaveTextContent('Combined: 4.00×')
      const button = screen.getByRole('button', { name: 'Place parlay' })
      expect(button).toBeDisabled()
      expect(button).toHaveAccessibleDescription('Remove the pick that’s no longer available to place this parlay.')
    })

    it('shows a server error and ties it to the stake field', async () => {
      placeParlayAction.mockResolvedValue({ formError: 'Insufficient balance — you have 3 DC. Try a smaller amount.' })
      render(<SlipForm slip={slipView([pick(1), pick(2)])} />)
      const stake = screen.getByLabelText('Stake (DC)')
      expect(stake).toHaveAttribute('aria-invalid', 'false')
      await userEvent.type(stake, '5')
      await userEvent.click(screen.getByRole('button', { name: 'Place parlay' }))

      const alert = await screen.findByRole('alert')
      expect(alert).toHaveTextContent('Insufficient balance — you have 3 DC. Try a smaller amount.')
      expect(alert).toHaveAttribute('id', 'slip-error')
      expect(stake).toHaveAttribute('aria-invalid', 'true')
      expect(stake).toHaveAccessibleDescription('Insufficient balance — you have 3 DC. Try a smaller amount.')
      expect((placeParlayAction.mock.calls[0][1] as FormData).get('stake')).toBe('5')
    })

    it('keeps the success message after the placed slip empties', async () => {
      placeParlayAction.mockResolvedValue({ placed: { multiplierBp: 160_000, potentialPayout: 80 } })
      const { rerender } = render(<SlipForm slip={slipView([pick(1), pick(2)])} />)
      await userEvent.type(screen.getByLabelText('Stake (DC)'), '5')
      await userEvent.click(screen.getByRole('button', { name: 'Place parlay' }))
      expect(await screen.findByRole('status')).toHaveTextContent('Parlay placed at 16.00× — potential payout 80 DC.')

      rerender(<SlipForm slip={slipView([])} />)
      expect(screen.getByRole('status')).toHaveTextContent('Parlay placed at 16.00× — potential payout 80 DC.')
      expect(screen.getByText('Your slip is empty.')).toBeInTheDocument()
    })
  })
  ```

  Run: `npx vitest run tests/components/slip-form.test.tsx`
  Expected: PASS (7 tests)

- [ ] **Step 8: Full verification**

  Run: `npm run lint && npx vitest run && npm run build`
  Expected: no lint errors; full suite green; build succeeds.

  Run: `lsof -ti:3000 | xargs -r kill 2>/dev/null; npx playwright test`
  Expected: all 16 e2e tests pass, unchanged (this task adds none). Pay particular
  attention to `e2e/foundation.spec.ts`, `e2e/coin-economy.spec.ts`, `e2e/app-nav.spec.ts`
  and `e2e/parlays.spec.ts` — the specs that read a NumberFlow-touched number. If any of
  them fails to find text it expects, that's the signal the `sr-only`/`aria-hidden` split
  isn't landing the way expected for real Chromium: `getByText` matches the smallest
  element whose aggregated text contains the target, and for each e2e-asserted string the
  shared `<p>`/`<span>` ancestor is the only element containing the whole substring (the
  `sr-only` span alone lacks the surrounding label, and the `aria-hidden` span alone lacks
  it too), so that ancestor should resolve uniquely. If it doesn't, check whether the
  `aria-hidden` NumberFlow's own shadow-DOM content is changing which element counts as
  smallest.

- [ ] **Step 9: Commit**

  ```
  git add package.json package-lock.json components/ui/animated-text.tsx tests/components/animated-text.test.tsx components/app-nav/app-nav.tsx components/home/home-hero.tsx components/markets/outcome-row.tsx tests/components/outcome-row.test.tsx components/parlays/slip-pick.tsx tests/components/slip-pick.test.tsx "app/(app)/parlays/slip-form.tsx" tests/components/slip-form.test.tsx
  ```

## What's skipped

NumberFlow is **not** applied to:

- **The slip's placed-parlay confirmation** (`Parlay placed at 16.00× — potential payout
  80 DC.` in `app/(app)/parlays/slip-form.tsx`). It's a single sentence with two numbers
  baked into one e2e-asserted string and one `toHaveTextContent` unit assertion
  (`tests/components/slip-form.test.tsx`, "keeps the success message…"). Splitting it
  into label/number/label/number pieces just to animate it is a lot of fragility for a
  value that has no natural "previous" state to count up from — it appears once, fully
  formed, the instant the parlay is placed. Left as plain text.
- **The "My parlays" list** (`components/parlays/placed-parlay.tsx`): `Pending — 5 DC at
  16.00× — pays 80 DC if every pick wins`, `Won — 5 DC at 16.00× — paid 80 DC`, and the
  rest. Same reasoning, and it isn't in the task list's own enumeration of targets
  either. Its unit test (`tests/components/placed-parlay.test.tsx`) also asserts the
  *whole* `<p>`'s `textContent` equals the sentence, which the sr-only/aria-hidden split
  would break for no real benefit (these are settled, historical rows, not live values).


---

## Task 5: sonner success toasts

A themed `<Toaster>`, mounted once in `app/(app)/layout.tsx` (not the root layout — every
action that gets a toast requires a signed-in member, and the `(app)` layout is exactly the
boundary that already gates on `requireUser()` and renders `AppNav`; `app/(auth)/*` pages
have no actions worth toasting). On phone (below `md`) the toaster sits **top-center**,
below the 64px top bar; on desktop it's **bottom-right**. Phone is top, not bottom, because
Task 7 adds a floating "Slip (n)" button just above the bottom tab bar, and a bottom toast
would cover it right after a pick is added — exactly the moment this task's own "Added to
your slip." toast fires.

Toasts go to every listed action **except** the bulk approve/reject completions, which
already have their own `role="status"` inline summary (`2 approved.`, etc.) — adding a
toast on top of that would announce the same result to screen-reader users twice. Row-level
approve/reject (which have no such inline summary) keep their toasts.

Two of the remaining actions (add/remove a pick) are wired through raw `<form
action={...}>` calls with no `useActionState` today, so they have no "pending" signal to
hook a toast onto at all. The rest already use `useActionState`, just without reading its
third (`isPending`) value. Both cases need "did this action just finish, with no error" as
their success signal — there is no `{ ok: true }` today and I'm not adding one (that would
touch every failure branch's shape too). So the toast fires from the client-side action
itself: `withSuccessToast(action, hasError, message)` wraps the action passed to
`useActionState`, awaits the server action, and calls `toast.success` when the result has no
error. `ToastActionForm` does the same for the two plain actions. It is deliberately **not**
an effect watching `isPending`/`state`: several of these forms unmount in the very render
that ends their pending state — the void card disappears once the market is voided, and
"Add to parlay" turns into "In your slip" — so an effect inside them never runs and the
toast is lost. sonner's `toast` is global, so a call made from the resolved action outlives
the form.

This task runs after Task 4 (per the task table: `4 → 5`). Its edits to
`components/markets/outcome-row.tsx` and `components/parlays/slip-pick.tsx` below are
written as the file Task 4 leaves behind, plus this task's own form changes — every snippet
and full-file listing here already includes Task 4's `AnimatedText`/`NumberFlow` code, not
just this task's. This task makes no changes to `app/(app)/parlays/slip-form.tsx` (its
number formatting is entirely Task 4's; there's no toast on that page — see "What I
deliberately left alone").

**Files:**
- Create: `lib/toast/with-success-toast.ts`
- Create: `tests/components/with-success-toast.test.tsx`
- Create: `components/ui/toast-action-form.tsx`
- Create: `tests/components/toast-action-form.test.tsx`
- Create: `components/ui/toaster.tsx`
- Modify: `app/(app)/layout.tsx`
- Modify: `components/markets/outcome-row.tsx`
- Modify: `tests/components/outcome-row.test.tsx`
- Modify: `components/parlays/slip-pick.tsx`
- Modify: `tests/components/slip-pick.test.tsx`
- Modify: `app/(app)/markets/[id]/bet-form.tsx`
- Modify: `app/(app)/tasks/submit-button.tsx`
- Modify: `app/(app)/admin/tasks/review-buttons.tsx`
- Modify: `app/(app)/admin/invites/add-invite-form.tsx`
- Modify: `app/(app)/admin/members/adjust-balance-form.tsx`
- Modify: `app/(app)/markets/[id]/resolve-form.tsx`
- Modify: `app/(app)/markets/[id]/void-button.tsx`
- Modify: `tests/components/void-button.test.tsx`

**Interfaces:**
- Consumes: every action's existing `ActionState`/`BulkActionState` shape (`lib/markets/place-bet.ts`,
  `lib/tasks/submit-task-completion.ts`, `lib/tasks/review-task-completion.ts`,
  `lib/invites/actions.ts`, `lib/members/adjust-balance.ts`, `lib/markets/resolve-market.ts`,
  `lib/markets/void-market.ts`, `lib/parlays/slip-actions.ts`) — none of these change.
- Produces:
  ```ts
  // lib/toast/with-success-toast.ts — wraps a useActionState action; toasts after it
  // resolves without an error, and returns its state unchanged.
  export function withSuccessToast<State, Payload>(
    action: (state: State, payload: Payload) => Promise<State>,
    hasError: (state: State) => boolean,
    message: string,
  ): (state: State, payload: Payload) => Promise<State>

  // components/ui/toast-action-form.tsx — a <form> for a plain void action (add/remove a
  // pick) that toasts once the action resolves.
  export function ToastActionForm({ action, successMessage, className, children }: {
    action: (formData: FormData) => void | Promise<void>
    successMessage: string
    className?: string
    children: ReactNode
  }): JSX.Element

  // components/ui/toaster.tsx
  export function Toaster(): JSX.Element
  ```

## Toast copy (needs sign-off)

| Action | Toast |
|---|---|
| Bet placed | `Bet placed.` |
| Pick added | `Added to your slip.` |
| Pick removed | `Removed from your slip.` |
| Task submitted | `Submitted for review.` |
| Completion approved (row) | `Submission approved.` |
| Completion rejected (row) | `Submission rejected.` |
| Invite added | `Invite added.` |
| Balance adjusted | `Balance adjusted.` |
| Market resolved | `Market resolved.` |
| Market voided | `Market voided.` |

None of these contain, as a substring, any e2e-asserted string: `2 approved.`,
`Nothing pending.`, `Pending review`, `In your slip`, `Status: resolved`, `20 DC on Yes`,
`5 DC on Yes`, `15 DC on No`, `Parlay placed at 16.00× — potential payout 80 DC.`,
`Read Genesis 1-3 — 10 DC`, or an invited email address. None of the toast strings are
parameterized by a live count, amount or name — every one is a fixed literal — so there's
no risk of a toast coincidentally matching an e2e-asserted string for some run's numbers.

There is deliberately no toast row for "bulk approve"/"bulk reject" — see the reasoning
above.

---

- [ ] **Step 1: Write the failing test for `withSuccessToast`**

  Create `tests/components/with-success-toast.test.tsx`. The last case is the regression
  that matters: the form that submitted the action unmounts when it succeeds (as the void
  card and "Add to parlay" do), and the toast must still fire. An effect-based hook fails
  this case.

  ```tsx
  // @vitest-environment jsdom
  import { describe, it, expect, vi, beforeEach } from 'vitest'
  import { useActionState, useState } from 'react'
  import { render, screen, waitFor } from '@testing-library/react'
  import userEvent from '@testing-library/user-event'
  import { withSuccessToast } from '@/lib/toast/with-success-toast'

  const { success } = vi.hoisted(() => ({ success: vi.fn() }))
  vi.mock('sonner', () => ({ toast: { success } }))

  type State = { formError?: string } | undefined

  const hasError = (state: State) => Boolean(state?.formError)

  beforeEach(() => {
    success.mockReset()
  })

  describe('withSuccessToast', () => {
    it('passes the state and payload through and returns the action’s result', async () => {
      const action = vi.fn(async (_state: State, _formData: FormData): Promise<State> => ({ formError: 'Nope.' }))
      const formData = new FormData()

      await expect(withSuccessToast(action, hasError, 'Done.')(undefined, formData)).resolves.toEqual({ formError: 'Nope.' })
      expect(action).toHaveBeenCalledWith(undefined, formData)
    })

    it('toasts once when the action resolves without an error', async () => {
      await withSuccessToast(async (): Promise<State> => undefined, hasError, 'Done.')(undefined, new FormData())
      expect(success).toHaveBeenCalledTimes(1)
      expect(success).toHaveBeenCalledWith('Done.')
    })

    it('does not toast when the action returns an error', async () => {
      await withSuccessToast(async (): Promise<State> => ({ formError: 'Nope.' }), hasError, 'Done.')(undefined, new FormData())
      expect(success).not.toHaveBeenCalled()
    })

    it('still toasts when succeeding unmounts the form that submitted it', async () => {
      function Form({ onSuccess }: { onSuccess: () => void }) {
        const [, formAction] = useActionState<State, FormData>(
          withSuccessToast(
            async (): Promise<State> => {
              onSuccess()
              return undefined
            },
            hasError,
            'Done.',
          ),
          undefined,
        )
        return (
          <form action={formAction}>
            <button type="submit">Go</button>
          </form>
        )
      }
      function Page() {
        const [done, setDone] = useState(false)
        return done ? <p>Gone</p> : <Form onSuccess={() => setDone(true)} />
      }

      render(<Page />)
      await userEvent.click(screen.getByRole('button', { name: 'Go' }))

      expect(await screen.findByText('Gone')).toBeInTheDocument()
      await waitFor(() => expect(success).toHaveBeenCalledWith('Done.'))
      expect(success).toHaveBeenCalledTimes(1)
    })
  })
  ```

  Run: `npx vitest run tests/components/with-success-toast.test.tsx`
  Expected: FAIL with `Failed to resolve import "@/lib/toast/with-success-toast"`

- [ ] **Step 2: Write `lib/toast/with-success-toast.ts`**

  ```typescript
  import { toast } from 'sonner'

  // The toast fires from the action itself once it resolves, not from an effect watching the
  // form's pending state: some forms (the void card, "Add to parlay") unmount in the same render
  // that ends that state, so an effect inside them never runs. sonner's toast is global, so a call
  // made here outlives the form.
  export function withSuccessToast<State, Payload>(
    action: (state: State, payload: Payload) => Promise<State>,
    hasError: (state: State) => boolean,
    message: string,
  ): (state: State, payload: Payload) => Promise<State> {
    return async (state, payload) => {
      const next = await action(state, payload)
      if (!hasError(next)) toast.success(message)
      return next
    }
  }
  ```

  Run: `npx vitest run tests/components/with-success-toast.test.tsx`
  Expected: PASS (4 tests)

- [ ] **Step 3: Write the failing test for `ToastActionForm`**

  Create `tests/components/toast-action-form.test.tsx`:

  ```tsx
  // @vitest-environment jsdom
  import { describe, it, expect, vi, beforeEach } from 'vitest'
  import { useState } from 'react'
  import { render, screen, waitFor } from '@testing-library/react'
  import userEvent from '@testing-library/user-event'
  import { ToastActionForm } from '@/components/ui/toast-action-form'

  const { success } = vi.hoisted(() => ({ success: vi.fn() }))
  vi.mock('sonner', () => ({ toast: { success } }))

  beforeEach(() => {
    success.mockReset()
  })

  describe('ToastActionForm', () => {
    it('calls the wrapped action and toasts once it resolves', async () => {
      const action = vi.fn().mockResolvedValue(undefined)
      render(
        <ToastActionForm action={action} successMessage="Added.">
          <button type="submit">Add</button>
        </ToastActionForm>,
      )
      await userEvent.click(screen.getByRole('button', { name: 'Add' }))
      await waitFor(() => expect(action).toHaveBeenCalledTimes(1))
      await waitFor(() => expect(success).toHaveBeenCalledWith('Added.'))
    })

    it('passes the submitted FormData to the action', async () => {
      const action = vi.fn().mockResolvedValue(undefined)
      render(
        <ToastActionForm action={action} successMessage="Added.">
          <input type="hidden" name="outcomeId" value="o1" />
          <button type="submit">Add</button>
        </ToastActionForm>,
      )
      await userEvent.click(screen.getByRole('button', { name: 'Add' }))
      await waitFor(() => expect(action).toHaveBeenCalledTimes(1))
      const formData = action.mock.calls[0][0] as FormData
      expect(formData.get('outcomeId')).toBe('o1')
    })

    it('still toasts when the action’s success removes the form', async () => {
      function Row() {
        const [added, setAdded] = useState(false)
        if (added) return <p>In the slip</p>
        return (
          <ToastActionForm action={async () => setAdded(true)} successMessage="Added.">
            <button type="submit">Add</button>
          </ToastActionForm>
        )
      }

      render(<Row />)
      await userEvent.click(screen.getByRole('button', { name: 'Add' }))

      expect(await screen.findByText('In the slip')).toBeInTheDocument()
      await waitFor(() => expect(success).toHaveBeenCalledWith('Added.'))
      expect(success).toHaveBeenCalledTimes(1)
    })
  })
  ```

  Run: `npx vitest run tests/components/toast-action-form.test.tsx`
  Expected: FAIL with `Failed to resolve import "@/components/ui/toast-action-form"`

- [ ] **Step 4: Write `components/ui/toast-action-form.tsx`**

  A plain async function is a valid form action in React 19, so this needs no
  `useActionState`; `FormSubmitButton`'s `useFormStatus` still sees the pending submission.

  ```tsx
  'use client'

  import type { ReactNode } from 'react'
  import { toast } from 'sonner'

  // Adds a success toast to a plain server action (the slip's add and remove return nothing)
  // without making the presentational row that renders it a client component. The toast fires
  // once the action resolves, so it still shows after the row re-renders without this form, as
  // an added pick's row does when it turns into "In your slip".
  export function ToastActionForm({
    action,
    successMessage,
    className,
    children,
  }: {
    action: (formData: FormData) => void | Promise<void>
    successMessage: string
    className?: string
    children: ReactNode
  }) {
    async function formAction(formData: FormData) {
      await action(formData)
      toast.success(successMessage)
    }

    return (
      <form action={formAction} className={className}>
        {children}
      </form>
    )
  }
  ```

  Run: `npx vitest run tests/components/toast-action-form.test.tsx`
  Expected: PASS (3 tests)

- [ ] **Step 5: Write the themed `Toaster` and mount it**

  Create `components/ui/toaster.tsx`:

  ```tsx
  'use client'

  import type { CSSProperties } from 'react'
  import { useSyncExternalStore } from 'react'
  import { CircleCheck } from 'lucide-react'
  import { Toaster as SonnerToaster } from 'sonner'

  // Sonner's own "mobile" layout switches at a fixed 600px baked into its stylesheet. This
  // app's nav switches at Tailwind's md (768px) instead, so the toaster's position is
  // driven from JS against that same breakpoint rather than sonner's built-in one. Phone
  // keeps the toast at the TOP, below the 64px top bar: Task 7 adds a floating "Slip (n)"
  // button just above the bottom tab bar, and a bottom toast would cover it right after a
  // pick is added.
  const DESKTOP_QUERY = '(min-width: 768px)'

  function subscribeToDesktop(onChange: () => void): () => void {
    const query = window.matchMedia(DESKTOP_QUERY)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }

  // The server snapshot is the phone layout; React swaps in the real match on hydration.
  function useIsDesktop(): boolean {
    return useSyncExternalStore(
      subscribeToDesktop,
      () => window.matchMedia(DESKTOP_QUERY).matches,
      () => false,
    )
  }

  export function Toaster() {
    const isDesktop = useIsDesktop()
    return (
      <SonnerToaster
        position={isDesktop ? 'bottom-right' : 'top-center'}
        gap={12}
        offset={isDesktop ? { bottom: 24, right: 24 } : { top: 80, left: 16, right: 16 }}
        mobileOffset={{ top: 80, left: 16, right: 16 }}
        icons={{ success: <CircleCheck aria-hidden="true" className="size-5" /> }}
        toastOptions={{ style: { boxShadow: 'var(--shadow-card)' } }}
        style={
          {
            fontFamily: 'var(--font-manrope), ui-sans-serif, system-ui, sans-serif',
            '--border-radius': 'var(--radius-control)',
            '--normal-bg': 'var(--surface)',
            '--normal-border': 'var(--line)',
            '--normal-text': 'var(--ink)',
            '--success-bg': 'var(--acc-soft)',
            '--success-border': 'var(--acc-soft)',
            '--success-text': 'var(--acc-text)',
            '--error-bg': 'var(--loss-soft)',
            '--error-border': 'var(--loss-soft)',
            '--error-text': 'var(--loss)',
            '--warning-bg': 'var(--gold-soft)',
            '--warning-border': 'var(--gold-soft)',
            '--warning-text': 'var(--gold)',
          } as CSSProperties
        }
      />
    )
  }
  ```

  Modify `app/(app)/layout.tsx`:

  ```tsx
  import { requireUser } from '@/lib/auth/require-user'
  import { isAdmin } from '@/lib/auth/is-admin'
  import { readSlip } from '@/lib/parlays/slip'
  import { AppNav } from '@/components/app-nav/app-nav'
  import { Toaster } from '@/components/ui/toaster'

  export default async function SignedInLayout({ children }: LayoutProps<'/'>) {
    const { supabase, user } = await requireUser()
    if (!user) return children

    const { data: profile, error } = await supabase.from('profiles').select('balance').eq('id', user.id).maybeSingle()
    if (error) throw error
    if (!profile) return children

    const [admin, slip] = await Promise.all([isAdmin(supabase), readSlip()])

    return (
      <>
        <AppNav balance={profile.balance} slipCount={slip.length} isAdmin={admin} />
        <main id="main" className="flex flex-1 flex-col pb-[82px] md:pb-0">
          {children}
        </main>
        <Toaster />
      </>
    )
  }
  ```

  `useIsDesktop` reads the media query through `useSyncExternalStore` (subscribe to its
  `change` event, snapshot `matches`, server snapshot `false`), which is React's documented
  way to read a browser value; setting state from an effect would trip the repo's
  `react-hooks/set-state-in-effect` lint rule.

  There is no unit test for `Toaster` itself — it's pure configuration over a vendor
  component with no branching logic of its own; `with-success-toast.test.tsx` and
  `toast-action-form.test.tsx` already cover the thing that actually decides *whether* a
  toast fires, and Task 8's visual check covers how it looks in both themes at 375/1280.

  Run: `npx vitest run && npm run build`
  Expected: PASS / build succeeds (confirms the new client component and the layout import
  are wired correctly).

- [ ] **Step 6: Wire the pick add/remove toasts**

  In `components/markets/outcome-row.tsx`, add the import
  `import { ToastActionForm } from '@/components/ui/toast-action-form'` and replace the
  `inslip` and `add` branches (the rest of the file — the header line with `AnimatedText`
  from Task 4, `SERIES_BG`, the `disabled` branch — is unchanged):

  ```tsx
  {state === 'inslip' && (
    <span className="flex items-center gap-2">
      <StatusChip tone="open">
        <Check aria-hidden="true" className="size-4" />
        In your slip
      </StatusChip>
      <ToastActionForm action={removeAction} successMessage="Removed from your slip.">
        <FormSubmitButton variant="quiet" size="sm">
          Remove <span className="sr-only">{label}</span>
        </FormSubmitButton>
      </ToastActionForm>
    </span>
  )}
  {state === 'add' && (
    <ToastActionForm action={addAction} successMessage="Added to your slip.">
      <FormSubmitButton variant="secondary" size="sm">
        {addLabel}
      </FormSubmitButton>
    </ToastActionForm>
  )}
  ```

  In `components/parlays/slip-pick.tsx`, add the same import and replace the closing
  `<form>`:

  ```tsx
  <ToastActionForm action={removeAction} successMessage="Removed from your slip.">
    <FormSubmitButton variant="quiet" size="sm">
      Remove{' '}
      <span className="sr-only">{`${pick.outcomeLabel}, ${pick.marketTitle}`}</span>
    </FormSubmitButton>
  </ToastActionForm>
  ```

  Neither component becomes a client component itself — `ToastActionForm` (which is)
  carries the boundary, the same way `NumberFlow` already does inside both files after
  Task 4.

  Add a `sonner` mock to `tests/components/outcome-row.test.tsx` and
  `tests/components/slip-pick.test.tsx` (right under the existing `@number-flow/react`
  mock from Task 4), so their existing `addAction`/`removeAction` assertions don't fire a
  real, unmounted `toast.success` during the test run:

  ```typescript
  vi.mock('sonner', () => ({ toast: { success: vi.fn() } }))
  ```

  No other change to either test file — `ToastActionForm` still calls `action(formData)`
  with a real `FormData`, so `expect(addAction).toHaveBeenCalledWith(expect.any(FormData))`
  and `expect(removeAction).toHaveBeenCalledTimes(1)` keep passing unchanged. (Toast
  behavior itself is covered once, at the source, by `toast-action-form.test.tsx` — not
  re-asserted at every call site.)

  Run: `npx vitest run tests/components/outcome-row.test.tsx tests/components/slip-pick.test.tsx`
  Expected: PASS (11 + 3 tests)

- [ ] **Step 7: Wire the direct `useActionState` forms**

  Each of these passes its action to `useActionState`; wrap that action in
  `withSuccessToast(action, (s) => Boolean(s?.formError), '<toast>')` and import the helper.
  No other line in any of these files changes, and every failure still renders inline
  exactly as before.

  `app/(app)/markets/[id]/bet-form.tsx`:

  ```tsx
  'use client'

  import { useActionState } from 'react'
  import { FormSubmitButton } from '@/components/ui/form-submit-button'
  import { Field, Input, Select } from '@/components/ui/field'
  import { Message } from '@/components/ui/message'
  import { withSuccessToast } from '@/lib/toast/with-success-toast'
  import { placeBetAction, type ActionState } from '@/lib/markets/place-bet'

  export function BetForm({ marketId, outcomes }: { marketId: string; outcomes: { id: string; label: string }[] }) {
    const boundAction = withSuccessToast(
      placeBetAction.bind(null, marketId),
      (s) => Boolean(s?.formError),
      'Bet placed.',
    )
    const [state, formAction] = useActionState<ActionState, FormData>(boundAction, undefined)

    return (
      <>
        <form action={formAction} className="flex flex-col gap-4">
          <Field label="Outcome" htmlFor="bet-outcome">
            <Select id="bet-outcome" name="outcome_id" required>
              {outcomes.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Amount (DC)" htmlFor="bet-amount">
            <Input
              id="bet-amount"
              name="amount"
              type="number"
              inputMode="numeric"
              min="1"
              step="1"
              required
              placeholder="Amount (DC)"
              aria-invalid={Boolean(state?.formError)}
              aria-describedby={state?.formError ? 'bet-error' : undefined}
            />
          </Field>
          <FormSubmitButton block>Place bet</FormSubmitButton>
        </form>
        {state?.formError && (
          <Message tone="error" id="bet-error">
            {state.formError}
          </Message>
        )}
      </>
    )
  }
  ```

  `app/(app)/tasks/submit-button.tsx`:

  ```tsx
  'use client'

  import { useActionState } from 'react'
  import { FormSubmitButton } from '@/components/ui/form-submit-button'
  import { Message } from '@/components/ui/message'
  import { withSuccessToast } from '@/lib/toast/with-success-toast'
  import { submitTaskCompletionAction, type ActionState } from '@/lib/tasks/submit-task-completion'

  export function SubmitButton({ taskId }: { taskId: string }) {
    const boundAction = withSuccessToast(
      submitTaskCompletionAction.bind(null, taskId),
      (s) => Boolean(s?.formError),
      'Submitted for review.',
    )
    const [state, formAction] = useActionState<ActionState, FormData>(boundAction, undefined)
    const errorId = `submit-error-${taskId}`

    return (
      <form action={formAction} className="flex flex-col items-start gap-2">
        <FormSubmitButton size="sm" aria-describedby={state?.formError ? errorId : undefined}>
          I did this
        </FormSubmitButton>
        {state?.formError && (
          <Message tone="error" id={errorId}>
            {state.formError}
          </Message>
        )}
      </form>
    )
  }
  ```

  `app/(app)/admin/tasks/review-buttons.tsx`:

  ```tsx
  'use client'

  import { useActionState } from 'react'
  import { approveTaskCompletionAction, rejectTaskCompletionAction, type ActionState } from '@/lib/tasks/review-task-completion'
  import { Input } from '@/components/ui/field'
  import { FormSubmitButton } from '@/components/ui/form-submit-button'
  import { Message } from '@/components/ui/message'
  import { withSuccessToast } from '@/lib/toast/with-success-toast'

  export function ReviewButtons({ completionId }: { completionId: string }) {
    const hasError = (s: ActionState) => Boolean(s?.formError)
    const boundApprove = withSuccessToast(
      approveTaskCompletionAction.bind(null, completionId),
      hasError,
      'Submission approved.',
    )
    const boundReject = withSuccessToast(
      rejectTaskCompletionAction.bind(null, completionId),
      hasError,
      'Submission rejected.',
    )
    const [approveState, approveAction] = useActionState<ActionState, FormData>(boundApprove, undefined)
    const [rejectState, rejectAction] = useActionState<ActionState, FormData>(boundReject, undefined)
    const reasonId = `reject-reason-${completionId}`
    const approveErrorId = `approve-${completionId}-error`
    const rejectErrorId = `reject-${completionId}-error`

    return (
      <div className="flex flex-col gap-2 md:pl-[52px]">
        <div className="flex flex-col gap-2 md:flex-row md:items-center">
          <form action={approveAction} className="flex">
            <FormSubmitButton
              size="sm"
              className="grow"
              aria-describedby={approveState?.formError ? approveErrorId : undefined}
            >
              Approve
            </FormSubmitButton>
          </form>
          <form action={rejectAction} className="flex flex-col gap-2 md:grow md:flex-row md:items-center">
            <label htmlFor={reasonId} className="sr-only">
              Reason for rejecting (optional)
            </label>
            <Input
              id={reasonId}
              name="reason"
              placeholder="Reason (optional)"
              className="min-h-11 md:grow"
              aria-invalid={Boolean(rejectState?.formError)}
              aria-describedby={rejectState?.formError ? rejectErrorId : undefined}
            />
            <FormSubmitButton size="sm" variant="secondary">
              Reject
            </FormSubmitButton>
          </form>
        </div>
        {approveState?.formError && (
          <Message tone="error" id={approveErrorId}>
            {approveState.formError}
          </Message>
        )}
        {rejectState?.formError && (
          <Message tone="error" id={rejectErrorId}>
            {rejectState.formError}
          </Message>
        )}
      </div>
    )
  }
  ```

  **`app/(app)/admin/tasks/pending-approvals.tsx` is deliberately left untouched** — no
  toast is added there. It already shows its own `role="status"` inline summary
  (`approveState?.summary`/`rejectState?.summary`, rendered as `<Message tone="ok">`,
  which is where `2 approved.` comes from). Adding a toast on top would announce the same
  result to a screen-reader user twice, once from that live region and once from the
  toast's own. `ReviewButtons` (the row-level component it renders per pending item) still
  gets its toasts below, since a single row's approve/reject has no inline summary of its
  own to duplicate.

  `app/(app)/admin/invites/add-invite-form.tsx`:

  ```tsx
  'use client'

  import { useActionState } from 'react'
  import { addInviteAction } from '@/lib/invites/actions'
  import { Input } from '@/components/ui/field'
  import { FormSubmitButton } from '@/components/ui/form-submit-button'
  import { Message } from '@/components/ui/message'
  import { withSuccessToast } from '@/lib/toast/with-success-toast'

  export function AddInviteForm() {
    const [state, formAction] = useActionState(
      withSuccessToast(addInviteAction, (s) => Boolean(s?.formError), 'Invite added.'),
      undefined,
    )

    return (
      <form action={formAction} className="flex flex-col gap-2">
        <label htmlFor="invite-email" className="text-[15px] font-bold">
          Email
        </label>
        <div className="flex gap-2">
          <Input
            id="invite-email"
            name="email"
            type="email"
            required
            placeholder="friend@gmail.com"
            className="min-w-0"
            aria-invalid={Boolean(state?.formError)}
            aria-describedby={state?.formError ? 'invite-email-hint add-invite-error' : 'invite-email-hint'}
          />
          <FormSubmitButton className="shrink-0">Add</FormSubmitButton>
        </div>
        <p id="invite-email-hint" className="text-sm text-ink2">
          They can sign in with this Google account right away.
        </p>
        {state?.formError && (
          <Message tone="error" id="add-invite-error">
            {state.formError}
          </Message>
        )}
      </form>
    )
  }
  ```

  `app/(app)/admin/members/adjust-balance-form.tsx`:

  ```tsx
  'use client'

  import Link from 'next/link'
  import { useActionState } from 'react'
  import { adjustBalanceAction, type ActionState } from '@/lib/members/adjust-balance'
  import type { MemberSummary } from '@/lib/members/list-members'
  import { Avatar } from '@/components/ui/avatar'
  import { Field, Input } from '@/components/ui/field'
  import { FormSubmitButton } from '@/components/ui/form-submit-button'
  import { Message } from '@/components/ui/message'
  import { withSuccessToast } from '@/lib/toast/with-success-toast'

  export function AdjustBalanceForm({ member }: { member: MemberSummary }) {
    const boundAction = withSuccessToast(
      adjustBalanceAction.bind(null, member.id),
      (s) => Boolean(s?.formError),
      'Balance adjusted.',
    )
    const [state, formAction] = useActionState<ActionState, FormData>(boundAction, undefined)
    const amountId = `adjust-${member.id}-amount`
    const reasonId = `adjust-${member.id}-reason`
    const errorId = `adjust-${member.id}-error`

    return (
      <>
        <form action={formAction} className="flex flex-col gap-3 md:flex-row md:items-end md:gap-4">
          <div className="flex items-center gap-3 md:w-60 md:shrink-0 md:self-center">
            <Avatar name={member.displayName} />
            <div className="flex min-w-0 grow flex-col">
              <Link href={`/members/${member.id}`} className="font-extrabold">
                {member.displayName}
              </Link>
              <span className="text-sm text-ink2 tabular-nums">{member.balance} DC</span>
            </div>
          </div>
          <div className="flex min-w-0 grow flex-col gap-3 md:flex-row md:items-end md:gap-2">
            <div className="flex min-w-0 grow items-end gap-2">
              <Field label="Amount" htmlFor={amountId} className="w-[108px] shrink-0 md:w-[150px]">
                <Input
                  id={amountId}
                  name="amount"
                  type="number"
                  step="1"
                  required
                  placeholder="+/−"
                  aria-invalid={state?.field === 'amount'}
                  aria-describedby={state?.field === 'amount' ? errorId : undefined}
                />
              </Field>
              <Field label="Reason" htmlFor={reasonId} className="grow">
                <Input
                  id={reasonId}
                  name="reason"
                  aria-invalid={state?.field === 'reason'}
                  aria-describedby={state?.field === 'reason' ? errorId : undefined}
                />
              </Field>
            </div>
            <FormSubmitButton block className="md:w-auto">
              Adjust{' '}
              <span className="sr-only">{member.displayName}</span>
            </FormSubmitButton>
          </div>
        </form>
        {state?.formError && (
          <Message tone="error" id={errorId}>
            {state.formError}
          </Message>
        )}
      </>
    )
  }
  ```

  `app/(app)/markets/[id]/resolve-form.tsx`:

  ```tsx
  'use client'

  import { useActionState } from 'react'
  import { FormSubmitButton } from '@/components/ui/form-submit-button'
  import { Field, Select } from '@/components/ui/field'
  import { Message } from '@/components/ui/message'
  import { withSuccessToast } from '@/lib/toast/with-success-toast'
  import { resolveMarketAction, type ActionState } from '@/lib/markets/resolve-market'

  export function ResolveForm({ marketId, outcomes }: { marketId: string; outcomes: { id: string; label: string }[] }) {
    const boundAction = withSuccessToast(
      resolveMarketAction.bind(null, marketId),
      (s) => Boolean(s?.formError),
      'Market resolved.',
    )
    const [state, formAction] = useActionState<ActionState, FormData>(boundAction, undefined)

    return (
      <>
        <form action={formAction} className="flex flex-col gap-4">
          <Field label="Winning outcome" htmlFor="resolve-outcome">
            <Select
              id="resolve-outcome"
              name="outcome_id"
              required
              defaultValue=""
              aria-invalid={Boolean(state?.formError)}
              aria-describedby={state?.formError ? 'resolve-error' : undefined}
            >
              <option value="" disabled>
                Choose the winner…
              </option>
              {outcomes.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>
          <FormSubmitButton block>Confirm outcome</FormSubmitButton>
        </form>
        {state?.formError && (
          <Message tone="error" id="resolve-error">
            {state.formError}
          </Message>
        )}
      </>
    )
  }
  ```

  `app/(app)/markets/[id]/void-button.tsx`:

  ```tsx
  'use client'

  import { useActionState } from 'react'
  import { FormSubmitButton } from '@/components/ui/form-submit-button'
  import { Message } from '@/components/ui/message'
  import { withSuccessToast } from '@/lib/toast/with-success-toast'
  import { voidMarketAction, type ActionState } from '@/lib/markets/void-market'
  import { cn } from '@/lib/utils'

  export function VoidButton({ marketId, className }: { marketId: string; className?: string }) {
    const boundAction = withSuccessToast(
      voidMarketAction.bind(null, marketId),
      (s) => Boolean(s?.formError),
      'Market voided.',
    )
    const [state, formAction] = useActionState<ActionState, FormData>(boundAction, undefined)

    return (
      <form action={formAction} className={cn('flex flex-col gap-2', className)}>
        <FormSubmitButton
          variant="danger"
          block
          aria-describedby={state?.formError ? 'void-hint void-error' : 'void-hint'}
        >
          Void this market
        </FormSubmitButton>
        <p id="void-hint" className="text-sm text-ink2">
          Voiding refunds every bet and parlay leg.
        </p>
        {state?.formError && (
          <Message tone="error" id="void-error">
            {state.formError}
          </Message>
        )}
      </form>
    )
  }
  ```

  Run: `npx vitest run && npm run build`
  Expected: PASS / build succeeds.

- [ ] **Step 8: Extend `void-button.test.tsx` to prove the toast wiring end-to-end**

  This is the one existing form-level test file in the list above. The other six forms have
  no dedicated unit test today, and this task doesn't add one per form: the toast logic
  itself is exercised once, at the source, by `with-success-toast.test.tsx` and
  `toast-action-form.test.tsx`, so seven near-identical form tests would each just re-prove
  the same hook wiring with a different action name and message. This one file gives at
  least one end-to-end proof that a real production form, wired the intended way, actually
  shows the toast. Replace `tests/components/void-button.test.tsx`:

  ```tsx
  // @vitest-environment jsdom
  import { describe, it, expect, vi, beforeEach } from 'vitest'
  import { render, screen, waitFor } from '@testing-library/react'
  import userEvent from '@testing-library/user-event'

  const { voidMarketAction } = vi.hoisted(() => ({ voidMarketAction: vi.fn() }))
  vi.mock('@/lib/markets/void-market', () => ({ voidMarketAction }))

  const { success } = vi.hoisted(() => ({ success: vi.fn() }))
  vi.mock('sonner', () => ({ toast: { success } }))

  import { VoidButton } from '@/app/(app)/markets/[id]/void-button'

  beforeEach(() => {
    voidMarketAction.mockReset()
    success.mockReset()
  })

  describe('VoidButton', () => {
    it('describes itself by the hint alone before any error', () => {
      render(<VoidButton marketId="m1" />)
      expect(screen.getByRole('button', { name: 'Void this market' })).toHaveAttribute('aria-describedby', 'void-hint')
    })

    it('adds the error id alongside the hint once voiding fails', async () => {
      voidMarketAction.mockResolvedValue({ formError: 'Could not void that market.' })
      render(<VoidButton marketId="m1" />)

      await userEvent.click(screen.getByRole('button', { name: 'Void this market' }))

      expect(await screen.findByRole('alert')).toHaveTextContent('Could not void that market.')
      expect(screen.getByRole('button', { name: 'Void this market' })).toHaveAttribute('aria-describedby', 'void-hint void-error')
    })

    it('toasts once voiding succeeds', async () => {
      voidMarketAction.mockResolvedValue(undefined)
      render(<VoidButton marketId="m1" />)

      await userEvent.click(screen.getByRole('button', { name: 'Void this market' }))

      await waitFor(() => expect(success).toHaveBeenCalledWith('Market voided.'))
    })

    it('does not toast when voiding fails', async () => {
      voidMarketAction.mockResolvedValue({ formError: 'Could not void that market.' })
      render(<VoidButton marketId="m1" />)

      await userEvent.click(screen.getByRole('button', { name: 'Void this market' }))
      await screen.findByRole('alert')

      expect(success).not.toHaveBeenCalled()
    })
  })
  ```

  Run: `npx vitest run tests/components/void-button.test.tsx`
  Expected: PASS (4 tests)

- [ ] **Step 9: Full verification**

  Run: `npm run lint && npx vitest run && npm run build`
  Expected: no lint errors; full suite green; build succeeds.

  Run: `lsof -ti:3000 | xargs -r kill 2>/dev/null; npx playwright test`
  Expected: all 16 e2e tests pass (PR B's 15 plus Task 3's charts spec; this task adds none — a toast is additional,
  transient UI, not a replacement for any inline message the specs already read). Pay
  particular attention to `e2e/admin-controls.spec.ts` (`2 approved.` /
  `Nothing pending.`), `e2e/parlays.spec.ts` (`In your slip`, the placed-parlay message) and
  `e2e/coin-economy.spec.ts` (`Pending review`) — the specs closest to this task's new
  copy.

- [ ] **Step 10: Commit**

  ```
  git add lib/toast/with-success-toast.ts tests/components/with-success-toast.test.tsx components/ui/toast-action-form.tsx tests/components/toast-action-form.test.tsx components/ui/toaster.tsx "app/(app)/layout.tsx" components/markets/outcome-row.tsx tests/components/outcome-row.test.tsx components/parlays/slip-pick.tsx tests/components/slip-pick.test.tsx "app/(app)/markets/[id]/bet-form.tsx" "app/(app)/tasks/submit-button.tsx" "app/(app)/admin/tasks/review-buttons.tsx" "app/(app)/admin/invites/add-invite-form.tsx" "app/(app)/admin/members/adjust-balance-form.tsx" "app/(app)/markets/[id]/resolve-form.tsx" "app/(app)/markets/[id]/void-button.tsx" tests/components/void-button.test.tsx
  ```


---

## Task 6: Void confirmation dialog

"Void this market" no longer voids on the first press. It opens a Base UI **AlertDialog**, the pattern for confirming a destructive action:
- `role="alertdialog"`
- it won't close on an outside press
- Title: "Void this market?"
- Body: "Every bet and parlay leg is refunded. This can’t be undone."
- Buttons: Cancel / Void market

"Void market" is the `FormSubmitButton` that posts the existing `voidMarketAction` form. Task 5's success toast (`'Market voided.'` through `withSuccessToast`) is kept exactly. This task also adds the two overlay tokens that the dialog and Task 7's drawer share: the backdrop scrim and the raised-surface shadow.

**Files:**
- Modify: `app/globals.css` (the `--scrim` and `--overlay-shadow` tokens and their Tailwind utilities)
- Modify (rewrite): `app/(app)/markets/[id]/void-button.tsx`. It starts from Task 5's version (Step 7 of Task 5).
- Modify (rewrite): `tests/components/void-button.test.tsx`. It starts from Task 5's version (Step 8 of Task 5) and keeps its four cases.
- Create: `e2e/void-market.spec.ts`

**Interfaces:**
- Consumes:
  - `@base-ui/react`, installed by Task 2; do not reinstall. `AlertDialog` from `@base-ui/react/alert-dialog`, with the parts `Root`, `Trigger`, `Portal`, `Backdrop`, `Popup`, `Title`, `Description` and `Close`.
  - `voidMarketAction` and `ActionState` from `lib/markets/void-market.ts`, unchanged. A failure returns `{ formError }`; success revalidates the layout and returns `undefined`.
  - Task 5's `withSuccessToast(action, hasError, message)` from `lib/toast/with-success-toast.ts`, and its `<Toaster>` mounted in `app/(app)/layout.tsx`.
  - `buttonVariants` (`components/ui/button.tsx`), `FormSubmitButton`, `Message`, `h2Class` (`components/ui/page.tsx`) and `cn`.
- Produces:
  - `VoidButton({ marketId, className }: { marketId: string; className?: string })`: same props, so the market page's call site doesn't change.
  - The trigger keeps the name "Void this market" and the existing error wiring:
    - `aria-describedby="void-hint"`, which becomes `"void-hint void-error"` once `<Message tone="error" id="void-error">` shows a failure.
    - The hint `<p id="void-hint">` is unchanged.
  - Tokens in `app/globals.css`, which Task 7 consumes:
    - `--scrim`, used as `bg-scrim` (Tailwind `--color-scrim`)
    - `--overlay-shadow`, used as `shadow-overlay` (Tailwind `--shadow-overlay`)

**Behaviour.**
- **Nothing renders until opened.** `AlertDialog.Portal` (backdrop, popup, title, buttons) renders nothing until the dialog opens; Base UI doesn't keep it mounted without `keepMounted`. So before the trigger is pressed, the page has exactly one "Void this market" and no "Void market".
- **Focus.** AlertDialog is always modal:
  - It traps focus, locks page scroll, and makes the page behind it inert.
  - It closes on Escape and on Cancel. It does **not** close on an outside press, because it needs an answer.
  - Each close returns focus to the trigger.
  - On open, focus goes to the first tabbable element, which is Cancel. The safe choice comes first, and nothing needs `initialFocus`.
- **Confirming.** "Void market" submits the dialog's own `<form action={formAction}>`. `FormSubmitButton` shows the pending state with `aria-disabled` and blocks a double submit.
  - **Failure:** the action wrapper closes the dialog, and the error renders beside the trigger as it does today. Focus returns to the trigger, which is now described by the hint and the error, and the `role="alert"` message is announced.
  - **Success:** `withSuccessToast` fires the toast from the resolved action, as Task 5 wired it. The toast survives the revalidated page dropping `VoidButton`. The page then shows `Status: voided`.
- **Why the action is wrapped twice.** Task 5 wrapped `voidMarketAction.bind(null, marketId)` in `withSuccessToast`. Here the inner action becomes a small function that also closes the dialog when the action fails. `withSuccessToast` around it, with its copy, is Task 5's, unchanged.
- **Cancel can't submit.** `AlertDialog.Close` renders `<button type="button">`, so pressing Cancel inside the form never posts it. The test asserts the `type`.
- **Layout.** At 375px, Cancel and Void market are stacked full-width, in DOM order. From `md` they sit in a right-aligned row, Cancel first.

**Styling (tokens only).**
- **Backdrop:** `bg-scrim`.
  - Light: `rgba(3, 39, 45, 0.45)`, the `--ink` teal at 45%.
  - Dark: `rgba(0, 8, 10, 0.72)`. A dark scrim over the dark page, since `--ink` is light in dark.
- **Popup:** `bg-surface`, `border border-line`, `rounded-card`, `shadow-overlay`. The shadow is a soft two-layer lift in light and `none` in dark, where the border separates the surface, as `--shadow` does for cards.
- **Title:** `h2Class`. **Body:** `text-ink2`.
- **Motion:** a 150ms fade and scale via Base UI's `data-starting-style` / `data-ending-style`, off under `prefers-reduced-motion`.
- **Stacking:** `z-40` puts the backdrop and popup over the nav (`z-30`).

- [ ] **Step 1: Add the overlay tokens to `app/globals.css`**

Make these edits. If Task 5 already added lines inside any of these blocks, keep them. Only the lines shown here are new.

(a) In the light `:root` block, replace:

```css
  --shadow: 0 1px 2px rgba(3, 39, 45, 0.05), 0 6px 20px rgba(3, 39, 45, 0.05);
```

with:

```css
  --shadow: 0 1px 2px rgba(3, 39, 45, 0.05), 0 6px 20px rgba(3, 39, 45, 0.05);
  --overlay-shadow: 0 2px 6px rgba(3, 39, 45, 0.08), 0 18px 48px rgba(3, 39, 45, 0.18);
  --scrim: rgba(3, 39, 45, 0.45);
```

(b) In the `[data-theme="dark"]` block (two-space indent), replace:

```css
  --sym-d: #FFFFFF;
  --shadow: none;
```

with:

```css
  --sym-d: #FFFFFF;
  --shadow: none;
  --overlay-shadow: none;
  --scrim: rgba(0, 8, 10, 0.72);
```

(c) In the `@media (prefers-color-scheme: dark)` block (four-space indent), replace:

```css
    --sym-d: #FFFFFF;
    --shadow: none;
```

with:

```css
    --sym-d: #FFFFFF;
    --shadow: none;
    --overlay-shadow: none;
    --scrim: rgba(0, 8, 10, 0.72);
```

(d) In `@theme inline`, replace:

```css
  --color-s6: var(--s6);
```

with:

```css
  --color-s6: var(--s6);
  --color-scrim: var(--scrim);
```

and replace:

```css
  --shadow-tab: 0 1px 3px rgba(3, 39, 45, 0.12);
```

with:

```css
  --shadow-tab: 0 1px 3px rgba(3, 39, 45, 0.12);
  --shadow-overlay: var(--overlay-shadow);
```

- [ ] **Step 2: Write the failing tests**

Rewrite `tests/components/void-button.test.tsx` in full. Task 5's four cases are kept:
- the hint
- the error id
- the toast on success
- no toast on failure

The last three now go through the dialog, and three new cases cover the dialog itself.

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const { voidMarketAction } = vi.hoisted(() => ({ voidMarketAction: vi.fn() }))
vi.mock('@/lib/markets/void-market', () => ({ voidMarketAction }))

const { success } = vi.hoisted(() => ({ success: vi.fn() }))
vi.mock('sonner', () => ({ toast: { success } }))

import { VoidButton } from '@/app/(app)/markets/[id]/void-button'

beforeEach(() => {
  voidMarketAction.mockReset()
  success.mockReset()
})

async function confirmVoid() {
  await userEvent.click(screen.getByRole('button', { name: 'Void this market' }))
  await userEvent.click(await screen.findByRole('button', { name: 'Void market' }))
}

describe('VoidButton', () => {
  it('describes itself by the hint alone before any error, with no dialog rendered', () => {
    render(<VoidButton marketId="m1" />)
    expect(screen.getByRole('button', { name: 'Void this market' })).toHaveAttribute('aria-describedby', 'void-hint')
    expect(screen.getByText('Voiding refunds every bet and parlay leg.')).toHaveAttribute('id', 'void-hint')
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Void market' })).toBeNull()
  })

  it('opens an alert dialog with the approved copy, focusing Cancel first', async () => {
    render(<VoidButton marketId="m1" />)
    await userEvent.click(screen.getByRole('button', { name: 'Void this market' }))

    const dialog = await screen.findByRole('alertdialog', { name: 'Void this market?' })
    expect(dialog).toHaveAccessibleDescription('Every bet and parlay leg is refunded. This can’t be undone.')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus())
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveAttribute('type', 'button')
    expect(screen.getByRole('button', { name: 'Void market' })).toHaveAttribute('type', 'submit')
  })

  it('closes on Cancel and on Escape without voiding, returning focus to the trigger', async () => {
    render(<VoidButton marketId="m1" />)
    const trigger = screen.getByRole('button', { name: 'Void this market' })

    await userEvent.click(trigger)
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    expect(trigger).toHaveFocus()

    await userEvent.click(trigger)
    await screen.findByRole('alertdialog')
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    expect(trigger).toHaveFocus()

    expect(voidMarketAction).not.toHaveBeenCalled()
  })

  it('stays open when the member presses outside it', async () => {
    render(<VoidButton marketId="m1" />)
    await userEvent.click(screen.getByRole('button', { name: 'Void this market' }))
    await screen.findByRole('alertdialog')

    await userEvent.click(document.body)

    expect(screen.getByRole('alertdialog', { name: 'Void this market?' })).toBeInTheDocument()
  })

  it('adds the error id alongside the hint once voiding fails, closing the dialog', async () => {
    voidMarketAction.mockResolvedValue({ formError: 'Could not void that market.' })
    render(<VoidButton marketId="m1" />)

    await confirmVoid()

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not void that market.')
    expect(voidMarketAction).toHaveBeenCalledWith('m1', undefined, expect.any(FormData))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    const trigger = screen.getByRole('button', { name: 'Void this market' })
    expect(trigger).toHaveAttribute('aria-describedby', 'void-hint void-error')
    await waitFor(() => expect(trigger).toHaveFocus())
  })

  it('toasts once voiding succeeds', async () => {
    voidMarketAction.mockResolvedValue(undefined)
    render(<VoidButton marketId="m1" />)

    await confirmVoid()

    await waitFor(() => expect(success).toHaveBeenCalledWith('Market voided.'))
  })

  it('does not toast when voiding fails', async () => {
    voidMarketAction.mockResolvedValue({ formError: 'Could not void that market.' })
    render(<VoidButton marketId="m1" />)

    await confirmVoid()
    await screen.findByRole('alert')

    expect(success).not.toHaveBeenCalled()
  })
})
```

jsdom can't follow Base UI's focus guards when tabbing, so the focus trap is asserted in the e2e spec (Step 6).

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run tests/components/void-button.test.tsx`
Expected: FAIL, with 6 failed and 1 passed. Only the hint test passes against Task 5's direct-submit button.

- [ ] **Step 4: Rewrite `app/(app)/markets/[id]/void-button.tsx`**

```tsx
'use client'

import { useActionState, useState } from 'react'
import { AlertDialog } from '@base-ui/react/alert-dialog'
import { buttonVariants } from '@/components/ui/button'
import { FormSubmitButton } from '@/components/ui/form-submit-button'
import { Message } from '@/components/ui/message'
import { h2Class } from '@/components/ui/page'
import { withSuccessToast } from '@/lib/toast/with-success-toast'
import { voidMarketAction, type ActionState } from '@/lib/markets/void-market'
import { cn } from '@/lib/utils'

export function VoidButton({ marketId, className }: { marketId: string; className?: string }) {
  const [open, setOpen] = useState(false)
  const [state, formAction] = useActionState<ActionState, FormData>(
    withSuccessToast(
      async (prev: ActionState, formData: FormData) => {
        const next = await voidMarketAction(marketId, prev, formData)
        // A failure closes the dialog so the error shows beside the trigger, where focus returns.
        if (next?.formError) setOpen(false)
        return next
      },
      (s) => Boolean(s?.formError),
      'Market voided.',
    ),
    undefined,
  )

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <AlertDialog.Root open={open} onOpenChange={setOpen}>
        <AlertDialog.Trigger
          className={buttonVariants({ variant: 'danger', block: true })}
          aria-describedby={state?.formError ? 'void-hint void-error' : 'void-hint'}
        >
          Void this market
        </AlertDialog.Trigger>
        <AlertDialog.Portal>
          <AlertDialog.Backdrop className="fixed inset-0 z-40 bg-scrim transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0 motion-reduce:transition-none" />
          <AlertDialog.Popup className="fixed top-1/2 left-1/2 z-40 flex w-[calc(100vw-32px)] max-w-[440px] -translate-x-1/2 -translate-y-1/2 flex-col gap-5 rounded-card border border-line bg-surface p-6 text-ink shadow-overlay transition-[opacity,scale] duration-150 data-ending-style:scale-[0.98] data-ending-style:opacity-0 data-starting-style:scale-[0.98] data-starting-style:opacity-0 motion-reduce:transition-none">
            <div className="flex flex-col gap-2">
              <AlertDialog.Title className={h2Class}>Void this market?</AlertDialog.Title>
              <AlertDialog.Description className="text-ink2">
                Every bet and parlay leg is refunded. This can’t be undone.
              </AlertDialog.Description>
            </div>
            <form action={formAction} className="flex flex-col gap-3 md:flex-row md:justify-end">
              <AlertDialog.Close className={buttonVariants({ variant: 'secondary' })}>Cancel</AlertDialog.Close>
              <FormSubmitButton variant="danger">Void market</FormSubmitButton>
            </form>
          </AlertDialog.Popup>
        </AlertDialog.Portal>
      </AlertDialog.Root>
      <p id="void-hint" className="text-sm text-ink2">
        Voiding refunds every bet and parlay leg.
      </p>
      {state?.formError && (
        <Message tone="error" id="void-error">
          {state.formError}
        </Message>
      )}
    </div>
  )
}
```

The outer element is now a `<div>` instead of the `<form>`, because the form moved into the popup. The market page's `className` (`border-t border-line pt-4` when the resolve form sits above) still applies to it.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/components/void-button.test.tsx`
Expected: PASS (7 tests)

- [ ] **Step 6: Write `e2e/void-market.spec.ts`**

The seeded session is an admin, so it sees "Void this market" on a market it just created. The spec checks five things:
- no dialog is mounted up front
- focus starts on Cancel and stays trapped (three Tabs cycle through its two buttons)
- a press outside doesn't dismiss the dialog
- Escape closes it without voiding and returns focus to the trigger
- confirming voids the market

```typescript
import { test, expect } from '@playwright/test'
import { localDateTimeString } from './local-date-time'

test('void a market through the confirmation dialog', async ({ page }) => {
  await page.goto('/markets/new')
  await page.getByLabel('Title').fill('Will the potluck run out of rolls?')
  await page.getByLabel('Close time').fill(localDateTimeString(new Date(Date.now() + 60 * 60 * 1000)))
  await page.getByRole('button', { name: 'Create market' }).click()
  await expect(page).toHaveURL(/\/markets\/[0-9a-f-]+/)

  await expect(page.getByRole('alertdialog')).toHaveCount(0)
  const trigger = page.getByRole('button', { name: 'Void this market', exact: true })
  const dialog = page.getByRole('alertdialog', { name: 'Void this market?' })

  await trigger.click()
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused()
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press('Tab')
    await expect(dialog.locator(':focus')).toHaveCount(1)
  }

  // An alert dialog needs an answer: pressing the backdrop doesn't dismiss it.
  await page.mouse.click(5, 5)
  await expect(dialog).toBeVisible()

  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(trigger).toBeFocused()
  await expect(page.getByText('Status: open')).toBeVisible()

  await trigger.click()
  await dialog.getByRole('button', { name: 'Void market', exact: true }).click()

  await expect(page.getByText('Status: voided')).toBeVisible()
  // The void card unmounts on success; the toast must survive that.
  await expect(page.getByText('Market voided.')).toBeVisible()
  await expect(page.getByRole('alertdialog')).toHaveCount(0)
  await expect(trigger).toHaveCount(0)
})
```

`exact: true` matters here. Playwright's role-name match is otherwise a case-insensitive substring, and "Void market" and "Void this market" must never match each other. The toast "Market voided." doesn't contain `Status: voided`, so `getByText('Status: voided')` still resolves to the one status chip.

- [ ] **Step 7: Verify**

Run: `npm run lint && npx vitest run && npm run build`
Expected: all PASS

Run: `lsof -ti:3000 | xargs -r kill 2>/dev/null; npx playwright test`
Expected: 17 passed. That's the 16 after Task 3, plus `void-market.spec.ts`.

No existing e2e spec presses "Void this market". Those that visit a market page (`market-engine`, `parlays`, `social`, `charts`) never open the dialog, so it adds nothing to their queries.

- [ ] **Step 8: Commit**

```bash
git add app/globals.css "app/(app)/markets/[id]/void-button.tsx" tests/components/void-button.test.tsx e2e/void-market.spec.ts
git commit -m "Confirm voiding a market in a Base UI alert dialog"
```

---

## Task 7: Phone bet-slip drawer on market pages

On a phone, a member can now build and place a parlay without leaving the market they're looking at. Below `md`, once the slip has at least one pick, a floating "Slip (n)" button sits above the tab bar on every market page. It opens a Base UI **Drawer** (a bottom sheet) holding the member's picks, the stake field and "Place parlay". Desktop keeps `/parlays` and shows no trigger.

**Files:**
- Create: `app/(app)/markets/[id]/slip-drawer.tsx`
- Modify: `app/(app)/markets/[id]/page.tsx`. Task 3 rewrote this page; this task makes three small edits on top of Task 3's version: read the slip view and render the drawer.
- Test: `tests/components/slip-drawer.test.tsx`
- Create: `e2e/slip-drawer.spec.ts`

**Interfaces:**
- Consumes:
  - `@base-ui/react`, installed by Task 2; do not reinstall. `Drawer` from `@base-ui/react/drawer`, with the parts `Root`, `Trigger`, `VirtualKeyboardProvider`, `Portal`, `Backdrop`, `Viewport`, `Popup`, `Content` and `Close`.
  - Task 6's tokens: `bg-scrim` for the backdrop, and `shadow-overlay` for the raised surface. The shadow is `none` in dark, where the `border-line` edge does the work.
  - `SlipForm` from `app/(app)/parlays/slip-form.tsx`, **as Tasks 4 and 5 leave it; this task doesn't edit it.** It renders the whole slip:
    - the `Your slip` card (`<section aria-labelledby="slip-title">`) and the picks
    - the one-pick hint, the stake field and "Place parlay"
    - the success and error messages
  - What that brings with it:
    - Task 4's NumberFlow `AnimatedText` on the combined odds, the payout and each pick's odds
    - Task 5's `ToastActionForm` on each pick's Remove
  - `getSlipView(supabase, outcomeIds)` and `SlipView` from `lib/parlays/get-slip.ts`, unchanged. It returns early, with no query, when the slip is empty.
  - `buttonVariants` (`components/ui/button.tsx`) and `cn` (`lib/utils.ts`).
  - lucide-react `Layers` (the nav's Parlays icon) and `X`.
- Produces:
  - `SlipDrawer({ slip }: { slip: SlipView })`, a client component beside the market route. It renders nothing while the slip is empty.
  - `/markets/[id]` renders `<SlipDrawer slip={slipView} />` as the last child of its `<Page>`.

**How the market page gets the slip view.** The page already calls `readSlip()`, but only for the outcome ids behind the rows' "In your slip" state. The drawer needs more: the picks' labels, market titles and odds. So the page now also calls `getSlipView(supabase, slip)`, the same reader `/parlays` uses. That adds one query per market-page render, and only when the slip has picks. The drawer's count is `slip.picks.length`, which is what the drawer shows. The nav badge counts the cookie's ids instead; the two differ only when an outcome in the cookie has since been deleted.

**How the slip form is reused.** `SlipForm` renders inside the drawer as-is, so `/parlays`, its tests and `e2e/parlays.spec.ts` stay untouched. It also keeps `SlipForm`'s own behaviour:
- **The success message survives.** `SlipForm` owns `useActionState`, so the "Parlay placed at …" message outlives the re-render that empties the slip.
- **Remove works.** Each `SlipPick` posts `removeFromSlipAction` through Task 5's `ToastActionForm`, which revalidates the layout. The page re-renders and passes the drawer a fresh `slip`.
- **The sheet's name.** The drawer's `Popup` gets `aria-labelledby="slip-title"`, so the dialog is named by the card's own "Your slip" `<h2>`. There is no separate `Drawer.Title`, which would put a second "Your slip" in the sheet. Base UI spreads the caller's props after its own, so this `aria-labelledby` wins (checked in `node_modules/@base-ui/react/drawer/popup/DrawerPopup.js`).
- **The sheet's background** is `bg-bg`, so the card sits on it the way it sits on the `/parlays` page.

**Mounting rules.**
- **Nothing renders until needed.** An empty slip renders nothing. With picks, only the spacer and the trigger render. The `Portal` (backdrop, sheet and `SlipForm`) mounts only while the drawer is open. So the desktop e2e never sees a second "Place parlay" button or a second `Stake (DC)` label.
- **After placing.** Placing a parlay empties the slip while the drawer is open. The component keeps the `Drawer.Root` mounted while `open` is true, so the success message stays on screen. The trigger itself disappears as soon as the count is 0. When the member then closes the drawer, the component renders nothing.
- **Desktop.** The trigger and the spacer carry `md:hidden`, so at `md` and up they are `display: none` and out of the accessibility tree. A hidden trigger can't open the drawer, so the portal never mounts there.

**Position.**
- **The trigger** is fixed at `bottom-[94px] right-4`, 12px above the fixed tab bar, which the `(app)` layout reserves with `pb-[82px]`. It sits at `z-20`, under the nav (`z-30`), so the sticky top bar always wins.
- **The backdrop and sheet** sit at `z-40`, over the tab bar and the top bar.
- **Toasts.** Task 5 puts phone toasts at the top, so they can't cover the trigger.
- **The spacer.** An `h-8` spacer (`md:hidden`) lengthens the page by 32px. With it, the last card's bottom edge clears the floating trigger when the page is scrolled to the end:
  - the card's bottom edge: 82 + 32 (the `Page`'s `pb-8`) + 20 (its `gap-5`) + 32 = 166px from the viewport bottom
  - the trigger's top: 94 + 48 = 142px

**Accessibility.**
- **Focus.** Base UI's Drawer is modal by default:
  - It traps focus, locks page scroll, and makes the rest of the page inert.
  - It closes on Escape and on an outside press, and returns focus to the trigger.
  - It moves focus into the sheet on open: to the first tabbable element for a keyboard or mouse, or to the sheet itself on touch, so the phone keyboard doesn't pop up.
- **Close button.** The sheet's "Close slip" button is `Drawer.Close`. The Base UI docs require one inside a modal popup, so touch screen-reader users can leave it.
- **Swipe.** Swipe-down-to-dismiss comes with Drawer (`swipeDirection` defaults to `'down'`). The handle bar is decorative (`aria-hidden`).
- **Phone keyboard.** `Drawer.VirtualKeyboardProvider` keeps the focused stake field in view when the phone keyboard opens, which the Base UI docs recommend for a bottom sheet with form fields.
- **Motion.** Transitions are off under `prefers-reduced-motion` (`motion-reduce:transition-none`).

- [ ] **Step 1: Write the failing component test**

Create `tests/components/slip-drawer.test.tsx`. It fails because the module doesn't exist yet. It mocks two things, as `tests/components/slip-form.test.tsx` and `tests/components/slip-pick.test.tsx` do after Tasks 4 and 5:
- `@number-flow/react`, which jsdom can't upgrade
- `sonner`, used by the Remove buttons' `ToastActionForm`

The combined-odds check matches the `<p>`'s text content rather than one exact node, since Task 4 splits it into a label, an `sr-only` copy and the animated copy.

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { SlipPick as SlipPickView, SlipView } from '@/lib/parlays/get-slip'
import { combineOdds } from '@/lib/parlays/odds'

vi.mock('@number-flow/react', () => ({
  default: ({ value, suffix }: { value: number; suffix?: string }) => `${value}${suffix ?? ''}`,
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn() } }))

const { placeParlayAction } = vi.hoisted(() => ({ placeParlayAction: vi.fn() }))
vi.mock('@/lib/parlays/place-parlay', () => ({ placeParlayAction }))
vi.mock('@/lib/parlays/slip-actions', () => ({ removeFromSlipAction: vi.fn() }))

import { SlipDrawer } from '@/app/(app)/markets/[id]/slip-drawer'

function pick(n: number): SlipPickView {
  return { outcomeId: `o${n}`, outcomeLabel: 'Yes', marketId: `m${n}`, marketTitle: `Market ${n}?`, oddsBp: 40_000, available: true }
}

function slipView(picks: SlipPickView[]): SlipView {
  const legBps = picks.flatMap((p) => (p.oddsBp !== null ? [p.oddsBp] : []))
  return { picks, legBps, ...combineOdds(legBps), canPlace: picks.length >= 2 }
}

beforeEach(() => {
  placeParlayAction.mockReset()
})

describe('SlipDrawer', () => {
  it('renders nothing while the slip is empty', () => {
    const { container } = render(<SlipDrawer slip={slipView([])} />)
    expect(container).toBeEmptyDOMElement()
    expect(screen.queryByRole('button', { name: /^Slip/ })).toBeNull()
  })

  it('shows a phone-only "Slip (n)" trigger and mounts no slip content until it is pressed', () => {
    render(<SlipDrawer slip={slipView([pick(1), pick(2)])} />)
    const trigger = screen.getByRole('button', { name: 'Slip (2)' })
    expect(trigger).toHaveClass('md:hidden', 'fixed', 'bottom-[94px]')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Place parlay' })).toBeNull()
    expect(screen.queryByLabelText('Stake (DC)')).toBeNull()
  })

  it('opens a bottom sheet named by the slip heading, holding the picks, the stake and Place parlay', async () => {
    render(<SlipDrawer slip={slipView([pick(1), pick(2)])} />)
    await userEvent.click(screen.getByRole('button', { name: 'Slip (2)' }))

    const sheet = await screen.findByRole('dialog', { name: 'Your slip' })
    expect(within(sheet).getByRole('link', { name: 'Market 1?' })).toHaveAttribute('href', '/markets/m1')
    expect(within(sheet).getByRole('link', { name: 'Market 2?' })).toBeInTheDocument()
    expect(within(sheet).getByText(/^Combined:/)).toHaveTextContent('Combined: 16.00×')
    expect(within(sheet).getByLabelText('Stake (DC)')).toBeInTheDocument()
    expect(within(sheet).getByRole('button', { name: 'Place parlay' })).toBeInTheDocument()
  })

  it('closes on Escape and on its close button, returning focus to the trigger', async () => {
    render(<SlipDrawer slip={slipView([pick(1), pick(2)])} />)
    const trigger = screen.getByRole('button', { name: 'Slip (2)' })

    await userEvent.click(trigger)
    await screen.findByRole('dialog', { name: 'Your slip' })
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(trigger).toHaveFocus()

    await userEvent.click(trigger)
    await userEvent.click(await screen.findByRole('button', { name: 'Close slip' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(trigger).toHaveFocus()
  })

  it('stays open with the success message after placing empties the slip', async () => {
    placeParlayAction.mockResolvedValue({ placed: { multiplierBp: 160_000, potentialPayout: 80 } })
    const { rerender } = render(<SlipDrawer slip={slipView([pick(1), pick(2)])} />)

    await userEvent.click(screen.getByRole('button', { name: 'Slip (2)' }))
    await userEvent.type(await screen.findByLabelText('Stake (DC)'), '5')
    await userEvent.click(screen.getByRole('button', { name: 'Place parlay' }))
    await screen.findByText('Parlay placed at 16.00× — potential payout 80 DC.')

    rerender(<SlipDrawer slip={slipView([])} />)
    const sheet = screen.getByRole('dialog', { name: 'Your slip' })
    expect(within(sheet).getByText('Parlay placed at 16.00× — potential payout 80 DC.')).toBeInTheDocument()
    expect(within(sheet).getByText('Your slip is empty.')).toBeInTheDocument()
    expect(screen.queryByText(/^Slip \(/)).toBeNull()
  })
})
```

jsdom can't follow Base UI's focus guards when tabbing, so the focus trap is checked in the e2e spec (Step 7) rather than here.

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/components/slip-drawer.test.tsx`
Expected: FAIL. The suite can't resolve `@/app/(app)/markets/[id]/slip-drawer`.

- [ ] **Step 3: Write `app/(app)/markets/[id]/slip-drawer.tsx`**

```tsx
'use client'

import { useState } from 'react'
import { Drawer } from '@base-ui/react/drawer'
import { Layers, X } from 'lucide-react'
import { SlipForm } from '@/app/(app)/parlays/slip-form'
import { buttonVariants } from '@/components/ui/button'
import type { SlipView } from '@/lib/parlays/get-slip'
import { cn } from '@/lib/utils'

export function SlipDrawer({ slip }: { slip: SlipView }) {
  const [open, setOpen] = useState(false)
  const count = slip.picks.length
  // Placing a parlay empties the slip while the drawer is open. SlipForm's success message lives
  // inside the drawer, so the drawer stays mounted until the member closes it.
  if (count === 0 && !open) return null

  return (
    <Drawer.Root open={open} onOpenChange={setOpen}>
      {count > 0 && (
        <>
          <div aria-hidden="true" className="h-8 md:hidden" />
          <Drawer.Trigger
            className={cn(
              buttonVariants(),
              'fixed right-4 bottom-[94px] z-20 rounded-full tabular-nums shadow-overlay md:hidden',
            )}
          >
            <Layers aria-hidden="true" className="size-5" />
            {`Slip (${count})`}
          </Drawer.Trigger>
        </>
      )}
      <Drawer.VirtualKeyboardProvider>
        <Drawer.Portal>
          <Drawer.Backdrop className="fixed inset-0 z-40 bg-scrim opacity-[calc(1-var(--drawer-swipe-progress))] transition-opacity duration-[450ms] ease-[cubic-bezier(0.32,0.72,0,1)] data-ending-style:opacity-0 data-starting-style:opacity-0 data-swiping:duration-0 data-ending-style:duration-[calc(var(--drawer-swipe-strength)*400ms)] motion-reduce:transition-none" />
          <Drawer.Viewport className="fixed inset-0 z-40 flex items-end justify-center">
            <Drawer.Popup
              aria-labelledby="slip-title"
              className="flex max-h-[calc(100dvh-48px)] w-full flex-col rounded-t-card border border-b-0 border-line bg-bg text-ink shadow-overlay outline-none [transform:translateY(var(--drawer-swipe-movement-y))] transition-transform duration-[450ms] ease-[cubic-bezier(0.32,0.72,0,1)] data-swiping:select-none data-swiping:duration-0 data-starting-style:[transform:translateY(100%)] data-ending-style:[transform:translateY(100%)] data-ending-style:duration-[calc(var(--drawer-swipe-strength)*400ms)] motion-reduce:transition-none"
            >
              <div className="relative flex shrink-0 justify-end px-2 pt-2">
                <span aria-hidden="true" className="absolute top-2.5 left-1/2 h-1.5 w-12 -translate-x-1/2 rounded-full bg-line-s" />
                <Drawer.Close
                  aria-label="Close slip"
                  className="inline-flex size-11 cursor-pointer items-center justify-center rounded-control text-ink hover:bg-sunk"
                >
                  <X aria-hidden="true" className="size-[22px]" />
                </Drawer.Close>
              </div>
              <Drawer.Content className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-6">
                <SlipForm slip={slip} />
              </Drawer.Content>
            </Drawer.Popup>
          </Drawer.Viewport>
        </Drawer.Portal>
      </Drawer.VirtualKeyboardProvider>
    </Drawer.Root>
  )
}
```

Notes on the classes:
- `--drawer-swipe-movement-y`, `--drawer-swipe-progress` and `--drawer-swipe-strength` are CSS variables Base UI sets on the popup and backdrop while the member drags the sheet. The sheet follows the finger, the backdrop fades as it goes, and a fast flick closes faster.
- `data-starting-style` and `data-ending-style` slide the sheet in from, and out to, the bottom edge.

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run tests/components/slip-drawer.test.tsx`
Expected: PASS (5 tests)

- [ ] **Step 5: Wire the drawer into `app/(app)/markets/[id]/page.tsx`**

Make these three edits to the page as Task 3 left it. Each "before" snippet is copied from Task 3's Step 6 listing.

(a) Imports. Replace:

```typescript
import { rowState } from '@/lib/markets/row-state'
import { readSlip } from '@/lib/parlays/slip'
```

with:

```typescript
import { rowState } from '@/lib/markets/row-state'
import { getSlipView } from '@/lib/parlays/get-slip'
import { readSlip } from '@/lib/parlays/slip'
```

and replace:

```typescript
import { BetForm } from './bet-form'
import { ResolveForm } from './resolve-form'
import { VoidButton } from './void-button'
```

with:

```typescript
import { BetForm } from './bet-form'
import { ResolveForm } from './resolve-form'
import { SlipDrawer } from './slip-drawer'
import { VoidButton } from './void-button'
```

(b) Read the slip view right after the slip ids. Replace:

```typescript
  const resolvedLabel = market.status === 'resolved' ? market.resolvedOutcomeLabel : null

  const slip = await readSlip()
  const marketInSlip = market.outcomes.some((o) => slip.includes(o.id))
```

with:

```typescript
  const resolvedLabel = market.status === 'resolved' ? market.resolvedOutcomeLabel : null

  const slip = await readSlip()
  const slipView = await getSlipView(supabase, slip)
  const marketInSlip = market.outcomes.some((o) => slip.includes(o.id))
```

(c) Render the drawer last in the page, after the grid. Replace:

```tsx
        <SectionCard title="Bets" titleId="bets-title" className="gap-1 lg:col-start-1 lg:row-start-3">
          <BetList bets={bets} outcomes={market.outcomes} viewerId={user.id} canBet={canBet} />
        </SectionCard>
      </div>
    </Page>
```

with:

```tsx
        <SectionCard title="Bets" titleId="bets-title" className="gap-1 lg:col-start-1 lg:row-start-3">
          <BetList bets={bets} outcomes={market.outcomes} viewerId={user.id} canBet={canBet} />
        </SectionCard>
      </div>

      <SlipDrawer slip={slipView} />
    </Page>
```

- [ ] **Step 6: Run the unit suite and the build**

Run: `npm run lint && npx vitest run && npm run build`
Expected: all PASS

- [ ] **Step 7: Write `e2e/slip-drawer.spec.ts`**

The spec runs at 375px. It builds a two-pick slip from two markets, each with a 1 DC bet on Yes and on No, so each Yes leg is 2.00× and the parlay is 4.00×. That spends 5 DC of the seeded 100. It then checks, in order:
- the trigger is hidden at 1280px
- the trigger clears the tab bar
- the sheet traps focus, closes on Escape and returns focus to the trigger
- the parlay can be placed from the sheet

Every query is scoped to a region or to the sheet, so a Task 5 toast can't add a match. Two assertions read the toasts themselves, with `.first()` because repeated bets stack several copies: "Bet placed.", and "Added to your slip." from a form that has already unmounted. `Combined: 4.00×` uses the same `getByText` form as `e2e/parlays.spec.ts`'s `Combined: 16.00×`, and it resolves the same way with Task 4's `AnimatedText`.

```typescript
import { test, expect } from '@playwright/test'
import { localDateTimeString } from './local-date-time'

test.use({ viewport: { width: 375, height: 812 } })

test('on a phone, the slip drawer on a market page holds the picks and places the parlay', async ({ page }) => {
  for (const title of ['Drawer leg one?', 'Drawer leg two?']) {
    await page.goto('/markets/new')
    await page.getByLabel('Title').fill(title)
    await page.getByLabel('Close time').fill(localDateTimeString(new Date(Date.now() + 60 * 60 * 1000)))
    await page.getByRole('button', { name: 'Create market' }).click()
    await expect(page).toHaveURL(/\/markets\/[0-9a-f-]+/)

    for (const label of ['Yes', 'No']) {
      await page.getByRole('combobox').first().selectOption({ label })
      await page.getByPlaceholder('Amount (DC)').fill('1')
      await page.getByRole('button', { name: 'Place bet' }).click()
      await expect(page.getByRole('region', { name: 'Bets' }).getByText(`1 DC on ${label}`)).toBeVisible()
    }

    await page
      .getByRole('region', { name: 'Outcomes' })
      .getByRole('listitem')
      .filter({ hasText: 'Yes' })
      .getByRole('button', { name: 'Add to parlay' })
      .click()
    await expect(page.getByRole('region', { name: 'Outcomes' }).getByText('In your slip')).toBeVisible()
  }
  // Task 5's toasts survive their forms: "Add to parlay" has just turned into "In your slip".
  await expect(page.getByText('Bet placed.').first()).toBeVisible()
  await expect(page.getByText('Added to your slip.').first()).toBeVisible()

  const trigger = page.getByRole('button', { name: 'Slip (2)', exact: true })
  await expect(trigger).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByLabel('Stake (DC)')).toHaveCount(0)

  // Desktop keeps /parlays: from md up there is no trigger.
  await page.setViewportSize({ width: 1280, height: 800 })
  await expect(trigger).toBeHidden()
  await page.setViewportSize({ width: 375, height: 812 })
  await expect(trigger).toBeVisible()

  // The trigger floats above the fixed tab bar rather than behind it.
  const tabBar = await page.getByRole('navigation', { name: 'Primary' }).boundingBox()
  const triggerBox = await trigger.boundingBox()
  expect(triggerBox!.y + triggerBox!.height).toBeLessThanOrEqual(tabBar!.y)

  await trigger.click()
  const sheet = page.getByRole('dialog', { name: 'Your slip' })
  await expect(sheet).toBeVisible()
  await expect(sheet.getByRole('link', { name: 'Drawer leg one?' })).toBeVisible()
  await expect(sheet.getByRole('link', { name: 'Drawer leg two?' })).toBeVisible()
  await expect(sheet.getByText('Combined: 4.00×')).toBeVisible()
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press('Tab')
    await expect(sheet.locator(':focus')).toHaveCount(1)
  }

  await page.keyboard.press('Escape')
  await expect(sheet).toHaveCount(0)
  await expect(trigger).toBeFocused()

  await trigger.click()
  await sheet.getByLabel('Stake (DC)').fill('1')
  await sheet.getByRole('button', { name: 'Place parlay' }).click()
  await expect(sheet.getByText('Parlay placed at 4.00× — potential payout 4 DC.')).toBeVisible()
  await expect(sheet.getByText('Your slip is empty.')).toBeVisible()

  await sheet.getByRole('button', { name: 'Close slip' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByRole('button', { name: /^Slip \(/ })).toHaveCount(0)
})
```

The sheet has seven tabbable elements: Close slip, two market links, two Remove buttons, Stake, and Place parlay. Eight Tabs wrap past the last one, so the loop fails if focus ever escapes to the page.

- [ ] **Step 8: Run the e2e suite**

Run: `lsof -ti:3000 | xargs -r kill 2>/dev/null; npx playwright test`
Expected: 18 passed. That's the 17 from Task 6 plus `slip-drawer.spec.ts`.

These existing e2e checks touch the market page at desktop width, where the trigger is `display: none` and the sheet is never mounted. Each one still resolves to one element:
- `parlays.spec.ts`: the Outcomes region, `In your slip`, and `Place parlay` / `Stake (DC)` on `/parlays`
- `market-engine.spec.ts`: the first and last `combobox`

- [ ] **Step 9: Commit**

```bash
git add "app/(app)/markets/[id]/slip-drawer.tsx" "app/(app)/markets/[id]/page.tsx" tests/components/slip-drawer.test.tsx e2e/slip-drawer.spec.ts
git commit -m "Add the phone bet-slip drawer to market pages"
```

---

## Task 8: Cleanup and full verification

**Files:**
- Modify: `package.json` (remove `vaul` and `@radix-ui/react-dialog`)
- Modify: `package-lock.json` (regenerated by `npm uninstall`)
- Temporary, not committed: `e2e/zz-visual.spec.ts` (Step 7, the controller's screenshot spec, deleted after use)

**Interfaces:**
- Consumes: every PR C task.
  - Task 2's `@base-ui/react`
  - Task 6's Base UI AlertDialog
  - Task 7's Base UI Drawer. These two replace what `vaul` and `@radix-ui/react-dialog` were installed for.
  - The chart (Tasks 1 to 3), NumberFlow (Task 4) and toasts (Task 5), for the visual check.
- Produces: nothing new. This is the last task.

Neither package is imported anywhere. PR A installed them ahead of a drawer and dialog that PR C now builds with Base UI. The handoff calls `vaul` unmaintained. Nothing else in the tree depends on `@radix-ui/*`: after the uninstall, `package-lock.json` has no `@radix-ui` entries left.

- [ ] **Step 1: Confirm nothing imports either package**

Run: `git grep -n -E "from '(vaul|@radix-ui/[^']+)'"`
Expected: no output (exit code 1).

- [ ] **Step 2: Uninstall them**

Run: `npm uninstall vaul @radix-ui/react-dialog`

- [ ] **Step 3: Confirm they're gone from the tree and the lockfile**

Run: `npm ls vaul @radix-ui/react-dialog`
Expected: `└── (empty)`. npm exits with code 1 when the list is empty; that is the expected result here.

Run: `grep -c -E '"node_modules/(vaul|@radix-ui/[^"]+)"' package-lock.json`
Expected: `0`

Run: `git diff package.json`
Expected: only these changes in `dependencies`:
- `"@radix-ui/react-dialog": "^1.1.23",` is removed.
- `"vaul": "^1.1.2"` is removed.
- `"tailwind-merge": "^3.7.0",` loses its trailing comma, because it is now the last entry.

`@base-ui/react`, `@number-flow/react`, `recharts` and `sonner` stay.

- [ ] **Step 4: Run the whole chain**

Run: `npm run lint && npx vitest run && npm run build`
Expected: all PASS.

Run: `npm run db:reset && (lsof -ti:3000 | xargs -r kill 2>/dev/null); npx playwright test`
Expected: PASS, 18 tests:
- PR B's 15
- `charts.spec.ts` (Task 3)
- `void-market.spec.ts` (Task 6)
- `slip-drawer.spec.ts` (Task 7)

- [ ] **Step 5: Re-run the chain on the CLI version CI pins**

```bash
npx -y supabase@2.115.0 stop --no-backup
npx -y supabase@2.115.0 start
npm run lint
npx vitest run
npm run build
npx -y supabase@2.115.0 db reset
lsof -ti:3000 | xargs -r kill 2>/dev/null
npx playwright test
```

Expected: every step passes on this exact CLI version, with 18 e2e tests.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json
git commit -m "Remove vaul and @radix-ui/react-dialog, now replaced by Base UI"
```

- [ ] **Step 7 (controller, not the implementer): visual check at 375px and 1280px, light and dark**

The executing controller does this step. It isn't dispatched to a subagent. As in PR B, the controller takes screenshots with a temporary Playwright spec, views them, and deletes the spec. Nothing from this step is committed.

1. Create `e2e/zz-visual.spec.ts`:

```typescript
import { test, expect, type Page } from '@playwright/test'
import { localDateTimeString } from './local-date-time'

// Temporary: the controller's PR C visual check. Delete this file after viewing the screenshots.
const OUT = process.env.VISUAL_OUT ?? 'test-results/visual'

async function createMarket(page: Page, title: string) {
  await page.goto('/markets/new')
  await page.getByLabel('Title').fill(title)
  await page.getByLabel('Close time').fill(localDateTimeString(new Date(Date.now() + 60 * 60 * 1000)))
  await page.getByRole('button', { name: 'Create market' }).click()
  await expect(page).toHaveURL(/\/markets\/[0-9a-f-]+/)
}

async function bet(page: Page, label: string, amount: number) {
  await page.getByRole('combobox').first().selectOption({ label })
  await page.getByPlaceholder('Amount (DC)').fill(String(amount))
  await page.getByRole('button', { name: 'Place bet' }).click()
  await expect(page.getByRole('region', { name: 'Bets' }).getByText(`${amount} DC on ${label}`)).toBeVisible()
}

async function addYesToSlip(page: Page) {
  await page
    .getByRole('region', { name: 'Outcomes' })
    .getByRole('listitem')
    .filter({ hasText: 'Yes' })
    .getByRole('button', { name: 'Add to parlay' })
    .click()
  await expect(page.getByRole('region', { name: 'Outcomes' }).getByText('In your slip')).toBeVisible()
}

for (const scheme of ['light', 'dark'] as const) {
  for (const width of [375, 1280]) {
    test(`PR C visual check at ${width}px, ${scheme}`, async ({ page }) => {
      const shot = (name: string) => `${OUT}/${name}-${width}-${scheme}.png`
      await page.emulateMedia({ colorScheme: scheme })
      await page.setViewportSize({ width, height: width === 375 ? 812 : 800 })

      await createMarket(page, `Visual leg one ${width} ${scheme}?`)
      const firstUrl = page.url()
      await page.screenshot({ path: shot('chart-no-bets') })
      await bet(page, 'Yes', 3)
      await page.screenshot({ path: shot('toast-bet-placed') })
      await bet(page, 'No', 1)
      await addYesToSlip(page)
      await page.screenshot({ path: shot('toast-pick-added') })
      await page.getByRole('region', { name: 'Chance over time' }).screenshot({ path: shot('chart-detail') })
      await page.screenshot({ path: shot('market-page'), fullPage: true })

      await page.getByRole('button', { name: 'Void this market', exact: true }).click()
      await expect(page.getByRole('alertdialog', { name: 'Void this market?' })).toBeVisible()
      await page.keyboard.press('Tab')
      await page.screenshot({ path: shot('void-dialog') })
      await page.keyboard.press('Escape')

      await createMarket(page, `Visual leg two ${width} ${scheme}?`)
      await bet(page, 'Yes', 1)
      await bet(page, 'No', 1)
      await addYesToSlip(page)
      if (width === 375) {
        await page.screenshot({ path: shot('slip-trigger'), fullPage: true })
        await page.getByRole('button', { name: 'Slip (2)', exact: true }).click()
        await expect(page.getByRole('dialog', { name: 'Your slip' })).toBeVisible()
        await page.getByLabel('Stake (DC)').fill('1')
        await page.screenshot({ path: shot('slip-drawer') })
        await page.keyboard.press('Escape')
      }

      await page.getByRole('combobox').last().selectOption({ label: 'Yes' })
      await page.getByRole('button', { name: 'Confirm outcome' }).click()
      await expect(page.getByText('Status: resolved')).toBeVisible()
      await page.screenshot({ path: shot('toast-resolved') })
      await page.getByRole('region', { name: 'Chance over time' }).screenshot({ path: shot('chart-resolved') })

      await page.goto(firstUrl)
      await page.getByRole('button', { name: 'Void this market', exact: true }).click()
      await page.getByRole('alertdialog').getByRole('button', { name: 'Void market', exact: true }).click()
      await expect(page.getByText('Status: voided')).toBeVisible()
      await page.screenshot({ path: shot('toast-voided') })

      await page.goto('/markets')
      await page.screenshot({ path: shot('markets-list'), fullPage: true })
    })
  }
}
```

2. Run it on its own. Its global setup reseeds the database, so the member starts at 100 DC, and each run spends under 10 DC:

```bash
lsof -ti:3000 | xargs -r kill 2>/dev/null
VISUAL_OUT="$SCRATCHPAD/prc-visual" npx playwright test e2e/zz-visual.spec.ts
```

(`$SCRATCHPAD` is the controller's scratchpad directory. Leave `VISUAL_OUT` unset to write under the git-ignored `test-results/visual/`.) Expected: 4 passed, with 12 PNGs from each 375px run and 10 from each 1280px run (the two slip shots are phone-only).

3. View every PNG. Compare the chart shots with `ProbabilityChart.dc.html` and the "Chance over time" card on the `Market--*` / `MarketResolved--*` artboards (dark: `raw/project/*-dark.dc.html`). Compare the list with `MarketCard.html`. Check each item below.

   **Chart, detail** (`chart-no-bets`, `chart-detail`, `chart-resolved`):
   - one step line per outcome in its series colour
   - end-of-line labels in the 128px right gutter
   - the no-bets copy on the fresh market
   - the "Resolved: Yes" shaded zone on the resolved one

   Fresh data spans minutes, so only "All" applies and the 1D / 1W / All control should be absent. That absence is the check here; the control itself is covered by Task 2's tests.

   **Chart, compact** (`markets-list`): every `MarketCard` shows its 84px chart, with end dots and no axes.

   **Dialog** (`void-dialog`):
   - scrim over the page
   - `bg-surface` card with `rounded-card`, a border, and the overlay shadow in light (none in dark)
   - the title, the body copy, then Cancel and Void market. These are stacked full-width at 375px and right-aligned in a row at 1280px.
   - a visible focus ring on Void market after the one Tab

   **Drawer** (`slip-trigger`, `slip-drawer`, 375px only):
   - the "Slip (2)" pill sits above the tab bar and doesn't cover the last card when the page is scrolled to the end
   - the sheet rises from the bottom edge over the tab bar, with the handle bar and the Close button
   - the "Your slip" card holds both picks, the combined odds, the stake and the payout line, with Place parlay fully visible

   **Toasts** (`toast-*`):
   - themed with tokens in both themes
   - top-center below the top bar at 375px (clear of the "Slip (n)" button), bottom-right at 1280px
   - no toast copy duplicates the inline text beside it
   - `toast-pick-added` and `toast-voided` each show their toast. The form that fires each of these unmounts on success: "Add to parlay" becomes "In your slip", and the void card disappears. Check them specifically.

   **NumberFlow:** the nav balance chip and the outcome percentages read correctly in every shot.

   **Everywhere:**
   - every control is at least 44px
   - focus rings are visible
   - no sideways scroll at 375px (compare the full-page shots' width with the viewport)

4. Delete `e2e/zz-visual.spec.ts` (and the PNGs, if they went under `test-results/visual/`). Run `git status` and confirm the tree is clean.
5. Record every mismatch as a final-review finding.

---


## Self-Review

**Spec coverage (PR C section):**
- **`ProbabilityChart`** → Task 2. It is Recharts v3 through a copied shadcn/ui `chart` wrapper, and it covers:
  - a `stepAfter` line per outcome
  - a crosshair tooltip
  - end-of-line labels
  - 1D / 1W / All ranges in a Base UI ToggleGroup, hidden when only one range applies
  - "Closed {date}" / "Resolved: {outcome}" shading
  - the no-bets state
  - compact mode
  - an accessible summary ✓
- **Chart data (pool share after each bet, from `bets` in time order, no new table)** → Task 1, with exact-series unit tests and DB tests for both readers ✓
- **Where the chart appears (market detail, plus compact on every `MarketCard`)** → Task 3 ✓
- **NumberFlow for odds, balances and payouts** → Task 4 ✓
- **sonner success toasts for actions that don't navigate, with errors staying inline** → Task 5 ✓
- **Phone bet-slip drawer (Base UI Drawer)** → Task 7 ✓
- **Void confirmation (Base UI AlertDialog)** → Task 6 ✓
- **Removing `vaul` and `@radix-ui/react-dialog`** → Task 8 ✓
- **Testing: "a market page with bets renders its chart"** → `e2e/charts.spec.ts` in Task 3. Tasks 6 and 7 add e2e checks for the dialog and the drawer ✓

**New copy for sign-off:**
- **Toasts:**
  - "Bet placed."
  - "Added to your slip." / "Removed from your slip."
  - "Submitted for review."
  - "Submission approved." / "Submission rejected."
  - "Invite added."
  - "Balance adjusted."
  - "Market resolved." / "Market voided."
- **Drawer:** the trigger "Slip (n)" and the screen-reader label "Close slip".
- **Chart summary:** "{n} bets".
- **From the spec or the handoff (already approved):** the void dialog's copy and "No bets yet — the chart starts with the first bet."

**Placeholder scan:** none. A final documentation pass removed every pointer to drafting notes and checked task references, e2e counts and `git add` lists.

**Type consistency:** the fixed interfaces all match their producers and consumers, in code that ran together in one copy:
- `ChartBet`, `SeriesPoint`, `RangeKey`, `buildProbabilitySeries`, `sliceRange` and `availableRanges`
- `getChartBets` and `listChartBets`
- `ProbabilityChart` and `ChartOutcome`
- `AnimatedText`, `withSuccessToast` and `ToastActionForm`
