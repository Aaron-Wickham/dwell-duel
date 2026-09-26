<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# DwellDuel

Next.js (App Router) + TypeScript + Tailwind, Supabase (Postgres, auth,
storage), deployed on Vercel. This is an early scaffold — no features, no
data model, no `docs/ARCHITECTURE.md` yet. Once real conventions and
architectural decisions exist, document them here and in `docs/`.

## Working in this repo

- **No unrequested scope creep.** Stay focused on what was asked.
- **Comments explain why, not what.** Default to no comments.
- **DRY, but only once duplication is real.** Don't abstract pre-emptively.

## UI conventions

- **Tokens, never raw colours.** Colours come from the CSS variables in
  `app/globals.css`, through Tailwind utilities (`bg-surface`, `text-ink2`,
  `border-line` and so on). Light and dark are the same markup with
  different variables.
- **Every signed-in page is a `<Page>`.** It lives in `components/ui/page.tsx`
  and has exactly one `<h1>`, from `PageHeader` or `h1Class`. Sections are
  `SectionCard`s, whose `<h2>` names the region. Lists with nothing in them
  render an `EmptyState`.
- **Breakpoints.** The design is phone-first. Type sizes and page padding
  switch at `md:`, the same breakpoint as the nav. Multi-column grids
  switch at `lg:`.
- **Controls.** Every control is a real `<button>`, `<a>` or `<label>`ed
  input, at least 44px tall. Selects and checkboxes stay native. When a
  form shows a server error, wire `aria-invalid` and `aria-describedby`
  at the call site.
- **Links are underlined by default.** The base `a` rule underlines
  every link, matching the mockup (its links use the browser default
  underline). A link styled as a button, tab, tile, chip or nav item
  carries `no-underline`.
- **Visual source of truth:** `docs/design/app-redesign-handoff.md` and
  the design spec in `docs/superpowers/specs/`.

## Native feel and speed

- **Skeletons, or a streamed Suspense.** Every signed-in route gets a
  `loading.tsx` skeleton (`SkeletonScreen`), unless a real 404 must
  survive the initial load, in which case it streams behind `<Suspense>`
  instead, as the member page does.
- **Drill-down pages** pass `Page`'s `transition="drill-down"`, which
  also enables the back-swipe; its logical parents live in
  `lib/nav/back-swipe.ts`.
- **Signed-out redirects** live in `proxy.ts`, and a new `(app)` section
  must be added to `lib/auth/app-paths.ts` (a test guards the drift).
- **The `pressable` and `no-callout` utilities,** plus the `--safe-top` /
  `--safe-bottom` tokens, which are non-zero only in standalone mode.
- **Never optimistic:** bet, parlay, resolve, void and balance actions.
- **The service worker never caches** per-member HTML, RSC payloads,
  server actions or Supabase responses.
- **A new live table** goes in both `LIVE_TABLES` and a
  realtime-publication migration.
- **E2e specs await `serverActionSettled`** after an optimistic action,
  before navigating away.

## Testing

- `npm test` runs the Vitest suite; `npm run test:e2e` runs Playwright
  (builds and starts its own production server on port 3000 — kill any
  server already listening there first).
- `npm run db:reset` before running tests that hit local Supabase, once
  there are migrations to reset against.

## Migrations

- Sequential, zero-padded numbering (`00NN_description.sql`) in
  `supabase/migrations/`, once the data model exists. Never edit a past
  migration in place — add a new one.
