---
name: new-route
description: Add a signed-in page (a route under app/(app)/) to DwellDuel the way this repo requires — Page and h1, a loading.tsx skeleton or a streamed Suspense, the signed-out redirect list, back-swipe parent, live subscriptions, paging, intent prefetch and docs. Use whenever a change adds a new page, section or drill-down route, or moves one.
---

# New route

Every rule below is in AGENTS.md; this is the order to apply them in for a new page. Read
`node_modules/next/dist/docs/` for anything Next-specific (this is Next 16: `proxy.ts`, typed
`PageProps<'/route'>`, `searchParams` and `params` are promises).

1. **Place it.** Signed-in pages live under `app/(app)/`. A `loading.tsx` wraps every route below
   it, so if a child must return a real 404 (an unknown id), put the list page in a route group
   (`markets/(list)/`) so its skeleton doesn't cover the child.
2. **Gate it.** A new top-level section goes in `APP_SECTIONS` in `lib/auth/app-paths.ts`
   (`tests/lib/auth/app-paths.test.ts` guards the drift), so `proxy.ts` redirects signed-out
   visitors. The page itself calls `requireUser()` and redirects to `/sign-in` without a user. A
   role-gated page checks `atLeast(await getRole(supabase), '<min>')`; balances, deletes and roles
   are the owner's alone.
3. **Shape it.** The page returns one `<Page>` (`components/ui/page.tsx`) with exactly one `<h1>`,
   from `PageHeader` or `h1Class`. `width` is `wide` (default) or `reading`; don't cap a card's
   width inside it. Regions are `SectionCard`s whose `<h2>` names the region (a line under it goes in
   `description`). An empty list renders `EmptyState`. A list item that opens one thing is a
   `ListCard` in `listCardsClass`; a sentence (feed) or data (ledger) row stays a divided row.
   Tokens only (`bg-surface`, `text-ink2`…), no raw colours or `text-[Npx]`. Type and padding
   switch at `md:`, grids at `lg:`.
4. **Drill-down or tab.** A page reached from another page (a detail, settings, a form) passes
   `transition="drill-down"` and gets a logical parent in `logicalParent()` in
   `lib/nav/back-swipe.ts`, with a case in `tests/lib/nav/back-swipe.test.ts`. A nav tab passes
   `transition="tab"`.
5. **Loading.** Add `loading.tsx` returning a `SkeletonScreen` (`components/ui/skeleton.tsx`) with
   `className={pageClassFor(width)}`, shaped like the page (see `app/(app)/feed/loading.tsx`).
   Exception: a page that must 404 on an unknown id has no `loading.tsx`; it checks the row exists,
   then streams the body behind `<Suspense>` (see `app/(app)/members/[id]/page.tsx`). Several
   streamed sections pass their fallbacks `announce={false}` inside one `<LoadingStatus>`.
6. **Live.** If it shows data others change, add a function to `pageSubscriptions` in
   `lib/live/page-subscriptions.ts` with a comment saying why each source, and render
   `<LiveTables subscriptions={pageSubscriptions.x(…)} />`. Every row subscription has a filter;
   prefer a topic for anything group-wide; never follow `profiles` group-wide. A new table or
   topic needs a migration (use the `new-migration` skill). Check the budget in
   `docs/ARCHITECTURE.md`.
7. **Paging.** A list that grows pages with `lib/pagination` and `ShowMore` (keyset, a plain
   timestamp bound beside the cursor, `rowDomId`/`focusTarget` on rows, one `<ShowMoreFocus />`,
   `NothingOlder` for an empty window). `.in(col, ids)` lookups that grow are `chunk()`ed.
8. **Links.** Links into it from the nav, `SubNav` or dense lists go through `IntentLink`, never
   viewport prefetch. Tab state lives in the URL (`?tab=`) through `SubNav`. Every tap target is
   `pressable` and at least 44px; a card made tappable by one link is `relative pressable` with a
   `stretched-link`.
9. **Forms and actions.** Controlled fields; an action that creates something sends a
   `useAttemptKey` key; money or access changes confirm first and are never optimistic; a new
   member-entered text column gets `TEXT_LIMITS`, `maxLength` and `tooLong`.
10. **Test.** A unit test for any new helper (`tests/lib/…`), and an e2e spec in `e2e/` if the page
    is a flow members rely on (await `serverActionSettled` after optimistic actions).
11. **Document in the same PR.** A row in the Routes table in `docs/ARCHITECTURE.md` (and Code
    layout if you added a folder), `docs/HOW-IT-WORKS.md` if members see a new rule, and a line in
    `CHANGELOG.md` under `## Unreleased`.
12. **Verify.** `npm run lint`, `npm run typecheck`, `npm test`, then open it in the preview
    (`.claude/launch.json`) at phone and desktop widths, light and dark. Shell changes also get
    `npm run check:ios`.
