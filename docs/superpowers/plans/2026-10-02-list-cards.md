# List items as cards (#328) — plan

Binding design: the "Design approved (2026-10-02)" comment on #328. UI only; no migration.

## Files

- `app/globals.css`: `--radius-tile: 14px` beside `--radius-control` / `--radius-card` (gives `rounded-tile`).
- `components/ui/list-card.tsx` (new):
  - `listCardsClass` — `flex flex-col gap-2`, the list inside a `SectionCard`, no dividers.
  - `listCardClass` — the box: `rounded-tile border border-line p-3.5 md:p-4`, no shadow.
  - `tappableListCardClass` — the box plus `pressable hover-tint relative [--tint-inset:0] before:rounded-[inherit]`.
  - `ListCard` — an `<li>` with those classes; `tappable` (default true) for a card one stretched link opens;
    `tappable={false}` for a card whose only controls are its own buttons (tasks, review queue, catalog).
- Moved onto it:
  - `components/parlays/placed-parlay.tsx` (the `<li>` is the card; no inner div).
  - `app/(app)/bets/bet-rows.tsx` — solo and cancelled bets; 3 columns at `lg:`.
  - `app/(app)/bets/page.tsx` — card tabs drop the divided list's `gap-1` and the Show more hairline.
  - `components/tasks/task-row.tsx` + `app/(app)/tasks/page.tsx` — 2 columns at `lg:`, action on the right.
  - `components/admin/awaiting-market-row.tsx` + admin markets page — stretched title, creator link and
    Resolve in `relative z-[1]`; 3 columns at `lg:`.
  - `app/(app)/admin/(sections)/tasks/task-catalog-item.tsx` + page — 2 columns at `lg:`.
  - `app/(app)/admin/(sections)/tasks/pending-approvals.tsx` — 2 columns at `lg:`; row Approve stays direct
    and stays the first "Approve" in the DOM.
  - `components/leaderboard/leaderboard-row.tsx` + leaderboard page — one column, "me" keeps `bg-acc-soft`.
  - `app/(app)/admin/members/member-row.tsx` + members page, `components/home/home-tiles.tsx` — below `lg:`
    bordered list cards with a gap; from `lg:` the existing lifted cards.
- Every matching `loading.tsx` skeleton follows the new shapes.
- Docs: AGENTS.md UI conventions, `docs/design/app-redesign-handoff.md`, `CHANGELOG.md` (Unreleased › Polish).

Unchanged (divided rows): feed, ledger, coin history (My bets › Coins and a member's Admin page), invites,
a market's bet list.

## Tests (first)

- `tests/components/press-feedback.test.tsx`: a `ListCard` case (stretched link + a button in `z-[1]`);
  a test that `ListCard` is bordered, `rounded-tile`, tints flush and never lifts, and that a non-tappable
  one doesn't press; the parlay test reads the `<li>` itself; `--radius-tile` is 14px in `globals.css`.
- A test that the card lists (bets, tasks, awaiting markets, catalog, pending approvals, leaderboard) render
  `ListCard`s with no `divide-y` on their list.
- Existing e2e (approve first "Approve", cancel bet, parlays) cover behaviour.
