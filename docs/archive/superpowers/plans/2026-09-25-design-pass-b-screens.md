# Design Pass — PR B: Screens Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle every DwellDuel screen to its mockup artboards, phone-first and in both themes. That covers:
- sign-in, not-invited and a new 404 page
- home
- the markets list, create market and market detail
- parlays
- tasks, feed, leaderboard and profile
- the four admin sections

Every list gets its empty state, the approved copy lands (including the friendly insufficient-balance message), and the one planned e2e selector change is made.

**Architecture:**
- **Built on PR A.** PR A shipped the tokens, the theme, `AppNav` and the primitives (Button, Field, Card, StatusChip, Message). Task 1 adds the page scaffold and the small shared pieces every screen repeats: `Page`, `PageHeader`, `SectionCard`, `EmptyState`, `BackLink` and `Avatar`.
- **One task per screen group.** Each screen task pulls its presentational parts out into `components/<area>/`, as props in and markup out. Those parts get jsdom tests. The async server pages keep fetching data and pass it down, and the forms that call server actions stay beside their routes.
- **No data model changes.** A few readers gain a selected column so a screen can show what its artboard shows. Each change has a DB test.
- **Charts are PR C.** The "Chance over time" cards and `MarketCard`'s compact chart are left out entirely.

**Tech Stack:**
- Next.js 16 (App Router) and TypeScript
- Tailwind CSS v4.3, with PR A's tokens
- `class-variance-authority`, `lucide-react` 1.47 and `tailwind-merge` via `cn()`
- Supabase
- Vitest 4 with React Testing Library and jsdom
- Playwright

**Spec:** [`docs/superpowers/specs/2026-09-25-design-pass-design.md`](../specs/2026-09-25-design-pass-design.md). Read its "PR B — Screens" section, including "Carried from PR A".

**Visual source:**
- the handoff, [`docs/design/app-redesign-handoff.md`](../../design/app-redesign-handoff.md)
- the Claude Design canvas <https://claude.ai/artifact/DkowpVq9ZMm7Gn9rL4cTqw> (artboards `project/<Screen>--<phone|desktop>-<light|dark>.dc.html`; read them with the Artifact tool's `read` action)

Every task below already carries the classes, copy and structure taken from those artboards, so an implementer doesn't need the canvas. Reviewers and the final visual check use it.

## Global Constraints

- **Scope: PR B only.**
  - No charts, NumberFlow, toasts or drawer; those are PR C.
  - No migrations, no access-policy changes, no changes to any coin-moving SQL function.
  - Readers may gain a selected column. Each such change comes with a DB test.
- **Native controls stay native.** `<select>` and `<input type="checkbox">` stay native HTML elements, and so do the radio inputs. No Base UI in this PR.
- **Tokens, never raw colours.**
  - Use only PR A's utilities: `bg-surface`, `text-ink2`, `border-line`, `bg-hero`, `text-hero-2`, `bg-s1`…`bg-s6` and the rest.
  - The only literal colours allowed are the two the mockup hard-codes: `#72DB2B` on the big hero balance, and `.gmark`'s white on teal.
- **Breakpoints.** The design is phone-first: base classes follow the phone artboard. Type sizes and page padding switch at `md:`, the same breakpoint as the nav. Multi-column grids switch at `lg:`, because at 768px the 1120px desktop grids would be too narrow.
- **Page scaffold.**
  - Every signed-in page is wrapped in `Page`.
  - Each page has exactly one `<h1>`, from `PageHeader` or `h1Class`.
  - Sections are `SectionCard`s (a `<section aria-labelledby>` with an `<h2>`), so each one is a named region.
  - Empty lists render `EmptyState`.
- **Accessibility.**
  - Every control is a real `<button>`, `<a>` or `<label>`-tied input, at least 44px tall (`min-h-11`).
  - Icon-only controls get an `aria-label`, and decorative icons get `aria-hidden="true"`.
  - Visually hidden name suffixes put the separating space outside the `sr-only` span: `Remove{' '}<span className="sr-only">{label}</span>`. jsdom drops a leading space inside it.
- **Wire field ARIA at each call site.**
  - A server error renders as `<Message tone="error" id="<form>-error">`.
  - Its input gets `aria-invalid` and `aria-describedby`, plus the `Field` hint id when there is a hint.
  - There is no helper for this.
- **`Message` roles** (changed in Task 1):
  - `error` is `role="alert"`
  - `ok` is `role="status"`
  - `gold` has no live-region role
- **Where files live.**
  - Presentational pieces go in `components/<area>/`.
  - Forms and other client pieces that import server actions stay beside their route under `app/(app)/…`.
  - All component tests go in `tests/components/`, and helper tests in `tests/lib/`.
- **Dates** show in the viewer's own time zone, using `LocalTime` (`components/ui/local-time.tsx`) with `formatDateTime` / `formatDay` (`lib/markets/format-date.ts`). All three come from Task 5.
- **The e2e contract.**
  - Every existing e2e string and role keeps working unchanged, except the one planned selector change in `e2e/parlays.spec.ts` (Task 7).
  - Tasks name the strings they touch. In particular:
    - home keeps exactly one element matching `/Balance: \d+ DC/`
    - each of `Pending review`, `Status: resolved` and `Read Genesis 1-3 — 10 DC` stays exactly one element per item
    - `getByRole('combobox').first()` / `.last()` on a market page are the bet select and the resolve select
    - `getByRole('button', { name: 'Approve' }).first()` on `/admin/tasks` hits a row's Approve button, which is why the bulk toolbar comes after the list
  - **Test counts:** there are 12 e2e tests before Task 3. Task 3 brings it to 13, and Task 13 to 15.
- **Copy.**
  - Mockup copy that isn't sample data is approved copy. Use it verbatim, with its typographic apostrophes (`’`).
  - Sample data (names, "120 DC", "Rank 3 of 8") is replaced with real data.
  - This plan also adds some copy that no artboard draws. Each task lists its strings, and the plan summary collects them for sign-off.
- **Code style:** single quotes, no semicolons, no comments except a non-obvious why. Merge classes with `cn()` from `@/lib/utils`.
- **Paths:** zsh treats `(app)`, `(auth)` and `[id]` as globs, so quote those paths in every shell command.
- **Next.js 16:** read the relevant guide in `node_modules/next/dist/docs/` before writing anything Next-specific (AGENTS.md).
- **Local Supabase must be running** (`npm run db:start`). `npx vitest run` includes `tests/db/`, which wipes and reseeds the local database.

## Rulings this plan makes (from the spec's open items)

- **Home keeps its hero balance.** The mockup and `e2e/foundation.spec.ts` both need "Balance: {n} DC" on home. After someone else changes a member's balance, the hero (fresh on every render) can briefly disagree with the nav chip, which only refreshes when the tab comes back into view or the page reloads. That is an accepted limitation, and it amends the spec's "Carried from PR A" note.
- **`Field` ARIA** is wired at every call site, with no helper. (That item was carried from PR A.)
- **Not-invited drops two parts of the mockup:** the "you signed in as {email}" sentence and the "Sign out" button. By the time the page renders, the auth callback has already signed the visitor out, and it passes no email.
- **404s.** `app/not-found.tsx` handles unmatched URLs, with no nav. `app/(app)/not-found.tsx` handles a `notFound()` thrown inside a signed-in page, which keeps the nav.
- **Tasks drops the old "My submissions" history list,** as the mockup does. A rejected completion shows its reason on the task's row.
- **Repeatable tasks show their period in the pill** (e.g. "Weekly") rather than the mockup's generic "Repeatable".
- **Markets list: two additions to the mockup.**
  - An open market past its close time shows as "Awaiting resolution".
  - Voided markets get their own "Voided" group, which the mockup doesn't draw.
- **Market detail follows the real rules where the artboard doesn't.**
  - No "Void this market" on a resolved market, because `void_market` rejects anything that isn't open.
  - "Add to parlay" is disabled only when the slip is full *and* this market isn't already in it, because adding from the same market replaces that market's pick.
- **Phone top bar and safe areas** (Task 13).
  - The top bar's gaps are tightened so a 5-digit balance fits at 375px.
  - The inert `env(safe-area-inset-bottom)` calls are dropped.
  - The legacy `--color-background` / `--color-foreground` aliases are removed.

---

## Task 1: Page scaffold and shared screen components

**Files:**
- Create: `components/ui/page.tsx`
- Create: `components/ui/section-card.tsx`
- Create: `components/ui/empty-state.tsx`
- Create: `components/ui/back-link.tsx`
- Create: `components/ui/avatar.tsx`
- Modify: `components/ui/message.tsx` (live-region role per tone)
- Create: `tests/components/screen-ui.test.tsx`
- Modify: `tests/components/ui.test.tsx` (the `Message` gold assertion — see Step 1)

**Interfaces:**
- Consumes: PR A's token utilities (`bg-sunk`, `text-ink2`, `bg-acc-soft`, `text-acc-text`, `bg-lime`, `text-on-lime`, `rounded-card`), `cardClass` from `components/ui/card.tsx`, `cn` from `lib/utils.ts`, `lucide-react` 1.47 (`ArrowLeft`, `type LucideIcon`), `next/link`.
- Produces (every screen task consumes these exact signatures):
  - `components/ui/page.tsx`
    - `h1Class`, `h2Class`, `eyebrowClass` (string constants)
    - `Page({ className?, children })` — the page body `<div>`: 16px sides / 20px top / 32px bottom on phones, 80px / 40px / 80px from `md`, 1120px max content width (`max-w-[1280px]` minus the 80px gutters), 20px section gap (28px from `md`). It is a `<div>`, never a `<main>`: the `(app)` layout already renders the only `<main>`.
    - `PageHeader({ title, description?, action? })` — the page's single `<h1>`, an optional muted `<p>` under it, an optional action on the right (`.pagehead`)
  - `components/ui/section-card.tsx` — `SectionCard({ title, titleId, action?, className?, children })`: a `.card.pad` `<section aria-labelledby={titleId}>`, so it is a `region` landmark named by its `<h2>`. Default `gap-3`; a `className` gap (`gap-0`, `gap-1`, `gap-4`) replaces it via tailwind-merge. `action` sits on the heading's row, right-aligned (the Outcomes card's "80 DC in the pool").
  - `components/ui/empty-state.tsx` — `EmptyState({ icon, title, children?, action? })`: a 48px sunk icon circle, the bold title `<p>`, the optional muted `text-sm` body `<p>` (`children` — plain text only, it renders inside a `<p>`), the optional action. The title is its own element, so `getByText('Nothing pending.')` resolves to exactly one node.
  - `components/ui/back-link.tsx` — `BackLink({ href, children })`: the `.back` link — arrow icon + label, `min-h-11`, `font-bold`, `self-start`
  - `components/ui/avatar.tsx` — `Avatar({ name, size? })`: `aria-hidden` initial circle. `sm` 32px / 14px text (bet rows, member rows); `md` (default) 40px, both `bg-acc-soft text-acc-text`; `lg` 64px / 26px text on phones and 80px / 32px from `md`, `bg-lime text-on-lime` (the profile header)
  - `Message` roles change: `error` → `role="alert"`, `ok` → `role="status"`, `gold` → no role (carried from PR A: static notes such as "Awaiting resolution" shouldn't be live regions)

Every class below comes from the mockup's `.main`, `.pagehead`, `.h1`, `.h2`, `.eyebrow`, `.card`, `.pad`, `.empty-ic`, `.back` and `.avatar` rules and their inline-style overrides in the EmptyStates, Profile and Market artboards. The back link's icon is the mockup's arrow (`M19 12H5M11 6l-6 6 6 6`), which is lucide's `ArrowLeft`. `EmptyState` takes its icon as a prop; each screen task picks the icon its empty state uses.

- [ ] **Step 1: Write the failing tests**

Create `tests/components/screen-ui.test.tsx` (it fails — none of the modules exist yet):

```tsx
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ChartColumn } from 'lucide-react'
import { Page, PageHeader, h1Class, h2Class } from '@/components/ui/page'
import { SectionCard } from '@/components/ui/section-card'
import { EmptyState } from '@/components/ui/empty-state'
import { BackLink } from '@/components/ui/back-link'
import { Avatar } from '@/components/ui/avatar'

describe('Page', () => {
  it('wraps the body in the width-capped, padded page column', () => {
    const { container } = render(
      <Page className="gap-4">
        <p>Body</p>
      </Page>,
    )
    const page = container.firstChild
    expect(page).toHaveClass('max-w-[1280px]', 'px-4', 'md:px-20', 'gap-4')
    expect(page).not.toHaveClass('gap-5')
    expect(screen.getByText('Body')).toBeInTheDocument()
  })
})

describe('PageHeader', () => {
  it('renders the title as the page heading', () => {
    render(<PageHeader title="Markets" />)
    const heading = screen.getByRole('heading', { level: 1, name: 'Markets' })
    expect(heading).toHaveClass(...h1Class.split(' '))
  })

  it('shows an optional description and action', () => {
    render(
      <PageHeader
        title="Leaderboard"
        description="Ranked by balance. Ties share a rank."
        action={<button type="button">Create market</button>}
      />,
    )
    expect(screen.getByText('Ranked by balance. Ties share a rank.')).toHaveClass('text-ink2')
    expect(screen.getByRole('button', { name: 'Create market' })).toBeInTheDocument()
  })
})

describe('SectionCard', () => {
  it('is a region named by its heading', () => {
    render(
      <SectionCard title="Outcomes" titleId="outcomes-title">
        <p>Yes</p>
      </SectionCard>,
    )
    const region = screen.getByRole('region', { name: 'Outcomes' })
    expect(region.tagName).toBe('SECTION')
    expect(region).toHaveClass('rounded-card', 'p-[18px]', 'md:p-6', 'gap-3')
    expect(screen.getByRole('heading', { level: 2, name: 'Outcomes' })).toHaveClass(...h2Class.split(' '))
  })

  it('puts the action beside the heading and lets the caller change the gap', () => {
    render(
      <SectionCard title="Outcomes" titleId="outcomes-title" action={<span>80 DC in the pool</span>} className="gap-0">
        <p>Yes</p>
      </SectionCard>,
    )
    const region = screen.getByRole('region', { name: 'Outcomes' })
    expect(region).toHaveClass('gap-0')
    expect(region).not.toHaveClass('gap-3')
    expect(screen.getByText('80 DC in the pool').parentElement).toContainElement(screen.getByRole('heading', { level: 2 }))
  })
})

describe('EmptyState', () => {
  it('shows the icon, title, body and action', () => {
    const { container } = render(
      <EmptyState icon={ChartColumn} title="No markets yet." action={<button type="button">Create market</button>}>
        Open the first one and get the duel started.
      </EmptyState>,
    )
    expect(screen.getByText('No markets yet.')).toHaveClass('font-extrabold')
    expect(screen.getByText('Open the first one and get the duel started.')).toHaveClass('text-sm', 'text-ink2')
    expect(screen.getByRole('button', { name: 'Create market' })).toBeInTheDocument()
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  })

  it('renders just the title when there is no body', () => {
    const { container } = render(<EmptyState icon={ChartColumn} title="Nothing pending." />)
    expect(screen.getByText('Nothing pending.')).toBeInTheDocument()
    expect(container.querySelectorAll('p')).toHaveLength(1)
  })
})

describe('BackLink', () => {
  it('links back with its label as the accessible name', () => {
    const { container } = render(<BackLink href="/markets">Markets</BackLink>)
    const link = screen.getByRole('link', { name: 'Markets' })
    expect(link).toHaveAttribute('href', '/markets')
    expect(link).toHaveClass('min-h-11')
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  })
})

describe('Avatar', () => {
  it("shows the name's first letter, uppercased, hidden from assistive tech", () => {
    const { container } = render(<Avatar name="  sarah" />)
    const avatar = container.firstChild
    expect(avatar).toHaveTextContent(/^S$/)
    expect(avatar).toHaveAttribute('aria-hidden', 'true')
  })

  it('sizes itself', () => {
    const { container, rerender } = render(<Avatar name="Sarah" />)
    expect(container.firstChild).toHaveClass('size-10', 'bg-acc-soft', 'text-acc-text')
    rerender(<Avatar name="Sarah" size="sm" />)
    expect(container.firstChild).toHaveClass('size-8', 'text-sm')
    rerender(<Avatar name="Sarah" size="lg" />)
    expect(container.firstChild).toHaveClass('size-16', 'md:size-20', 'bg-lime', 'text-on-lime')
  })

  it('falls back to a question mark for a blank name', () => {
    const { container } = render(<Avatar name=" " />)
    expect(container.firstChild).toHaveTextContent('?')
  })
})
```

Then change the `Message` test in `tests/components/ui.test.tsx`. This existing assertion expects `gold` to be `role="status"`, which this task deliberately removes, so it is replaced by two tests. Replace:

```tsx
  it('announces ok and gold messages politely', () => {
    render(
      <>
        <Message tone="ok">2 approved.</Message>
        <Message tone="gold">Awaiting resolution</Message>
      </>,
    )
    expect(screen.getAllByRole('status').map((el) => el.textContent)).toEqual(['2 approved.', 'Awaiting resolution'])
  })
```

with:

```tsx
  it('announces ok messages politely', () => {
    render(<Message tone="ok">2 approved.</Message>)
    expect(screen.getByRole('status')).toHaveTextContent('2 approved.')
  })

  it('keeps gold messages out of live regions, since they are static notes', () => {
    render(<Message tone="gold">Awaiting resolution</Message>)
    expect(screen.getByText('Awaiting resolution')).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
```

The `announces errors as alerts` test above it stays as it is.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/components/screen-ui.test.tsx tests/components/ui.test.tsx`
Expected: FAIL — `screen-ui.test.tsx` with `Failed to resolve import "@/components/ui/page"`; in `ui.test.tsx`, 1 failed (`keeps gold messages out of live regions, since they are static notes`, because gold still renders `role="status"`), 13 passed.

- [ ] **Step 3: Write `components/ui/page.tsx`**

```tsx
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export const h1Class = 'text-[28px] font-extrabold leading-[1.12] tracking-[-0.025em] text-balance md:text-[40px]'
export const h2Class = 'text-[19px] font-extrabold leading-[1.25] tracking-[-0.01em] md:text-[21px]'
export const eyebrowClass = 'text-xs font-extrabold uppercase tracking-[0.09em] text-ink2'

export function Page({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={cn(
        'mx-auto flex w-full max-w-[1280px] flex-1 flex-col gap-5 px-4 pt-5 pb-8 md:gap-7 md:px-20 md:pt-10 md:pb-20',
        className,
      )}
    >
      {children}
    </div>
  )
}

export function PageHeader({
  title,
  description,
  action,
}: {
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 flex-col gap-2">
        <h1 className={h1Class}>{title}</h1>
        {description && <p className="text-ink2">{description}</p>}
      </div>
      {action}
    </div>
  )
}
```

- [ ] **Step 4: Write `components/ui/section-card.tsx`**

```tsx
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { cardClass } from '@/components/ui/card'
import { h2Class } from '@/components/ui/page'

export function SectionCard({
  title,
  titleId,
  action,
  className,
  children,
}: {
  title: ReactNode
  titleId: string
  action?: ReactNode
  className?: string
  children: ReactNode
}) {
  const heading = (
    <h2 id={titleId} className={h2Class}>
      {title}
    </h2>
  )
  return (
    <section aria-labelledby={titleId} className={cn(cardClass, 'flex flex-col gap-3 p-[18px] md:p-6', className)}>
      {action ? (
        <div className="flex items-center justify-between gap-3">
          {heading}
          {action}
        </div>
      ) : (
        heading
      )}
      {children}
    </section>
  )
}
```

- [ ] **Step 5: Write `components/ui/empty-state.tsx`**

```tsx
import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

export function EmptyState({
  icon: Icon,
  title,
  children,
  action,
}: {
  icon: LucideIcon
  title: string
  children?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-start gap-3">
      <span className="flex size-12 items-center justify-center rounded-full bg-sunk text-ink2">
        <Icon aria-hidden="true" className="size-6" />
      </span>
      <p className="font-extrabold">{title}</p>
      {children && <p className="text-sm text-ink2">{children}</p>}
      {action}
    </div>
  )
}
```

- [ ] **Step 6: Write `components/ui/back-link.tsx`**

```tsx
import type { ReactNode } from 'react'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

export function BackLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="inline-flex min-h-11 items-center gap-1.5 self-start font-bold hover:decoration-[3px]">
      <ArrowLeft aria-hidden="true" className="size-5 shrink-0" />
      {children}
    </Link>
  )
}
```

The link inherits PR A's base `a` styles (link colour, 1.5px underline, 3px offset); `hover:decoration-[3px]` is the mockup's `a:hover` thickening.

- [ ] **Step 7: Write `components/ui/avatar.tsx`**

```tsx
import { cn } from '@/lib/utils'

const SIZES = {
  sm: 'size-8 bg-acc-soft text-sm text-acc-text',
  md: 'size-10 bg-acc-soft text-acc-text',
  lg: 'size-16 bg-lime text-[26px] text-on-lime md:size-20 md:text-[32px]',
} as const

export function Avatar({ name, size = 'md' }: { name: string; size?: keyof typeof SIZES }) {
  // Array.from splits by code point, so a name starting with an emoji keeps the whole character.
  const initial = Array.from(name.trim())[0]?.toUpperCase() ?? '?'
  return (
    <span
      aria-hidden="true"
      className={cn('flex shrink-0 items-center justify-center rounded-full font-extrabold', SIZES[size])}
    >
      {initial}
    </span>
  )
}
```

- [ ] **Step 8: Change the roles in `components/ui/message.tsx`**

Replace the whole file with:

```tsx
import type { ReactNode } from 'react'
import { CircleAlert, CircleCheck, Info } from 'lucide-react'
import { cn } from '@/lib/utils'

// Gold marks static notes like "Awaiting resolution", not news, so it is not a live region.
const TONES = {
  error: { className: 'bg-loss-soft text-loss', Icon: CircleAlert, role: 'alert' },
  ok: { className: 'bg-acc-soft text-acc-text', Icon: CircleCheck, role: 'status' },
  gold: { className: 'bg-gold-soft text-gold', Icon: Info, role: undefined },
} as const

export function Message({
  tone,
  id,
  className,
  children,
}: {
  tone: keyof typeof TONES
  id?: string
  className?: string
  children: ReactNode
}) {
  const { className: toneClass, Icon, role } = TONES[tone]
  return (
    <p
      id={id}
      role={role}
      className={cn('flex items-start gap-2.5 rounded-control px-3.5 py-3 text-[15px] font-bold leading-[1.4]', toneClass, className)}
    >
      <Icon aria-hidden="true" className="mt-px size-5 shrink-0" />
      <span>{children}</span>
    </p>
  )
}
```

(The only changes: each tone carries its `role`, with a one-line why above `TONES`, and the `<p>` uses `role={role}` instead of `role={tone === 'error' ? 'alert' : 'status'}`.) Nothing in `app/` renders `Message` yet, so no call site changes.

- [ ] **Step 9: Run the tests to verify they pass**

Run: `npx vitest run tests/components/screen-ui.test.tsx tests/components/ui.test.tsx`
Expected: PASS (2 files, 25 tests: 11 in `screen-ui.test.tsx`, 14 in `ui.test.tsx`)

- [ ] **Step 10: Verify**

Run: `npm run lint && npx vitest run && npm run build`
Expected: all PASS (the Vitest run includes `tests/db/`, so local Supabase must be running: `npm run db:start`)

Run: `lsof -ti:3000 | xargs -r kill 2>/dev/null; npx playwright test`
Expected: 12 passed (nothing renders the new components yet)

- [ ] **Step 11: Commit**

```bash
git add components/ui/page.tsx components/ui/section-card.tsx components/ui/empty-state.tsx components/ui/back-link.tsx components/ui/avatar.tsx components/ui/message.tsx tests/components/screen-ui.test.tsx tests/components/ui.test.tsx
git commit -m "Add Page, SectionCard, EmptyState, BackLink and Avatar; make gold messages static"
```

---

## Task 2: Friendly insufficient-balance copy

**Files:**
- Create: `lib/errors/balance-error.ts`
- Modify: `lib/markets/place-bet.ts`
- Modify: `lib/parlays/place-parlay.ts`
- Test: `tests/lib/errors/balance-error.test.ts` (create)
- Test: `tests/db/balance-check-error.test.ts` (create)
- Test: `tests/lib/markets/place-bet-action.test.ts` (create)
- Test: `tests/lib/parlays/place-parlay-action.test.ts` (create)

**Interfaces:**
- Consumes: `requireUser` from `lib/auth/require-user.ts` (`{ supabase, user }`); the `place_bet` and `place_parlay` RPCs (unchanged); `profiles.balance` (the member can already read their own row — the `(app)` layout does the same select); the DB fixtures `seedMembers`, `clientFor`, `createTestMarket`, `ensureInvited` from `tests/db/fixtures.ts`.
- Produces:
  - `lib/errors/balance-error.ts`
    - `isBalanceCheckViolation(error: { code?: string; message?: string } | null): boolean` — true only for code `23514` whose message names `profiles_balance_check`
    - `insufficientBalanceMessage(balance: number): string` — `` `Insufficient balance — you have ${balance} DC. Try a smaller amount.` `` (an em dash, U+2014)
  - `placeBetAction` and `placeParlayAction` keep their signatures and state types. On a balance-check violation they read the member's current `profiles.balance` and return `{ formError: insufficientBalanceMessage(balance) }`. Every other error, and a violation whose balance read comes back empty, keeps `error.message`. Screen tasks render `state.formError` as they get it.

**Why these errors look the way they do:** neither RPC checks the balance itself. Both debit through `apply_coin_transaction`, whose `update profiles set balance = balance + p_amount` trips the unnamed `check (balance >= 0)` from `supabase/migrations/0001_core_tables.sql`. Postgres names that constraint `profiles_balance_check` (confirmed on the local stack: `select conname from pg_constraint where conrelid = 'public.profiles'::regclass and contype = 'c'` returns `profiles_balance_check`), and PostgREST passes the error through as `{ code: '23514', message: 'new row for relation "profiles" violates check constraint "profiles_balance_check"' }`. The mapping is scoped to these two actions because they move the member's own money; an admin's balance adjustment on someone else would make "you have" wrong, so `adjust-balance.ts` is left alone.

- [ ] **Step 1: Write the failing unit tests for the mapping**

Create `tests/lib/errors/balance-error.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { insufficientBalanceMessage, isBalanceCheckViolation } from '@/lib/errors/balance-error'

describe('isBalanceCheckViolation', () => {
  it('matches the profiles balance check violation', () => {
    expect(
      isBalanceCheckViolation({
        code: '23514',
        message: 'new row for relation "profiles" violates check constraint "profiles_balance_check"',
      }),
    ).toBe(true)
  })

  it('ignores a violation of some other check constraint', () => {
    expect(
      isBalanceCheckViolation({
        code: '23514',
        message: 'new row for relation "bets" violates check constraint "bets_amount_check"',
      }),
    ).toBe(false)
  })

  it('ignores a raised exception that merely mentions the constraint', () => {
    expect(isBalanceCheckViolation({ code: 'P0001', message: 'profiles_balance_check' })).toBe(false)
  })

  it('ignores no error and errors without a code or message', () => {
    expect(isBalanceCheckViolation(null)).toBe(false)
    expect(isBalanceCheckViolation({})).toBe(false)
    expect(isBalanceCheckViolation({ code: '23514' })).toBe(false)
  })
})

describe('insufficientBalanceMessage', () => {
  it("names the member's balance in the approved copy", () => {
    expect(insufficientBalanceMessage(120)).toBe('Insufficient balance — you have 120 DC. Try a smaller amount.')
    expect(insufficientBalanceMessage(0)).toBe('Insufficient balance — you have 0 DC. Try a smaller amount.')
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/lib/errors/balance-error.test.ts`
Expected: FAIL with `Failed to resolve import "@/lib/errors/balance-error"`

- [ ] **Step 3: Write `lib/errors/balance-error.ts`**

```typescript
// A debit past zero trips the profiles table's `check (balance >= 0)`, which Postgres names profiles_balance_check.
export function isBalanceCheckViolation(error: { code?: string; message?: string } | null): boolean {
  return error?.code === '23514' && (error.message ?? '').includes('profiles_balance_check')
}

export function insufficientBalanceMessage(balance: number): string {
  return `Insufficient balance — you have ${balance} DC. Try a smaller amount.`
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run tests/lib/errors/balance-error.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Pin the database's error shape with a contract test**

This test pins behaviour the database already has, so it passes on its first run. It exists so that if a later migration adds its own balance check (a `raise exception` with a different code) or renames the constraint, this test fails rather than the friendly copy silently disappearing.

Create `tests/db/balance-check-error.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { isBalanceCheckViolation } from '@/lib/errors/balance-error'
import { seedMembers, clientFor, createTestMarket, ensureInvited, type Member } from './fixtures'

let alice: Member
let bob: Member
let aliceClient: SupabaseClient
let bobClient: SupabaseClient

beforeEach(async () => {
  ;[alice, bob] = await seedMembers()
  aliceClient = await clientFor(alice)
  bobClient = await clientFor(bob)
})

// The server actions map this exact error shape to the friendly insufficient-balance copy.
describe('over-balance errors', () => {
  it('place_bet reports the profiles balance check violation', async () => {
    const { marketId, outcomeIds } = await createTestMarket(aliceClient, ['Yes', 'No'])

    const { error } = await bobClient.rpc('place_bet', {
      p_market_id: marketId,
      p_outcome_id: outcomeIds[0],
      p_amount: 101,
    })

    expect(error?.code).toBe('23514')
    expect(error?.message).toContain('profiles_balance_check')
    expect(isBalanceCheckViolation(error)).toBe(true)
  })

  it('place_parlay reports the profiles balance check violation', async () => {
    await ensureInvited(bobClient)
    const legs: string[] = []
    for (const title of ['Market A', 'Market B']) {
      const { marketId, outcomeIds } = await createTestMarket(aliceClient, ['Yes', 'No'], { title })
      const { error: betErr } = await aliceClient.rpc('place_bet', {
        p_market_id: marketId,
        p_outcome_id: outcomeIds[0],
        p_amount: 5,
      })
      if (betErr) throw betErr
      legs.push(outcomeIds[0])
    }

    const { error } = await bobClient.rpc('place_parlay', { p_outcome_ids: legs, p_stake: 101 })

    expect(error?.code).toBe('23514')
    expect(error?.message).toContain('profiles_balance_check')
    expect(isBalanceCheckViolation(error)).toBe(true)
  })

  it('does not flag an unrelated rejection', async () => {
    const { marketId, outcomeIds } = await createTestMarket(aliceClient, ['Yes', 'No'])

    const { error } = await bobClient.rpc('place_bet', {
      p_market_id: marketId,
      p_outcome_id: outcomeIds[0],
      p_amount: 0,
    })

    expect(error?.message).toContain('bet amount must be positive')
    expect(isBalanceCheckViolation(error)).toBe(false)
  })
})
```

Run: `npx vitest run tests/db/balance-check-error.test.ts`
Expected: PASS (3 tests). It needs the local Supabase stack running (`npm run db:start`); like every file in `tests/db/`, it wipes and reseeds the local database.

- [ ] **Step 6: Write the failing action tests**

Neither action has a test today. They are testable without a database by mocking `requireUser` to hand back a fake Supabase client (`rpc` and a `from().select().eq().maybeSingle()` chain), and mocking `next/cache` (and, for parlays, the cookie-backed slip helpers and `getSlipView`), the same `vi.mock` / `vi.hoisted` pattern as `tests/components/app-nav.test.tsx`. Together with Step 5's contract test, these prove the wiring end to end: the database really produces this error, and the actions really turn it into the copy.

Create `tests/lib/markets/place-bet-action.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { supabase } = vi.hoisted(() => ({ supabase: { rpc: vi.fn(), from: vi.fn() } }))
vi.mock('@/lib/auth/require-user', () => ({ requireUser: async () => ({ supabase, user: { id: 'member-1' } }) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { placeBetAction } from '@/lib/markets/place-bet'

const BALANCE_VIOLATION = {
  code: '23514',
  message: 'new row for relation "profiles" violates check constraint "profiles_balance_check"',
}

function stubBalance(balance: number) {
  const eq = vi.fn(() => ({ maybeSingle: async () => ({ data: { balance }, error: null }) }))
  supabase.from.mockReturnValue({ select: () => ({ eq }) })
  return eq
}

function betForm(amount: string) {
  const form = new FormData()
  form.set('outcome_id', 'outcome-1')
  form.set('amount', amount)
  return form
}

beforeEach(() => {
  supabase.rpc.mockReset()
  supabase.from.mockReset()
})

describe('placeBetAction', () => {
  it("turns a balance-check violation into the friendly copy with the member's current balance", async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: BALANCE_VIOLATION })
    const eq = stubBalance(40)

    const state = await placeBetAction('market-1', undefined, betForm('500'))

    expect(state).toEqual({ formError: 'Insufficient balance — you have 40 DC. Try a smaller amount.' })
    expect(supabase.from).toHaveBeenCalledWith('profiles')
    expect(eq).toHaveBeenCalledWith('id', 'member-1')
  })

  it('keeps every other error message as it is', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: { code: 'P0001', message: 'market is not open for betting' } })

    const state = await placeBetAction('market-1', undefined, betForm('5'))

    expect(state).toEqual({ formError: 'market is not open for betting' })
    expect(supabase.from).not.toHaveBeenCalled()
  })
})
```

Create `tests/lib/parlays/place-parlay-action.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { supabase, writeSlip } = vi.hoisted(() => ({
  supabase: { rpc: vi.fn(), from: vi.fn() },
  writeSlip: vi.fn(),
}))
vi.mock('@/lib/auth/require-user', () => ({ requireUser: async () => ({ supabase, user: { id: 'member-1' } }) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/parlays/slip', () => ({ readSlip: async () => ['outcome-1', 'outcome-2'], writeSlip }))
vi.mock('@/lib/parlays/get-slip', () => ({
  getSlipView: async () => ({ picks: [{ outcomeId: 'outcome-1' }, { outcomeId: 'outcome-2' }] }),
}))

import { placeParlayAction } from '@/lib/parlays/place-parlay'

const BALANCE_VIOLATION = {
  code: '23514',
  message: 'new row for relation "profiles" violates check constraint "profiles_balance_check"',
}

function stubBalance(balance: number) {
  const eq = vi.fn(() => ({ maybeSingle: async () => ({ data: { balance }, error: null }) }))
  supabase.from.mockReturnValue({ select: () => ({ eq }) })
  return eq
}

function stakeForm(stake: string) {
  const form = new FormData()
  form.set('stake', stake)
  return form
}

beforeEach(() => {
  supabase.rpc.mockReset()
  supabase.from.mockReset()
  writeSlip.mockReset()
})

describe('placeParlayAction', () => {
  it("turns a balance-check violation into the friendly copy with the member's current balance, keeping the slip", async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: BALANCE_VIOLATION })
    const eq = stubBalance(12)

    const state = await placeParlayAction(undefined, stakeForm('50'))

    expect(state).toEqual({ formError: 'Insufficient balance — you have 12 DC. Try a smaller amount.' })
    expect(supabase.from).toHaveBeenCalledWith('profiles')
    expect(eq).toHaveBeenCalledWith('id', 'member-1')
    expect(writeSlip).not.toHaveBeenCalled()
  })

  it('keeps every other error message as it is', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: { code: 'P0001', message: "'Market A' is no longer open" } })

    const state = await placeParlayAction(undefined, stakeForm('5'))

    expect(state).toEqual({ formError: "'Market A' is no longer open" })
    expect(supabase.from).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 7: Run them to verify they fail**

Run: `npx vitest run tests/lib/markets/place-bet-action.test.ts tests/lib/parlays/place-parlay-action.test.ts`
Expected: FAIL — 2 failed, 2 passed. Each `turns a balance-check violation into the friendly copy…` test fails with `expected { Object (formError) } to deeply equal { Object (formError) }` (the action still returns the raw Postgres message); both `keeps every other error message as it is` tests already pass.

- [ ] **Step 8: Wire the mapping into `lib/markets/place-bet.ts`**

Add the import below the `requireUser` import:

```typescript
import { requireUser } from '@/lib/auth/require-user'
import { insufficientBalanceMessage, isBalanceCheckViolation } from '@/lib/errors/balance-error'
```

Replace:

```typescript
  if (error) return { formError: error.message }

  // Refreshes the shared layout too, so the nav's balance and slip count stay current.
```

with:

```typescript
  if (error) {
    if (isBalanceCheckViolation(error)) {
      const { data: profile } = await supabase.from('profiles').select('balance').eq('id', user.id).maybeSingle()
      if (profile) return { formError: insufficientBalanceMessage(profile.balance) }
    }
    return { formError: error.message }
  }

  // Refreshes the shared layout too, so the nav's balance and slip count stay current.
```

The whole file is now:

```typescript
'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth/require-user'
import { insufficientBalanceMessage, isBalanceCheckViolation } from '@/lib/errors/balance-error'

export type ActionState = { formError?: string } | undefined

export async function placeBetAction(marketId: string, _prevState: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase, user } = await requireUser()
  if (!user) return { formError: 'Not signed in.' }

  const outcomeId = String(formData.get('outcome_id') ?? '')
  const amountRaw = String(formData.get('amount') ?? '')
  const amount = Number(amountRaw)

  if (!outcomeId) return { formError: 'Choose an outcome.' }
  if (!Number.isInteger(amount) || amount <= 0) return { formError: 'Enter a whole number of DC greater than 0.' }

  const { error } = await supabase.rpc('place_bet', {
    p_market_id: marketId,
    p_outcome_id: outcomeId,
    p_amount: amount,
  })

  if (error) {
    if (isBalanceCheckViolation(error)) {
      const { data: profile } = await supabase.from('profiles').select('balance').eq('id', user.id).maybeSingle()
      if (profile) return { formError: insufficientBalanceMessage(profile.balance) }
    }
    return { formError: error.message }
  }

  // Refreshes the shared layout too, so the nav's balance and slip count stay current.
  revalidatePath('/', 'layout')
  return undefined
}
```

- [ ] **Step 9: Wire the mapping into `lib/parlays/place-parlay.ts`**

Add the import below the `requireUser` import:

```typescript
import { requireUser } from '@/lib/auth/require-user'
import { insufficientBalanceMessage, isBalanceCheckViolation } from '@/lib/errors/balance-error'
```

Replace:

```typescript
  if (error) return { formError: error.message }

  await writeSlip([])
```

with:

```typescript
  if (error) {
    if (isBalanceCheckViolation(error)) {
      const { data: profile } = await supabase.from('profiles').select('balance').eq('id', user.id).maybeSingle()
      if (profile) return { formError: insufficientBalanceMessage(profile.balance) }
    }
    return { formError: error.message }
  }

  await writeSlip([])
```

The whole file is now:

```typescript
'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth/require-user'
import { insufficientBalanceMessage, isBalanceCheckViolation } from '@/lib/errors/balance-error'
import { combineOdds, lockedOddsToBp, potentialPayout } from './odds'
import { getSlipView } from './get-slip'
import { readSlip, writeSlip } from './slip'

export type PlaceParlayState =
  | { formError?: string; placed?: { multiplierBp: number; potentialPayout: number } }
  | undefined

export async function placeParlayAction(_prevState: PlaceParlayState, formData: FormData): Promise<PlaceParlayState> {
  const { supabase, user } = await requireUser()
  if (!user) return { formError: 'Not signed in.' }

  const stake = Number(formData.get('stake'))
  if (!Number.isInteger(stake) || stake <= 0) return { formError: 'Enter a whole number of DC greater than 0.' }

  // Only the picks the page can show, so an id it silently dropped can't block placement.
  const { picks } = await getSlipView(supabase, await readSlip())

  const { data: parlayId, error } = await supabase.rpc('place_parlay', {
    p_outcome_ids: picks.map((p) => p.outcomeId),
    p_stake: stake,
  })
  if (error) {
    if (isBalanceCheckViolation(error)) {
      const { data: profile } = await supabase.from('profiles').select('balance').eq('id', user.id).maybeSingle()
      if (profile) return { formError: insufficientBalanceMessage(profile.balance) }
    }
    return { formError: error.message }
  }

  await writeSlip([])

  // Refreshes the shared layout too, so the nav's balance and slip count stay current.
  revalidatePath('/', 'layout')

  const { data: legs, error: legsErr } = await supabase
    .from('parlay_legs')
    .select('locked_odds')
    .eq('parlay_id', parlayId as string)
  if (legsErr) return {}

  const legBps = (legs ?? []).map((l) => lockedOddsToBp(l.locked_odds))
  return { placed: { multiplierBp: combineOdds(legBps).multiplierBp, potentialPayout: potentialPayout(stake, legBps) } }
}
```

The failed placement returns before `writeSlip([])`, so the member keeps their picks and can retry with a smaller stake.

- [ ] **Step 10: Run the action tests to verify they pass**

Run: `npx vitest run tests/lib/markets/place-bet-action.test.ts tests/lib/parlays/place-parlay-action.test.ts tests/lib/errors/balance-error.test.ts tests/db/balance-check-error.test.ts`
Expected: PASS (4 files, 12 tests)

- [ ] **Step 11: Verify**

Run: `npm run lint && npx vitest run && npm run build`
Expected: all PASS

Run: `lsof -ti:3000 | xargs -r kill 2>/dev/null; npx playwright test`
Expected: 12 passed (no e2e test bets past a balance; the unchanged forms still render `state.formError`)

- [ ] **Step 12: Commit**

```bash
git add lib/errors/balance-error.ts lib/markets/place-bet.ts lib/parlays/place-parlay.ts tests/lib/errors/balance-error.test.ts tests/db/balance-check-error.test.ts tests/lib/markets/place-bet-action.test.ts tests/lib/parlays/place-parlay-action.test.ts
git commit -m "Show friendly insufficient-balance copy when a bet or parlay overdraws"
```

---

## Task 3: Sign-in, not-invited and the 404 page

**Files:**
- Modify: `app/(auth)/sign-in/page.tsx`
- Modify: `app/(auth)/sign-in/sign-in-button.tsx`
- Modify: `app/(auth)/not-invited/page.tsx`
- Create: `app/not-found.tsx` (the repo has none yet; Next serves its default 404 today)
- Create: `app/(app)/not-found.tsx`
- Create: `components/not-found/not-found-body.tsx`
- Test: `tests/components/not-found-body.test.tsx`
- Test: `tests/components/sign-in-button.test.tsx`
- Test: `tests/components/sign-in-page.test.tsx`
- Test: `tests/components/not-invited-page.test.tsx`
- Test: `e2e/not-found.spec.ts`

**Interfaces:**
- Consumes:
  - `h1Class` from `components/ui/page.tsx` (Task 1)
  - `Button`, `buttonVariants` from `components/ui/button.tsx`; `Card` from
    `components/ui/card.tsx`; `Message` from `components/ui/message.tsx`
    (all already in the repo from PR A)
  - `DwellDuelSymbol` from `components/brand/wordmark.tsx` (already in the
    repo)
  - `browserClient` from `lib/supabase/client.ts` (unchanged)
- Produces:
  - `NotFoundBody()` in `components/not-found/not-found-body.tsx` — the 404 body
    (numeral, heading, copy, "Back home" link), with no nav of its own
  - the new `app/not-found.tsx` and `app/(app)/not-found.tsx`,
    both rendering `<NotFoundBody />`

**Why two `not-found.tsx` files:** `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/not-found.md`
says a root `app/not-found.js` "handle[s] any unmatched URLs for your whole
application", and `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/not-found.md`
says a `notFound()` call thrown inside a segment renders "the nearest
parent not-found boundary" — falling back, with no closer one, to Next's
default 404. Next.js gives every route segment its own
`HTTPAccessFallbackBoundary` around that segment's `children` only (see
`node_modules/next/dist/client/components/http-access-fallback/error-boundary.js`);
a segment with no `not-found.js` of its own re-throws, so the error keeps
bubbling until a segment that _does_ have one catches it and swaps out
_its_ `children`. Concretely:
- A **wholly unmatched URL** (e.g. `/nonsense`) matches no route segment at
  all, so Next can't resolve a layout chain for it — only the root layout
  and the root `not-found.tsx` apply. There is no nav for this case, full
  stop; nothing PR B builds can add one.
- `notFound()` thrown inside `app/(app)/members/[id]/page.tsx` (unknown
  member) *is* inside a matched segment chain: root → `(app)` → `members`
  → `[id]` → page. With no `not-found.tsx` in `(app)`, `members`, or
  `[id]`, the error bubbles all the way past `(app)`'s own boundary
  (discarding everything `(app)/layout.tsx` rendered inside it, including
  `AppNav`) up to the root boundary, which renders the root
  `not-found.tsx` wrapped only by the root layout — **no `AppNav`**.

  `AppNav` is rendered by `(app)/layout.tsx` itself, *outside* the
  `{children}` slot that gets discarded — so a `not-found.tsx` placed
  **inside** `app/(app)/` is caught one level up, at `(app)`'s own
  boundary, which only swaps out `{children}` inside `<main>{children}</main>`
  and leaves `AppNav` mounted. That's what `app/(app)/not-found.tsx` is
  for. The mockup's `NotFound` artboard draws the screen with the
  `TopBar`/`TabBar` present (`tab=""`, meaning no tab highlighted) — that
  is the `(app)` case, and needs the extra file to actually happen. The
  root file alone cannot produce it.

  One side effect worth noting for the controller: `AppNav` is a client
  component that derives the active tab from `usePathname()`, which still
  reports `/members/<bad-id>` even though the 404 body renders — so
  `activeNavId` (from PR A's Task 5) resolves that to `'leaderboard'` and the
  Leaderboard tab shows as active during this 404. That's an existing
  `AppNav` behaviour, not something this task changes.

- [ ] **Step 1: Write `tests/components/not-found-body.test.tsx` (will fail — the module doesn't exist yet)**

```typescript
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { NotFoundBody } from '@/components/not-found/not-found-body'

describe('NotFoundBody', () => {
  it('names the page and offers a way back home', () => {
    render(<NotFoundBody />)
    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument()
    expect(screen.getByText(/This page wandered off/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back home' })).toHaveAttribute('href', '/')
  })

  it('hides the decorative 404 numeral from assistive tech', () => {
    const { container } = render(<NotFoundBody />)
    const numeral = container.querySelector('[aria-hidden="true"]')
    expect(numeral).toHaveTextContent('404')
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/components/not-found-body.test.tsx`
Expected: FAIL with `Failed to resolve import "@/components/not-found/not-found-body"`

- [ ] **Step 3: Write `components/not-found/not-found-body.tsx`**

```typescript
import Link from 'next/link'
import { h1Class } from '@/components/ui/page'
import { buttonVariants } from '@/components/ui/button'

export function NotFoundBody() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 py-10 md:px-20">
      <div className="flex w-full max-w-[560px] flex-col items-start gap-4">
        <p aria-hidden="true" className="text-[96px] leading-[0.9] font-extrabold tracking-[-0.05em] text-ink md:text-[140px]">
          4<span className="text-wm-b">0</span>4
        </p>
        <h1 className={h1Class}>Page not found</h1>
        <p className="text-ink2">This page wandered off. The link may be old, or the market was removed.</p>
        <Link href="/" className={buttonVariants({ variant: 'primary' })}>
          Back home
        </Link>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Create `app/not-found.tsx`**

```typescript
import { NotFoundBody } from '@/components/not-found/not-found-body'

export default function NotFound() {
  return <NotFoundBody />
}
```

- [ ] **Step 5: Create `app/(app)/not-found.tsx`**

```typescript
import { NotFoundBody } from '@/components/not-found/not-found-body'

export default function NotFound() {
  return <NotFoundBody />
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run tests/components/not-found-body.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 7: Write `tests/components/sign-in-button.test.tsx` (will fail — the restyled button doesn't render a `Message` yet)**

```typescript
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

let params = new URLSearchParams()
vi.mock('next/navigation', () => ({ useSearchParams: () => params }))

const signInWithOAuth = vi.fn(async () => ({ data: { url: null, provider: 'google' }, error: null }))
vi.mock('@/lib/supabase/client', () => ({ browserClient: () => ({ auth: { signInWithOAuth } }) }))

import { SignInButton } from '@/app/(auth)/sign-in/sign-in-button'

beforeEach(() => {
  params = new URLSearchParams()
  signInWithOAuth.mockClear()
})

describe('SignInButton', () => {
  it('starts the same Google OAuth flow as before the restyle', async () => {
    render(<SignInButton />)
    await userEvent.click(screen.getByRole('button', { name: 'Sign in with Google' }))
    expect(signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/callback` },
    })
  })

  it('shows the friendly error after a failed redirect back', () => {
    params = new URLSearchParams('error=auth')
    render(<SignInButton />)
    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong signing you in. Try again.')
  })
})
```

- [ ] **Step 8: Run it to verify it fails**

Run: `npx vitest run tests/components/sign-in-button.test.tsx`
Expected: FAIL — no `role="alert"` is rendered yet for the second case (the current button only renders a plain `<p>`)

- [ ] **Step 9: Rewrite `app/(auth)/sign-in/sign-in-button.tsx`**

```typescript
'use client'

import { useSearchParams } from 'next/navigation'
import { browserClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Message } from '@/components/ui/message'

export function SignInButton() {
  const searchParams = useSearchParams()
  const hasError = searchParams.get('error') === 'auth'

  async function signIn() {
    const supabase = browserClient()
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/callback` },
    })
  }

  return (
    <div className="flex w-full flex-col gap-5">
      {hasError && <Message tone="error">Something went wrong signing you in. Try again.</Message>}
      <Button type="button" onClick={signIn} block>
        <span aria-hidden="true" className="flex size-[26px] items-center justify-center rounded-full bg-white text-[15px] font-extrabold text-[#03272D]">
          G
        </span>
        Sign in with Google
      </Button>
    </div>
  )
}
```

The OAuth call — provider, `redirectTo`, the `browserClient()` — is
byte-for-byte the same as before; only the markup around it changed.

- [ ] **Step 10: Run the test to verify it passes**

Run: `npx vitest run tests/components/sign-in-button.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 11: Write `tests/components/sign-in-page.test.tsx` (will fail — the page doesn't render a "Friendly bets" heading yet)**

```typescript
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams() }))
vi.mock('@/lib/supabase/client', () => ({ browserClient: () => ({ auth: { signInWithOAuth: vi.fn() } }) }))

import SignInPage from '@/app/(auth)/sign-in/page'

describe('SignInPage', () => {
  it('shows the tagline and the Google sign-in button', () => {
    render(<SignInPage />)
    expect(screen.getByRole('heading', { name: /Friendly bets/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sign in with Google' })).toBeInTheDocument()
  })
})
```

- [ ] **Step 12: Run it to verify it fails**

Run: `npx vitest run tests/components/sign-in-page.test.tsx`
Expected: FAIL — no heading named "Friendly bets…" exists yet

- [ ] **Step 13: Rewrite `app/(auth)/sign-in/page.tsx`**

```typescript
import { Suspense } from 'react'
import { h1Class } from '@/components/ui/page'
import { Card } from '@/components/ui/card'
import { DwellDuelSymbol } from '@/components/brand/wordmark'
import { SignInButton } from './sign-in-button'

export default function SignInPage() {
  return (
    <div className="flex flex-1 items-center justify-center px-4 py-10 md:px-20">
      <Card padded={false} className="flex w-full max-w-[440px] flex-col items-start gap-5 p-7 md:p-10">
        <DwellDuelSymbol size={64} />
        <h1 className={h1Class}>
          Friendly bets.
          <br />
          Faithful study.
        </h1>
        <p className="text-ink2">
          DwellDuel is invite-only for our church friend group. Sign in with the Google account your invite was sent to.
        </p>
        <Suspense>
          <SignInButton />
        </Suspense>
      </Card>
    </div>
  )
}
```

`(auth)` has no layout, so this `<div>` supplies its own centering; the
root layout's `<body className="flex min-h-full flex-col">` gives it the
full height to center within.

- [ ] **Step 14: Run the test to verify it passes**

Run: `npx vitest run tests/components/sign-in-page.test.tsx`
Expected: PASS (1 test)

- [ ] **Step 15: Write `tests/components/not-invited-page.test.tsx` (will fail — no "Not invited" heading exists yet)**

```typescript
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import NotInvitedPage from '@/app/(auth)/not-invited/page'

describe('NotInvitedPage', () => {
  it('explains the invite-only rule and offers a way back to sign-in', () => {
    render(<NotInvitedPage />)
    expect(screen.getByRole('heading', { name: 'Not invited' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Try another account' })).toHaveAttribute('href', '/sign-in')
  })
})
```

- [ ] **Step 16: Run it to verify it fails**

Run: `npx vitest run tests/components/not-invited-page.test.tsx`
Expected: FAIL — the current page has no heading named "Not invited" and no link

- [ ] **Step 17: Rewrite `app/(auth)/not-invited/page.tsx`**

```typescript
import Link from 'next/link'
import { Mail } from 'lucide-react'
import { h1Class } from '@/components/ui/page'
import { Card } from '@/components/ui/card'
import { buttonVariants } from '@/components/ui/button'

export default function NotInvitedPage() {
  return (
    <div className="flex flex-1 items-center justify-center px-4 py-10 md:px-20">
      <Card padded={false} className="flex w-full max-w-[480px] flex-col items-start gap-4 p-7 md:p-10">
        <span aria-hidden="true" className="flex size-12 items-center justify-center rounded-full bg-gold-soft text-gold">
          <Mail className="size-6" />
        </span>
        <h1 className={h1Class}>Not invited</h1>
        <p className="text-ink2">
          This Google account isn’t on the invite list yet. Ask a DwellDuel admin to add it, then sign in again.
        </p>
        <Link href="/sign-in" className={buttonVariants({ variant: 'primary', block: true })}>
          Try another account
        </Link>
      </Card>
    </div>
  )
}
```

See "Rulings this plan makes" above for why this drops the mockup's
per-email sentence and its "Sign out" button.

- [ ] **Step 18: Run the test to verify it passes**

Run: `npx vitest run tests/components/not-invited-page.test.tsx`
Expected: PASS (1 test)

- [ ] **Step 19: Write `e2e/not-found.spec.ts`**

The unknown-member 404 is already covered by `e2e/social.spec.ts`
("an unknown member id shows a 404"); this file only adds the
wholly-unmatched-URL case.

```typescript
import { test, expect } from '@playwright/test'

test('an unknown URL shows a 404', async ({ page }) => {
  const response = await page.goto('/this-page-does-not-exist')
  expect(response?.status()).toBe(404)
  await expect(page.getByText('Page not found')).toBeVisible()
})
```

- [ ] **Step 20: Verify**

Run: `npm run lint && npx vitest run && npm run build`
Expected: all PASS

- [ ] **Step 21: Run the e2e suite**

Run: `lsof -ti:3000 | xargs -r kill 2>/dev/null; npx playwright test`
Expected: 13 passed

- [ ] **Step 22: Commit**

```bash
git add "app/(auth)/sign-in/page.tsx" "app/(auth)/sign-in/sign-in-button.tsx" "app/(auth)/not-invited/page.tsx" app/not-found.tsx "app/(app)/not-found.tsx" components/not-found/not-found-body.tsx tests/components/not-found-body.test.tsx tests/components/sign-in-button.test.tsx tests/components/sign-in-page.test.tsx tests/components/not-invited-page.test.tsx e2e/not-found.spec.ts
git commit -m "Restyle sign-in, not-invited and 404 to the mockup"
```

---

## Task 4: Home

**Files:**
- Create: `lib/home/copy.ts`
- Create: `components/home/home-hero.tsx`
- Create: `components/home/home-tiles.tsx`
- Replace: `app/(app)/page.tsx`
- Test: `tests/lib/home/copy.test.ts`
- Test: `tests/components/home-hero.test.tsx`
- Test: `tests/components/home-tiles.test.tsx`

**Interfaces:**
- Consumes:
  - `Page`, `PageHeader`, `eyebrowClass` from `components/ui/page.tsx`
    (Task 1)
  - `buttonVariants` from `components/ui/button.tsx` (PR A)
  - `cn` from `lib/utils.ts`
  - `requireUser()` (`lib/auth/require-user`), `signOut()`
    (`lib/auth/sign-out`), `isAdmin(supabase)` (`lib/auth/is-admin`)
  - `readSlip(): Promise<string[]>` (`lib/parlays/slip`)
  - `listMarkets(supabase): Promise<MarketSummary[]>`
    (`lib/markets/list-markets`) — filtered here to `status === 'open'`
  - `getLeaderboard(supabase): Promise<LeaderboardEntry[]>`
    (`lib/social/leaderboard`) — `{ id, displayName, balance, rank }`
  - `listMyTaskCompletions(supabase, profileId): Promise<MyCompletion[]>`
    and `listPendingTaskCompletions(supabase): Promise<PendingCompletion[]>`
    (`lib/tasks/list-task-completions`)
- Produces:
  - `lib/home/copy.ts`: `heroCaption`, `marketsTileSubtitle`,
    `parlaysTileSubtitle`, `leaderboardTileSubtitle`, `adminTileSubtitle`
    — all pure `(...) => string`
  - `HomeHero({ balance, rank, memberCount, pendingCount, pendingDc })`
    from `components/home/home-hero.tsx`
  - `HomeTiles({ tiles })` and the `HomeTile` type from
    `components/home/home-tiles.tsx`

**No new DB reader:** every number the mockup's captions need turned out
to be cheaply available from readers already in the repo, so nothing was
added to `tests/db/`.

- [ ] **Step 1: Write `tests/lib/home/copy.test.ts` (will fail — the module doesn't exist yet)**

```typescript
import { describe, it, expect } from 'vitest'
import {
  heroCaption,
  marketsTileSubtitle,
  parlaysTileSubtitle,
  leaderboardTileSubtitle,
  adminTileSubtitle,
} from '@/lib/home/copy'

describe('heroCaption', () => {
  it('drops the pending clause when nothing is pending', () => {
    expect(heroCaption(3, 8, 0, 0)).toBe('Rank 3 of 8')
  })

  it('uses the singular for one pending review', () => {
    expect(heroCaption(3, 8, 1, 25)).toBe('Rank 3 of 8 · 25 DC pending in 1 task review')
  })

  it('uses the plural for more than one', () => {
    expect(heroCaption(3, 8, 2, 40)).toBe('Rank 3 of 8 · 40 DC pending in 2 task reviews')
  })
})

describe('marketsTileSubtitle', () => {
  it('handles zero, one and many', () => {
    expect(marketsTileSubtitle(0)).toBe('No open markets')
    expect(marketsTileSubtitle(1)).toBe('1 open market')
    expect(marketsTileSubtitle(3)).toBe('3 open markets')
  })
})

describe('parlaysTileSubtitle', () => {
  it('handles zero, one and many', () => {
    expect(parlaysTileSubtitle(0)).toBe('Your slip is empty.')
    expect(parlaysTileSubtitle(1)).toBe('1 pick in your slip')
    expect(parlaysTileSubtitle(2)).toBe('2 picks in your slip')
  })
})

describe('leaderboardTileSubtitle', () => {
  it('always states the rank', () => {
    expect(leaderboardTileSubtitle(3, 8)).toBe('You’re ranked 3 of 8')
  })
})

describe('adminTileSubtitle', () => {
  it('handles zero, one and many', () => {
    expect(adminTileSubtitle(0)).toBe('Nothing waiting')
    expect(adminTileSubtitle(1)).toBe('1 approval waiting')
    expect(adminTileSubtitle(3)).toBe('3 approvals waiting')
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/lib/home/copy.test.ts`
Expected: FAIL with `Failed to resolve import "@/lib/home/copy"`

- [ ] **Step 3: Write `lib/home/copy.ts`**

```typescript
export function heroCaption(rank: number, memberCount: number, pendingCount: number, pendingDc: number): string {
  const rankPart = `Rank ${rank} of ${memberCount}`
  if (pendingCount === 0) return rankPart
  const reviewWord = pendingCount === 1 ? 'task review' : 'task reviews'
  return `${rankPart} · ${pendingDc} DC pending in ${pendingCount} ${reviewWord}`
}

export function marketsTileSubtitle(openCount: number): string {
  if (openCount === 0) return 'No open markets'
  if (openCount === 1) return '1 open market'
  return `${openCount} open markets`
}

// Reuses the spec's approved empty-slip copy ("Your slip is empty.") for the tile's zero case.
export function parlaysTileSubtitle(slipCount: number): string {
  if (slipCount === 0) return 'Your slip is empty.'
  if (slipCount === 1) return '1 pick in your slip'
  return `${slipCount} picks in your slip`
}

export function leaderboardTileSubtitle(rank: number, memberCount: number): string {
  return `You’re ranked ${rank} of ${memberCount}`
}

export function adminTileSubtitle(pendingApprovals: number): string {
  if (pendingApprovals === 0) return 'Nothing waiting'
  if (pendingApprovals === 1) return '1 approval waiting'
  return `${pendingApprovals} approvals waiting`
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/lib/home/copy.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Write `tests/components/home-hero.test.tsx` (will fail — the module doesn't exist yet)**

```typescript
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { HomeHero } from '@/components/home/home-hero'

describe('HomeHero', () => {
  it('shows exactly one "Balance: n DC" element, plus the rank and pending caption', () => {
    render(<HomeHero balance={120} rank={3} memberCount={8} pendingCount={1} pendingDc={25} />)
    // The number is its own <span>, so the sentence is only the <p>'s combined text (Testing Library's
    // string/regex matchers read an element's own text nodes only; Playwright reads descendants too).
    expect(
      screen.getAllByText((_, element) => element?.tagName === 'P' && /Balance: \d+ DC/.test(element.textContent ?? '')),
    ).toHaveLength(1)
    expect(screen.getByText('Rank 3 of 8 · 25 DC pending in 1 task review')).toBeInTheDocument()
  })

  it('drops the pending clause when nothing is pending', () => {
    render(<HomeHero balance={50} rank={1} memberCount={1} pendingCount={0} pendingDc={0} />)
    expect(screen.getByText('Rank 1 of 1')).toBeInTheDocument()
  })
})
```

- [ ] **Step 6: Run it to verify it fails**

Run: `npx vitest run tests/components/home-hero.test.tsx`
Expected: FAIL with `Failed to resolve import "@/components/home/home-hero"`

- [ ] **Step 7: Write `components/home/home-hero.tsx`**

```typescript
import { cn } from '@/lib/utils'
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
        <span className="text-[44px] leading-none font-extrabold tracking-[-0.03em] tabular-nums text-[#72DB2B] md:text-[60px]">
          {balance} DC
        </span>
      </p>
      <p className="text-sm text-hero-2">{heroCaption(rank, memberCount, pendingCount, pendingDc)}</p>
    </section>
  )
}
```

`#72DB2B` is the mockup's `.dc-big` colour, which stays fixed in both
themes (like `.gmark`'s white/navy) — it is not a token.

- [ ] **Step 8: Run the test to verify it passes**

Run: `npx vitest run tests/components/home-hero.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 9: Write `tests/components/home-tiles.test.tsx` (will fail — the module doesn't exist yet)**

```typescript
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { ChartColumn, Layers } from 'lucide-react'
import { HomeTiles } from '@/components/home/home-tiles'

describe('HomeTiles', () => {
  it('links every tile with its title and subtitle', () => {
    render(
      <HomeTiles
        tiles={[
          { id: 'markets', href: '/markets', icon: ChartColumn, title: 'Markets', subtitle: '3 open markets' },
          { id: 'parlays', href: '/parlays', icon: Layers, title: 'Parlays', subtitle: 'Your slip is empty.' },
        ]}
      />,
    )
    const nav = screen.getByRole('navigation', { name: 'Everything in DwellDuel' })
    const markets = within(nav).getByRole('link', { name: /Markets/ })
    expect(markets).toHaveAttribute('href', '/markets')
    expect(within(markets).getByText('3 open markets')).toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: /Parlays/ })).toHaveTextContent('Your slip is empty.')
  })
})
```

- [ ] **Step 10: Run it to verify it fails**

Run: `npx vitest run tests/components/home-tiles.test.tsx`
Expected: FAIL with `Failed to resolve import "@/components/home/home-tiles"`

- [ ] **Step 11: Write `components/home/home-tiles.tsx`**

```typescript
import type { LucideIcon } from 'lucide-react'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'

export interface HomeTile {
  id: string
  href: string
  icon: LucideIcon
  title: string
  subtitle: string
}

export function HomeTiles({ tiles }: { tiles: HomeTile[] }) {
  return (
    <nav aria-label="Everything in DwellDuel">
      <div className="flex flex-col divide-y divide-line rounded-card border border-line bg-surface px-1 lg:grid lg:grid-cols-3 lg:gap-5 lg:divide-y-0 lg:border-0 lg:bg-transparent lg:px-0">
        {tiles.map(({ id, href, icon: Icon, title, subtitle }) => (
          <Link
            key={id}
            href={href}
            className="group flex min-h-[72px] items-center gap-3.5 px-4 py-3 text-ink no-underline lg:min-h-24 lg:rounded-card lg:border lg:border-line lg:bg-surface lg:p-5 lg:shadow-card"
          >
            <span className="flex size-11 shrink-0 items-center justify-center rounded-control bg-acc-soft text-acc-text">
              <Icon aria-hidden="true" className="size-[22px]" />
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-[17px] leading-[1.25] font-extrabold group-hover:underline group-hover:underline-offset-[3px]">
                {title}
              </span>
              <span className="text-sm text-ink2">{subtitle}</span>
            </span>
            <ChevronRight aria-hidden="true" className="size-5 shrink-0 text-ink" />
          </Link>
        ))}
      </div>
    </nav>
  )
}
```

One set of links serves both breakpoints: on phone it's one divided card
(the mockup's `.card.stack.divided`); at `lg:` each link becomes its own
card in a 3-column grid (the mockup's `.grid3` of `.linktile.card`). Below
`lg` (including `md`, per the responsive rules) it stays the divided-list
layout, because the desktop 3-column grid would be too narrow before 1024px.

- [ ] **Step 12: Run the test to verify it passes**

Run: `npx vitest run tests/components/home-tiles.test.tsx`
Expected: PASS (1 test)

- [ ] **Step 13: Replace `app/(app)/page.tsx`**

```typescript
import { redirect } from 'next/navigation'
import { ChartColumn, Layers, BookOpen, MessageSquareText, Trophy, ShieldCheck, LogOut } from 'lucide-react'
import { requireUser } from '@/lib/auth/require-user'
import { isAdmin } from '@/lib/auth/is-admin'
import { signOut } from '@/lib/auth/sign-out'
import { readSlip } from '@/lib/parlays/slip'
import { listMarkets } from '@/lib/markets/list-markets'
import { getLeaderboard } from '@/lib/social/leaderboard'
import { listMyTaskCompletions, listPendingTaskCompletions } from '@/lib/tasks/list-task-completions'
import { Page, PageHeader } from '@/components/ui/page'
import { buttonVariants } from '@/components/ui/button'
import { HomeHero } from '@/components/home/home-hero'
import { HomeTiles, type HomeTile } from '@/components/home/home-tiles'
import { adminTileSubtitle, leaderboardTileSubtitle, marketsTileSubtitle, parlaysTileSubtitle } from '@/lib/home/copy'
import { cn } from '@/lib/utils'

export default async function Home() {
  const { supabase, user } = await requireUser()
  if (!user) redirect('/sign-in')

  const { data: profile } = await supabase.from('profiles').select('display_name, balance').eq('id', user.id).single()

  const [admin, slip, markets, board, myCompletions] = await Promise.all([
    isAdmin(supabase),
    readSlip(),
    listMarkets(supabase),
    getLeaderboard(supabase),
    listMyTaskCompletions(supabase, user.id),
  ])
  const pendingApprovals = admin ? await listPendingTaskCompletions(supabase) : []

  const openMarketCount = markets.filter((m) => m.status === 'open').length
  const me = board.find((m) => m.id === user.id)
  const rank = me?.rank ?? board.length
  const memberCount = board.length
  const pendingReviews = myCompletions.filter((c) => c.status === 'pending')
  const pendingDc = pendingReviews.reduce((sum, c) => sum + c.rewardAmount, 0)

  const tiles: HomeTile[] = [
    { id: 'markets', href: '/markets', icon: ChartColumn, title: 'Markets', subtitle: marketsTileSubtitle(openMarketCount) },
    { id: 'parlays', href: '/parlays', icon: Layers, title: 'Parlays', subtitle: parlaysTileSubtitle(slip.length) },
    { id: 'tasks', href: '/tasks', icon: BookOpen, title: 'Tasks', subtitle: 'Earn DC with Bible study' },
    { id: 'feed', href: '/feed', icon: MessageSquareText, title: 'Feed', subtitle: 'What everyone’s been up to' },
    {
      id: 'leaderboard',
      href: '/leaderboard',
      icon: Trophy,
      title: 'Leaderboard',
      subtitle: leaderboardTileSubtitle(rank, memberCount),
    },
  ]
  if (admin) {
    tiles.push({
      id: 'admin',
      href: '/admin/invites',
      icon: ShieldCheck,
      title: 'Admin',
      subtitle: adminTileSubtitle(pendingApprovals.length),
    })
  }

  return (
    <Page>
      <PageHeader title={`Welcome, ${profile?.display_name}`} />
      <HomeHero
        balance={profile?.balance ?? 0}
        rank={rank}
        memberCount={memberCount}
        pendingCount={pendingReviews.length}
        pendingDc={pendingDc}
      />
      <HomeTiles tiles={tiles} />
      <form action={signOut}>
        <button type="submit" className={cn(buttonVariants({ variant: 'secondary' }), 'self-start')}>
          <LogOut aria-hidden="true" className="size-5" />
          Sign out
        </button>
      </form>
    </Page>
  )
}
```

This is an async page that fetches data, so it isn't unit-tested directly
(per the testing conventions) — the build and the e2e suite cover it.

- [ ] **Step 14: Verify**

Run: `npm run lint && npx vitest run && npm run build`
Expected: all PASS

- [ ] **Step 15: Run the e2e suite**

Run: `lsof -ti:3000 | xargs -r kill 2>/dev/null; npx playwright test`
Expected: 13 passed (this task adds no new e2e tests; Task 3 already
brought the suite from 12 to 13)

- [ ] **Step 16: Commit**

```bash
git add lib/home/copy.ts components/home/home-hero.tsx components/home/home-tiles.tsx "app/(app)/page.tsx" tests/lib/home/copy.test.ts tests/components/home-hero.test.tsx tests/components/home-tiles.test.tsx
git commit -m "Restyle Home with a real balance hero and data-driven tile subtitles"
```

---

## Task 5: Market detail pieces — `OutcomeRow`, `BetList`, market dates, creator and resolution time

This task builds the pieces the market page needs, each tested on its own. Task 7 then assembles them into the page, so nothing renders them yet. The pieces are:
- the outcome row, in four states plus a winner flag
- the bets list and its empty state
- the local close and resolve dates
- the creator's name and the resolution time from `getMarket`

**Files:**
- Create: `lib/markets/outcome-series.ts`
- Create: `lib/markets/format-date.ts`
- Create: `components/ui/local-time.tsx`
- Create: `components/markets/outcome-row.tsx`
- Create: `components/markets/bet-list.tsx`
- Modify (rewrite): `lib/markets/get-market.ts`
- Test: `tests/lib/markets/outcome-series.test.ts`
- Test: `tests/lib/markets/format-date.test.ts`
- Test: `tests/db/get-market.test.ts`
- Test: `tests/components/local-time.test.tsx`
- Test: `tests/components/outcome-row.test.tsx`
- Test: `tests/components/bet-list.test.tsx`

**Interfaces:**
- Consumes:
  - Task 1: `Avatar` (`components/ui/avatar.tsx`) and `EmptyState` (`components/ui/empty-state.tsx`)
  - PR A: `Button` (`components/ui/button.tsx`) and `StatusChip` (`components/ui/status-chip.tsx`)
  - the repo: `formatOdds` (`lib/parlays/odds.ts`), and `MarketBet` (`lib/markets/get-market.ts`)
- Produces:
  - `type Series = 1 | 2 | 3 | 4 | 5 | 6` and `outcomeSeries(kind: 'binary' | 'multiple_choice', label: string, index: number): Series` in `lib/markets/outcome-series.ts`
  - `formatDateTime(iso: string, timeZone?: string): string` (`'Sun, Oct 4 · 9:00 AM'`) and `formatDay(iso: string, timeZone?: string): string` (`'Sep 21'`) in `lib/markets/format-date.ts`
  - `LocalTime({ iso, format }: { iso: string; format: 'dateTime' | 'day' })` in `components/ui/local-time.tsx`. It's a client component that renders a `<time dateTime={iso}>`, formatted in the viewer's time zone.
  - `MarketDetail` gains two fields:
    - `creatorName: string`: the creator's `display_name`, or `'Unknown member'`, the same fallback `getMarketBets` uses
    - `resolvedAt: string | null`: the current resolution's `resolved_at`
  - `type OutcomeRowState = 'add' | 'inslip' | 'disabled' | 'none'` and this component, in `components/markets/outcome-row.tsx`:
    ```ts
    OutcomeRow({ label, poolTotal, probability, oddsBp, series, state, winner, addAction, removeAction }: {
      label: string
      poolTotal: number
      probability: number | null
      oddsBp: number | null
      series: Series
      state: OutcomeRowState
      winner?: boolean
      addAction: (formData: FormData) => void | Promise<void>
      removeAction: (formData: FormData) => void | Promise<void>
    })
    ```
    It renders the row's `<div>`, and the caller wraps it in the `<li>`. The two actions come in as props, like the Parlays task's `SlipPick`, so the component stays presentational. The page passes `addToSlipAction.bind(null, outcomeId)` and `removeFromSlipAction.bind(null, outcomeId)`.
  - `BetList({ bets, outcomes, viewerId, canBet }: { bets: MarketBet[]; outcomes: { id: string; label: string }[]; viewerId: string; canBet: boolean })` in `components/markets/bet-list.tsx`. It renders the divided `<ul>`, or the empty state when there are no bets.

**Outcome row states** (from the canvas's `OutcomeRow` component):

| State | Payout line | Right side |
|---|---|---|
| `add` | `1.33× payout per DC` | secondary sm "Add to parlay" submit, with a `Plus` icon |
| `inslip` | same | "In your slip" chip (`StatusChip tone="open"` + `Check`) and a quiet sm "Remove" submit |
| `disabled` | same | the "Add to parlay" button, `disabled`, not inside a form |
| `none` | the whole action row is hidden | — |

`winner` adds a `StatusChip tone="done"` with a `Trophy` icon and "Winner" after the label. Each button ends with a space and then a visually hidden `{label}`, so its accessible name is "Add to parlay Yes" or "Remove Yes". That keeps the names unique, and it still substring-matches the e2e's `name: 'Add to parlay'`. The space sits outside the `sr-only` span, as in PR A's `SlipCount`, because `dom-accessibility-api` drops a leading space inside the span ("Add to parlayYes").

**Series colours.** The mockup always draws a yes/no market's Yes in `--s2` (green) and No in `--s1`. Multiple-choice outcomes take `--s1`…`--s6` in order. `outcomeSeries` encodes that rule, and `OutcomeRow` maps the number to a literal `bg-s1`…`bg-s6` class, so Tailwind sees every class name in source.

**Dates.** The server doesn't know the viewer's time zone. `LocalTime` uses `useSyncExternalStore`:
- the server snapshot formats the date in UTC
- the client snapshot uses the browser's zone

React hydrates with the server text and then re-renders with the local text, with no hydration mismatch.

Icons (all verified in `node_modules/lucide-react/dist/esm/icons/`): `Plus`, `Check`, `Trophy`, `CircleDot` (the bets empty state).

- [ ] **Step 1: Write the failing unit tests for the series and date helpers**

Create `tests/lib/markets/outcome-series.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { outcomeSeries } from '@/lib/markets/outcome-series'

describe('outcomeSeries', () => {
  it('always colours a yes/no market the same way, whatever order the outcomes arrive in', () => {
    expect(outcomeSeries('binary', 'Yes', 0)).toBe(2)
    expect(outcomeSeries('binary', 'No', 1)).toBe(1)
    expect(outcomeSeries('binary', 'Yes', 1)).toBe(2)
    expect(outcomeSeries('binary', 'No', 0)).toBe(1)
  })

  it('gives multiple-choice outcomes the series in order', () => {
    expect([0, 1, 2, 3, 4, 5].map((i) => outcomeSeries('multiple_choice', `Option ${i}`, i))).toEqual([1, 2, 3, 4, 5, 6])
  })

  it('wraps past the sixth series rather than running out', () => {
    expect(outcomeSeries('multiple_choice', 'Seventh', 6)).toBe(1)
  })
})
```

Create `tests/lib/markets/format-date.test.ts`. ICU puts a narrow no-break space (U+202F) before "AM"/"PM", so the time assertions match it with `\s`:

```typescript
import { describe, it, expect } from 'vitest'
import { formatDateTime, formatDay } from '@/lib/markets/format-date'

describe('formatDateTime', () => {
  it('formats a close time as weekday, date and time', () => {
    expect(formatDateTime('2026-10-04T14:00:00Z', 'America/Chicago')).toMatch(/^Sun, Oct 4 · 9:00\sAM$/)
  })

  it('uses the given time zone, even across midnight', () => {
    expect(formatDateTime('2026-10-05T03:30:00Z', 'America/Chicago')).toMatch(/^Sun, Oct 4 · 10:30\sPM$/)
    expect(formatDateTime('2026-10-05T03:30:00Z', 'UTC')).toMatch(/^Mon, Oct 5 · 3:30\sAM$/)
  })
})

describe('formatDay', () => {
  it('formats just the month and day', () => {
    expect(formatDay('2026-09-21T15:00:00Z', 'UTC')).toBe('Sep 21')
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/lib/markets/outcome-series.test.ts tests/lib/markets/format-date.test.ts`
Expected: FAIL with `Failed to resolve import "@/lib/markets/outcome-series"`, and the same for `"@/lib/markets/format-date"`

- [ ] **Step 3: Write `lib/markets/outcome-series.ts` and `lib/markets/format-date.ts`**

`lib/markets/outcome-series.ts`:

```typescript
export type Series = 1 | 2 | 3 | 4 | 5 | 6

// A yes/no market's Yes is always the green series, so the colour never depends on row order.
export function outcomeSeries(kind: 'binary' | 'multiple_choice', label: string, index: number): Series {
  if (kind === 'binary') return label === 'Yes' ? 2 : 1
  return ((index % 6) + 1) as Series
}
```

`lib/markets/format-date.ts`:

```typescript
export function formatDateTime(iso: string, timeZone?: string): string {
  const date = new Date(iso)
  const day = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone }).format(date)
  const time = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone }).format(date)
  return `${day} · ${time}`
}

export function formatDay(iso: string, timeZone?: string): string {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone }).format(new Date(iso))
}
```

- [ ] **Step 4: Run them to verify they pass**

Run: `npx vitest run tests/lib/markets/outcome-series.test.ts tests/lib/markets/format-date.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Write the failing DB test for `getMarket`**

Local Supabase must be running (`npm run db:start`). Create `tests/db/get-market.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { serviceClient } from './helpers'
import { seedMembers, clientFor, createTestMarket, ensureInvited, type Member } from './fixtures'
import { getMarket } from '@/lib/markets/get-market'

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

describe('getMarket', () => {
  it("names the market's creator, and has no resolution time while open", async () => {
    const { marketId } = await createTestMarket(aliceClient, ['Yes', 'No'])

    const market = await getMarket(bobClient, marketId)
    expect(market?.createdBy).toBe(alice.id)
    expect(market?.creatorName).toBe('Alice')
    expect(market?.resolvedAt).toBeNull()
  })

  it('dates the current resolution', async () => {
    const { marketId, outcomeIds } = await createTestMarket(aliceClient, ['Yes', 'No'], { closeInMs: 1000 })
    await serviceClient()
      .from('markets')
      .update({ close_at: new Date(Date.now() - 1000).toISOString() })
      .eq('id', marketId)
    const { error } = await aliceClient.rpc('resolve_market', { p_market_id: marketId, p_outcome_id: outcomeIds[0] })
    if (error) throw error

    const { data: resolution, error: resolutionErr } = await serviceClient()
      .from('market_resolutions')
      .select('resolved_at')
      .eq('market_id', marketId)
      .single()
    if (resolutionErr) throw resolutionErr

    const market = await getMarket(bobClient, marketId)
    expect(market?.resolvedOutcomeLabel).toBe('Yes')
    expect(market?.resolvedAt).toBe(resolution.resolved_at)
  })
})
```

- [ ] **Step 6: Run it to verify it fails**

Run: `npx vitest run tests/db/get-market.test.ts`
Expected: FAIL. The first test fails with `expected undefined to be 'Alice'`, and the second with `expected undefined to be '2026-…'`.

- [ ] **Step 7: Rewrite `lib/markets/get-market.ts`**

The select embeds the creator's profile. `created_by` is `markets`' only foreign key to `profiles`, so `profiles(display_name)` is unambiguous, the same embed `getMarketBets` uses. The resolution lookup it already makes now also reads `resolved_at`. `getMarketBets` is unchanged.

```typescript
import type { SupabaseClient } from '@supabase/supabase-js'

export interface MarketDetail {
  id: string
  title: string
  description: string | null
  kind: 'binary' | 'multiple_choice'
  status: 'open' | 'resolved' | 'voided'
  closeAt: string
  createdBy: string
  creatorName: string
  currentResolutionId: string | null
  resolvedOutcomeLabel: string | null
  resolvedAt: string | null
  outcomes: { id: string; label: string; poolTotal: number }[]
}

export interface MarketBet {
  id: number
  outcomeId: string
  amount: number
  createdAt: string
  profileId: string
  bettorName: string
}

export async function getMarket(supabase: SupabaseClient, marketId: string): Promise<MarketDetail | null> {
  const { data, error } = await supabase
    .from('markets')
    .select(
      'id, title, description, kind, status, close_at, created_by, current_resolution_id, creator:profiles(display_name), market_outcomes(id, label, pool_total)',
    )
    .eq('id', marketId)
    .maybeSingle()

  if (error) throw error
  if (!data) return null

  const outcomes = (data.market_outcomes ?? []).map((o: { id: string; label: string; pool_total: number }) => ({
    id: o.id,
    label: o.label,
    poolTotal: o.pool_total,
  }))

  let resolvedOutcomeLabel: string | null = null
  let resolvedAt: string | null = null
  if (data.current_resolution_id) {
    const { data: resolution, error: resolutionErr } = await supabase
      .from('market_resolutions')
      .select('outcome_id, resolved_at')
      .eq('id', data.current_resolution_id)
      .single()
    if (resolutionErr) throw resolutionErr
    resolvedOutcomeLabel = outcomes.find((o) => o.id === resolution.outcome_id)?.label ?? null
    resolvedAt = resolution.resolved_at
  }

  const creator = data.creator as unknown as { display_name: string } | null

  return {
    id: data.id,
    title: data.title,
    description: data.description,
    kind: data.kind,
    status: data.status,
    closeAt: data.close_at,
    createdBy: data.created_by,
    creatorName: creator?.display_name ?? 'Unknown member',
    currentResolutionId: data.current_resolution_id,
    resolvedOutcomeLabel,
    resolvedAt,
    outcomes,
  }
}

export async function getMarketBets(supabase: SupabaseClient, marketId: string): Promise<MarketBet[]> {
  const { data, error } = await supabase
    .from('bets')
    .select('id, outcome_id, amount, created_at, profile_id, profiles(display_name)')
    .eq('market_id', marketId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })

  if (error) throw error

  return (data ?? []).map((b) => {
    const profile = b.profiles as unknown as { display_name: string } | null
    return {
      id: b.id,
      outcomeId: b.outcome_id,
      amount: b.amount,
      createdAt: b.created_at,
      profileId: b.profile_id,
      bettorName: profile?.display_name ?? 'Unknown member',
    }
  })
}
```

- [ ] **Step 8: Run it to verify it passes**

Run: `npx vitest run tests/db/get-market.test.ts tests/db/market-bets.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 9: Write the failing component tests**

Create `tests/components/local-time.test.tsx`. The assertions compare raw `textContent`, because Testing Library's text matchers collapse the U+202F that ICU puts before "AM", and the expected string would still contain it:

```typescript
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { LocalTime } from '@/components/ui/local-time'
import { formatDateTime, formatDay } from '@/lib/markets/format-date'

const iso = '2026-10-04T14:00:00.000Z'

describe('LocalTime', () => {
  it('shows the date and time in the browser time zone, with a machine-readable datetime', () => {
    const { container } = render(<LocalTime iso={iso} format="dateTime" />)
    const time = container.querySelector('time')
    expect(time).toHaveAttribute('datetime', iso)
    expect(time?.textContent).toBe(formatDateTime(iso))
  })

  it('can show just the day', () => {
    const { container } = render(<LocalTime iso={iso} format="day" />)
    expect(container.querySelector('time')?.textContent).toBe(formatDay(iso))
  })
})
```

Create `tests/components/outcome-row.test.tsx`:

```typescript
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { OutcomeRow, type OutcomeRowState } from '@/components/markets/outcome-row'

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
    expect(screen.getByText('75% (60 DC)')).toBeInTheDocument()
    expect(screen.getByText('1.33× payout per DC')).toBeInTheDocument()
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
    expect(screen.getByText('1.33× payout per DC')).toBeInTheDocument()
  })

  it('hides the payout and every action when there is nothing to do', () => {
    renderRow('none')
    expect(screen.getByText('75% (60 DC)')).toBeInTheDocument()
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
    expect(screen.getByText('0% (0 DC)')).toBeInTheDocument()
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

Create `tests/components/bet-list.test.tsx`:

```typescript
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BetList } from '@/components/markets/bet-list'
import type { MarketBet } from '@/lib/markets/get-market'

const outcomes = [
  { id: 'o-yes', label: 'Yes' },
  { id: 'o-no', label: 'No' },
]

const bets: MarketBet[] = [
  { id: 2, outcomeId: 'o-no', amount: 15, createdAt: '2026-09-25T10:00:00Z', profileId: 'p-bob', bettorName: 'Bob' },
  { id: 1, outcomeId: 'o-yes', amount: 5, createdAt: '2026-09-25T09:00:00Z', profileId: 'p-alice', bettorName: 'Alice' },
]

describe('BetList', () => {
  it("reads each bet as one sentence and marks the viewer's own", () => {
    render(<BetList bets={bets} outcomes={outcomes} viewerId="p-alice" canBet />)
    const sentences = screen.getAllByRole('listitem').map((li) => li.querySelector('p')?.textContent)
    expect(sentences).toEqual(['Bob — 15 DC on No', 'Alice — 5 DC on Yes (you)'])
  })

  it("links each bettor's name to their profile", () => {
    render(<BetList bets={bets} outcomes={outcomes} viewerId="p-alice" canBet />)
    expect(screen.getByRole('link', { name: 'Alice' })).toHaveAttribute('href', '/members/p-alice')
    expect(screen.getByRole('link', { name: 'Bob' })).toHaveAttribute('href', '/members/p-bob')
  })

  it('invites the first bet while betting is open', () => {
    render(<BetList bets={[]} outcomes={outcomes} viewerId="p-alice" canBet />)
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
    expect(screen.getByText('No bets yet.')).toBeInTheDocument()
    expect(screen.getByText('Be the first to back an outcome.')).toBeInTheDocument()
  })

  it('drops the invitation once betting has closed', () => {
    render(<BetList bets={[]} outcomes={outcomes} viewerId="p-alice" canBet={false} />)
    expect(screen.getByText('No bets yet.')).toBeInTheDocument()
    expect(screen.queryByText('Be the first to back an outcome.')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 10: Run them to verify they fail**

Run: `npx vitest run tests/components/local-time.test.tsx tests/components/outcome-row.test.tsx tests/components/bet-list.test.tsx`
Expected: FAIL with `Failed to resolve import "@/components/ui/local-time"`, `"@/components/markets/outcome-row"` and `"@/components/markets/bet-list"`

- [ ] **Step 11: Write `components/ui/local-time.tsx`**

```typescript
'use client'

import { useSyncExternalStore } from 'react'
import { formatDateTime, formatDay } from '@/lib/markets/format-date'

const subscribe = () => () => {}

// The server can't know the viewer's time zone: it renders UTC, and the browser swaps in local time after hydration.
export function LocalTime({ iso, format }: { iso: string; format: 'dateTime' | 'day' }) {
  const formatter = format === 'day' ? formatDay : formatDateTime
  const text = useSyncExternalStore(
    subscribe,
    () => formatter(iso),
    () => formatter(iso, 'UTC'),
  )
  return <time dateTime={iso}>{text}</time>
}
```

- [ ] **Step 12: Write `components/markets/outcome-row.tsx`**

The bar uses the unrounded probability for its width. The label uses the rounded percent, as the page does today. An outcome with no bets has no odds (`oddsBp` is `null`), so its payout line is left empty.

```typescript
import { Check, Plus, Trophy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { StatusChip } from '@/components/ui/status-chip'
import type { Series } from '@/lib/markets/outcome-series'
import { formatOdds } from '@/lib/parlays/odds'
import { cn } from '@/lib/utils'

export type OutcomeRowState = 'add' | 'inslip' | 'disabled' | 'none'

const SERIES_BG: Record<Series, string> = {
  1: 'bg-s1',
  2: 'bg-s2',
  3: 'bg-s3',
  4: 'bg-s4',
  5: 'bg-s5',
  6: 'bg-s6',
}

export function OutcomeRow({
  label,
  poolTotal,
  probability,
  oddsBp,
  series,
  state,
  winner = false,
  addAction,
  removeAction,
}: {
  label: string
  poolTotal: number
  probability: number | null
  oddsBp: number | null
  series: Series
  state: OutcomeRowState
  winner?: boolean
  addAction: (formData: FormData) => void | Promise<void>
  removeAction: (formData: FormData) => void | Promise<void>
}) {
  const percent = (probability ?? 0) * 100
  const addLabel = (
    <>
      <Plus aria-hidden="true" className="size-[18px]" />
      Add to parlay <span className="sr-only">{label}</span>
    </>
  )

  return (
    <div className="flex flex-col gap-2 py-4">
      <div className="flex items-center justify-between gap-3">
        <span className="flex min-w-0 flex-wrap items-center gap-2">
          <span aria-hidden="true" className={cn('size-2.5 shrink-0 rounded-full', SERIES_BG[series])} />
          <span className="min-w-0 text-[17px] font-extrabold wrap-break-word">{label}</span>
          {winner && (
            <StatusChip tone="done">
              <Trophy aria-hidden="true" className="size-4" />
              Winner
            </StatusChip>
          )}
        </span>
        <span className="shrink-0 font-extrabold tabular-nums">
          {Math.round(percent)}% ({poolTotal} DC)
        </span>
      </div>
      <div aria-hidden="true" className="h-2 overflow-hidden rounded-full bg-sunk">
        <span className={cn('block h-full rounded-full', SERIES_BG[series])} style={{ width: `${percent}%` }} />
      </div>
      {state !== 'none' && (
        <div className="flex min-h-11 flex-wrap items-center justify-between gap-2">
          <span className="text-sm text-ink2">{oddsBp !== null && `${formatOdds(oddsBp)}× payout per DC`}</span>
          {state === 'inslip' && (
            <span className="flex items-center gap-2">
              <StatusChip tone="open">
                <Check aria-hidden="true" className="size-4" />
                In your slip
              </StatusChip>
              <form action={removeAction}>
                <Button type="submit" variant="quiet" size="sm">
                  Remove <span className="sr-only">{label}</span>
                </Button>
              </form>
            </span>
          )}
          {state === 'add' && (
            <form action={addAction}>
              <Button type="submit" variant="secondary" size="sm">
                {addLabel}
              </Button>
            </form>
          )}
          {state === 'disabled' && (
            <Button variant="secondary" size="sm" disabled>
              {addLabel}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 13: Write `components/markets/bet-list.tsx`**

The sentence sits in one `<p>`. Playwright's `getByText` matches the smallest element whose whole text contains the string, so the e2e's `getByText('Alice — 5 DC on Yes (you)')` and `getByText('5 DC on Yes')` each resolve to exactly that `<p>`. The `Avatar` initial sits outside it. Testing Library's `getByText` only reads an element's own text nodes, so the unit test compares each `<p>`'s `textContent` instead.

```typescript
import Link from 'next/link'
import { CircleDot } from 'lucide-react'
import { Avatar } from '@/components/ui/avatar'
import { EmptyState } from '@/components/ui/empty-state'
import type { MarketBet } from '@/lib/markets/get-market'

export function BetList({
  bets,
  outcomes,
  viewerId,
  canBet,
}: {
  bets: MarketBet[]
  outcomes: { id: string; label: string }[]
  viewerId: string
  canBet: boolean
}) {
  if (bets.length === 0) {
    return canBet ? (
      <EmptyState icon={CircleDot} title="No bets yet.">
        Be the first to back an outcome.
      </EmptyState>
    ) : (
      <EmptyState icon={CircleDot} title="No bets yet." />
    )
  }

  return (
    <ul className="flex flex-col divide-y divide-line">
      {bets.map((b) => (
        <li key={b.id} className="flex min-h-[52px] items-center gap-3 py-3">
          <Avatar name={b.bettorName} size="sm" />
          <p className="min-w-0">
            <Link href={`/members/${b.profileId}`}>{b.bettorName}</Link> — {b.amount} DC on{' '}
            {outcomes.find((o) => o.id === b.outcomeId)?.label ?? 'unknown outcome'}
            {b.profileId === viewerId && <span className="text-ink2"> (you)</span>}
          </p>
        </li>
      ))}
    </ul>
  )
}
```

- [ ] **Step 14: Run them to verify they pass**

Run: `npx vitest run tests/components/local-time.test.tsx tests/components/outcome-row.test.tsx tests/components/bet-list.test.tsx`
Expected: PASS (15 tests)

- [ ] **Step 15: Verify**

Run: `npm run lint && npx vitest run && npm run build`
Expected: all PASS. Nothing renders the new components yet, so the build output is unchanged apart from `getMarket`'s extra fields.

Run: `lsof -ti:3000 | xargs -r kill 2>/dev/null; npx playwright test`
Expected: 13 passed

- [ ] **Step 16: Commit**

```bash
git add lib/markets/outcome-series.ts lib/markets/format-date.ts lib/markets/get-market.ts components/ui/local-time.tsx components/markets/outcome-row.tsx components/markets/bet-list.tsx tests/lib/markets/outcome-series.test.ts tests/lib/markets/format-date.test.ts tests/db/get-market.test.ts tests/components/local-time.test.tsx tests/components/outcome-row.test.tsx tests/components/bet-list.test.tsx
git commit -m "Add OutcomeRow, BetList and local market dates; read the creator and resolution time"
```

---

## Task 6: Markets list and create market

**Files:**
- Create: `lib/markets/market-status.ts`
- Create: `components/markets/market-card.tsx`
- Modify (rewrite): `lib/markets/list-markets.ts`
- Modify: `app/(app)/markets/page.tsx`
- Modify: `app/(app)/markets/new/page.tsx`
- Modify: `app/(app)/markets/new/create-market-form.tsx`
- Test: `tests/lib/markets/market-status.test.ts`
- Test: `tests/db/list-markets.test.ts`
- Test: `tests/components/market-card.test.tsx`
- Test: `tests/components/create-market-form.test.tsx`

**Interfaces:**
- Consumes:
  - `Page`, `PageHeader`, `h2Class` (`components/ui/page.tsx`, Task 1)
  - `EmptyState` (`components/ui/empty-state.tsx`, Task 1)
  - `BackLink` (`components/ui/back-link.tsx`, Task 1)
  - `LocalTime({ iso, format })` (`components/ui/local-time.tsx`, Task 5) — the card's meta line uses this instead of defining its own formatter (R-B1)
  - `Button`, `buttonVariants` (`components/ui/button.tsx`, PR A)
  - `Field`, `Input`, `Textarea` (`components/ui/field.tsx`, PR A)
  - `Message` (`components/ui/message.tsx`, PR A)
  - `cardClass` (`components/ui/card.tsx`, PR A)
  - `StatusChip` (`components/ui/status-chip.tsx`, PR A)
  - `cn` (`lib/utils.ts`)
  - `requireUser()` (`lib/auth/require-user.ts`)
  - `listMarkets(supabase): Promise<MarketSummary[]>` (`lib/markets/list-markets.ts`) — extended by this task, see Produces
  - `computeOdds(outcomes): OutcomeOdds[]` (`lib/markets/odds.ts`)
  - `createMarketAction(prevState, formData)`, `type ActionState` (`lib/markets/create-market.ts`) — unchanged; every field name it reads (`title`, `description`, `kind`, `close_at`, `outcome_labels`, `outcome_labels_text`) stays exactly as it is.
- Produces:
  - `type MarketCardStatus = 'open' | 'awaiting' | 'resolved' | 'voided'` and `marketCardStatus(status: 'open' | 'resolved' | 'voided', closeAt: string, now: Date): MarketCardStatus` from `lib/markets/market-status.ts`. (Task 5's market-detail pieces have no equivalent — `MarketDetail` only gained `creatorName`/`resolvedAt`, not a status bucket — so this isn't a duplicate.)
  - `MarketSummary` gains `resolvedAt: string | null` (`lib/markets/list-markets.ts`) — the current resolution's `resolved_at`, read the same way `getMarket` (Task 5) already reads it, so the list's "Resolved" cards can show a real date instead of reusing `closeAt`.
  - `MarketCard({ id, title, status, closeAt, resolvedAt, outcomes, resolvedOutcomeLabel }: MarketCardProps)`, plus the exported `MarketCardProps` and `MarketCardOutcome` types, from `components/markets/market-card.tsx` (R-B2: presentational components extracted from a screen live under `components/<area>/`, not co-located with the page).

- [ ] **Step 1: Write `tests/lib/markets/market-status.test.ts` (will fail — the module doesn't exist yet)**

```typescript
import { describe, it, expect } from 'vitest'
import { marketCardStatus } from '@/lib/markets/market-status'

describe('marketCardStatus', () => {
  const now = new Date('2026-10-01T12:00:00.000Z')

  it('is open while still accepting bets', () => {
    expect(marketCardStatus('open', '2026-10-04T12:00:00.000Z', now)).toBe('open')
  })

  it('is awaiting resolution once closed but not yet resolved', () => {
    expect(marketCardStatus('open', '2026-09-30T12:00:00.000Z', now)).toBe('awaiting')
  })

  it('treats the exact close instant as awaiting resolution', () => {
    expect(marketCardStatus('open', now.toISOString(), now)).toBe('awaiting')
  })

  it('is resolved once an admin resolves it, regardless of close time', () => {
    expect(marketCardStatus('resolved', '2026-10-04T12:00:00.000Z', now)).toBe('resolved')
  })

  it('is voided regardless of close time', () => {
    expect(marketCardStatus('voided', '2026-10-04T12:00:00.000Z', now)).toBe('voided')
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/lib/markets/market-status.test.ts`
Expected: FAIL with `Failed to resolve import "@/lib/markets/market-status"`

- [ ] **Step 3: Write `lib/markets/market-status.ts`**

```typescript
export type MarketCardStatus = 'open' | 'awaiting' | 'resolved' | 'voided'

export function marketCardStatus(status: 'open' | 'resolved' | 'voided', closeAt: string, now: Date): MarketCardStatus {
  if (status === 'voided') return 'voided'
  if (status === 'resolved') return 'resolved'
  return new Date(closeAt) > now ? 'open' : 'awaiting'
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run tests/lib/markets/market-status.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Write the failing DB test for `listMarkets`'s resolution date**

Local Supabase must be running (`npm run db:start`). Create `tests/db/list-markets.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { serviceClient } from './helpers'
import { seedMembers, clientFor, createTestMarket, ensureInvited, type Member } from './fixtures'
import { listMarkets } from '@/lib/markets/list-markets'

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

describe('listMarkets', () => {
  it('has no resolution time for an open market', async () => {
    const { marketId } = await createTestMarket(aliceClient, ['Yes', 'No'])
    const markets = await listMarkets(bobClient)
    expect(markets.find((m) => m.id === marketId)?.resolvedAt).toBeNull()
  })

  it('dates the current resolution', async () => {
    const { marketId, outcomeIds } = await createTestMarket(aliceClient, ['Yes', 'No'], { closeInMs: 1000 })
    await serviceClient()
      .from('markets')
      .update({ close_at: new Date(Date.now() - 1000).toISOString() })
      .eq('id', marketId)
    const { error } = await aliceClient.rpc('resolve_market', { p_market_id: marketId, p_outcome_id: outcomeIds[0] })
    if (error) throw error

    const { data: resolution, error: resolutionErr } = await serviceClient()
      .from('market_resolutions')
      .select('resolved_at')
      .eq('market_id', marketId)
      .single()
    if (resolutionErr) throw resolutionErr

    const markets = await listMarkets(bobClient)
    const market = markets.find((m) => m.id === marketId)
    expect(market?.resolvedOutcomeLabel).toBe('Yes')
    expect(market?.resolvedAt).toBe(resolution.resolved_at)
  })
})
```

- [ ] **Step 6: Run it to verify it fails**

Run: `npx vitest run tests/db/list-markets.test.ts`
Expected: FAIL. Both assertions on `resolvedAt` fail with `expected undefined to be null` / `expected undefined to be '2026-…'` — the current `MarketSummary` has no `resolvedAt` field.

- [ ] **Step 7: Rewrite `lib/markets/list-markets.ts`**

The resolution lookup it already makes now also reads `resolved_at`, the same column `getMarket` (Task 5) reads.

```typescript
import type { SupabaseClient } from '@supabase/supabase-js'

export interface MarketSummary {
  id: string
  title: string
  kind: 'binary' | 'multiple_choice'
  status: 'open' | 'resolved' | 'voided'
  closeAt: string
  resolvedOutcomeLabel: string | null
  resolvedAt: string | null
  outcomes: { id: string; label: string; poolTotal: number }[]
}

export async function listMarkets(supabase: SupabaseClient): Promise<MarketSummary[]> {
  const { data, error } = await supabase
    .from('markets')
    .select('id, title, kind, status, close_at, current_resolution_id, market_outcomes(id, label, pool_total)')
    .order('created_at', { ascending: false })

  if (error) throw error

  const resolutionIds = (data ?? [])
    .map((m) => m.current_resolution_id)
    .filter((id): id is string => id !== null)

  const resolutionById = new Map<string, { outcomeId: string; resolvedAt: string }>()
  if (resolutionIds.length > 0) {
    const { data: resolutions, error: resolutionsErr } = await supabase
      .from('market_resolutions')
      .select('id, outcome_id, resolved_at')
      .in('id', resolutionIds)
    if (resolutionsErr) throw resolutionsErr
    for (const r of resolutions ?? []) resolutionById.set(r.id, { outcomeId: r.outcome_id, resolvedAt: r.resolved_at })
  }

  return (data ?? []).map((m) => {
    const outcomes = (m.market_outcomes ?? []).map((o: { id: string; label: string; pool_total: number }) => ({
      id: o.id,
      label: o.label,
      poolTotal: o.pool_total,
    }))
    const resolution = m.current_resolution_id ? resolutionById.get(m.current_resolution_id) : undefined
    const resolvedOutcomeLabel = resolution ? (outcomes.find((o) => o.id === resolution.outcomeId)?.label ?? null) : null

    return {
      id: m.id,
      title: m.title,
      kind: m.kind,
      status: m.status,
      closeAt: m.close_at,
      resolvedOutcomeLabel,
      resolvedAt: resolution?.resolvedAt ?? null,
      outcomes,
    }
  })
}
```

- [ ] **Step 8: Run it to verify it passes**

Run: `npx vitest run tests/db/list-markets.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 9: Write `tests/components/market-card.test.tsx` (will fail — the component doesn't exist yet)**

`LocalTime` renders local-time text that depends on the runtime's time zone, so these assertions check the `<time>` element's machine-readable `datetime` attribute and the surrounding label text, not the formatted clock string (`tests/components/local-time.test.tsx`, Task 5, already covers the formatting itself).

```typescript
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MarketCard } from '@/components/markets/market-card'

describe('MarketCard', () => {
  it('shows an open market\'s status, meta line, title link and outcome percentages', () => {
    const { container } = render(
      <MarketCard
        id="m1"
        title="Who wins the chili cook-off?"
        status="open"
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
})
```

- [ ] **Step 10: Run it to verify it fails**

Run: `npx vitest run 'tests/components/market-card.test.tsx'`
Expected: FAIL with `Failed to resolve import "@/components/markets/market-card"`

- [ ] **Step 11: Write `components/markets/market-card.tsx`**

```typescript
import Link from 'next/link'
import { Trophy } from 'lucide-react'
import { cardClass } from '@/components/ui/card'
import { StatusChip } from '@/components/ui/status-chip'
import { LocalTime } from '@/components/ui/local-time'
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

export interface MarketCardProps {
  id: string
  title: string
  status: MarketCardStatus
  closeAt: string
  resolvedAt: string | null
  outcomes: MarketCardOutcome[]
  resolvedOutcomeLabel: string | null
}

export function MarketCard({ id, title, status, closeAt, resolvedAt, outcomes, resolvedOutcomeLabel }: MarketCardProps) {
  const hasBets = outcomes.some((outcome) => outcome.pct !== null)

  return (
    <article className={cn(cardClass, 'flex flex-col gap-3 p-[18px] md:p-6')}>
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
        <ul className="flex flex-col gap-1.5">
          {outcomes.map((outcome) => (
            <li key={outcome.id} className="flex min-h-7 items-center gap-2.5">
              <span className="flex-1 font-bold">{outcome.label}</span>
              <span className="min-w-12 text-right font-extrabold tabular-nums">{outcome.pct}%</span>
            </li>
          ))}
        </ul>
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

`MarketCard` is a Server Component (no `'use client'`); it composes `LocalTime`, which is a Client Component (Task 5) — that's ordinary RSC composition, not a boundary violation.

- [ ] **Step 12: Run it to verify it passes**

Run: `npx vitest run 'tests/components/market-card.test.tsx'`
Expected: PASS (3 tests)

- [ ] **Step 13: Write `tests/components/create-market-form.test.tsx` (will fail against the current, unstyled form)**

```typescript
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('@/lib/markets/create-market', () => ({
  createMarketAction: vi.fn(async () => undefined),
}))

import { CreateMarketForm } from '@/app/(app)/markets/new/create-market-form'

describe('CreateMarketForm', () => {
  it('labels the title and close time fields, and defaults to a binary market', () => {
    render(<CreateMarketForm />)
    expect(screen.getByLabelText('Title')).toBeInTheDocument()
    expect(screen.getByLabelText('Close time')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Binary (Yes/No)' })).toBeChecked()
    expect(screen.getByRole('button', { name: 'Create market' })).toBeInTheDocument()
    expect(screen.queryByText('Outcomes')).not.toBeInTheDocument()
  })

  it('reveals the outcome inputs when Multiple choice is picked, capped at 6', async () => {
    const user = userEvent.setup()
    render(<CreateMarketForm />)

    await user.click(screen.getByRole('radio', { name: 'Multiple choice' }))
    expect(screen.getByLabelText('Outcome 1')).toBeInTheDocument()
    expect(screen.getByLabelText('Outcome 2')).toBeInTheDocument()

    const addOutcome = screen.getByRole('button', { name: 'Add outcome' })
    for (let i = 3; i <= 6; i++) {
      await user.click(addOutcome)
      expect(screen.getByLabelText(`Outcome ${i}`)).toBeInTheDocument()
    }
    expect(addOutcome).toBeDisabled()

    await user.click(screen.getByRole('radio', { name: 'Binary (Yes/No)' }))
    expect(screen.queryByLabelText('Outcome 1')).not.toBeInTheDocument()
  })

  it('cannot remove outcomes below the minimum of two', async () => {
    const user = userEvent.setup()
    render(<CreateMarketForm />)
    await user.click(screen.getByRole('radio', { name: 'Multiple choice' }))
    const removeButtons = screen.getAllByRole('button', { name: /Remove outcome/ })
    expect(removeButtons).toHaveLength(2)
    for (const button of removeButtons) expect(button).toBeDisabled()
  })
})
```

- [ ] **Step 14: Run it to verify it fails**

Run: `npx vitest run 'tests/components/create-market-form.test.tsx'`
Expected: FAIL on `getByLabelText('Outcome 1')` (the current form only has a single `outcome_labels_text` textarea) and on the missing `Add outcome` button.

- [ ] **Step 15: Rewrite `app/(app)/markets/new/create-market-form.tsx`**

```typescript
'use client'

import { useActionState, useState } from 'react'
import { Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Field, Input, Textarea } from '@/components/ui/field'
import { Message } from '@/components/ui/message'
import { cn } from '@/lib/utils'
import { createMarketAction, type ActionState } from '@/lib/markets/create-market'

const MAX_OUTCOMES = 6
const MIN_OUTCOMES = 2

export function CreateMarketForm() {
  const [kind, setKind] = useState<'binary' | 'multiple_choice'>('binary')
  const [outcomes, setOutcomes] = useState(['', ''])
  const [closeAtIso, setCloseAtIso] = useState('')
  const [state, formAction] = useActionState<ActionState, FormData>(createMarketAction, undefined)

  function updateOutcome(index: number, value: string) {
    setOutcomes((prev) => prev.map((outcome, i) => (i === index ? value : outcome)))
  }

  function addOutcome() {
    setOutcomes((prev) => (prev.length >= MAX_OUTCOMES ? prev : [...prev, '']))
  }

  function removeOutcome(index: number) {
    setOutcomes((prev) => (prev.length <= MIN_OUTCOMES ? prev : prev.filter((_, i) => i !== index)))
  }

  return (
    <form
      action={formAction}
      className="flex flex-col gap-5 rounded-card border border-line bg-surface p-[18px] shadow-card md:p-6"
    >
      <Field label="Title" htmlFor="cm-title">
        <Input
          id="cm-title"
          name="title"
          required
          aria-invalid={Boolean(state?.formError)}
          aria-describedby={state?.formError ? 'create-market-error' : undefined}
        />
      </Field>

      <Field label="Description" htmlFor="cm-desc">
        <Textarea id="cm-desc" name="description" />
      </Field>

      <fieldset className="flex flex-col gap-1.5">
        <legend className="text-[15px] font-bold">Type</legend>
        <div className="grid grid-cols-2 gap-1.5 rounded-[14px] bg-sunk p-1">
          <label
            className={cn(
              'flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-[10px] font-bold text-ink2',
              kind === 'binary' && 'bg-surface text-ink shadow-[0_1px_3px_rgba(3,39,45,0.12)]',
            )}
          >
            <input
              type="radio"
              name="kind"
              value="binary"
              checked={kind === 'binary'}
              onChange={() => setKind('binary')}
              className="size-[18px] accent-primary"
            />
            Binary (Yes/No)
          </label>
          <label
            className={cn(
              'flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-[10px] font-bold text-ink2',
              kind === 'multiple_choice' && 'bg-surface text-ink shadow-[0_1px_3px_rgba(3,39,45,0.12)]',
            )}
          >
            <input
              type="radio"
              name="kind"
              value="multiple_choice"
              checked={kind === 'multiple_choice'}
              onChange={() => setKind('multiple_choice')}
              className="size-[18px] accent-primary"
            />
            Multiple choice
          </label>
        </div>
      </fieldset>

      {kind === 'binary' ? (
        <>
          <input type="hidden" name="outcome_labels" value="Yes" />
          <input type="hidden" name="outcome_labels" value="No" />
        </>
      ) : (
        <fieldset className="flex flex-col gap-2">
          <legend className="text-[15px] font-bold">Outcomes</legend>
          <span className="text-sm text-ink2">
            Up to {MAX_OUTCOMES} outcomes · {outcomes.length} of {MAX_OUTCOMES} used
          </span>
          {outcomes.map((value, index) => (
            <div key={index} className="flex items-center gap-2">
              <label className="sr-only" htmlFor={`cm-outcome-${index}`}>{`Outcome ${index + 1}`}</label>
              <Input
                id={`cm-outcome-${index}`}
                value={value}
                onChange={(e) => updateOutcome(index, e.target.value)}
                className="flex-1"
              />
              <button
                type="button"
                onClick={() => removeOutcome(index)}
                disabled={outcomes.length <= MIN_OUTCOMES}
                aria-label={`Remove outcome ${index + 1}`}
                className="inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-control text-ink hover:bg-sunk disabled:cursor-not-allowed disabled:text-ink2 disabled:hover:bg-transparent"
              >
                <X aria-hidden="true" className="size-5" />
              </button>
            </div>
          ))}
          <input type="hidden" name="outcome_labels_text" value={outcomes.join('\n')} />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={addOutcome}
            disabled={outcomes.length >= MAX_OUTCOMES}
            className="self-start"
          >
            <Plus aria-hidden="true" className="size-[18px]" />
            Add outcome
          </Button>
        </fieldset>
      )}

      <Field label="Close time" htmlFor="cm-close">
        <Input
          id="cm-close"
          type="datetime-local"
          required
          onChange={(e) => setCloseAtIso(e.target.value ? new Date(e.target.value).toISOString() : '')}
        />
      </Field>
      <input type="hidden" name="close_at" value={closeAtIso} />

      {state?.formError && (
        <Message tone="error" id="create-market-error">
          {state.formError}
        </Message>
      )}

      <Button type="submit" block className="md:w-auto md:self-start">
        Create market
      </Button>
    </form>
  )
}
```

The per-outcome remove button is icon-only, exactly as the artboard draws it (`.iconbtn`, no visible label) — its whole accessible name comes from `aria-label`, so R-B3's "space outside the `sr-only` span" doesn't apply here (there's no visible text plus a hidden suffix to place a space between). This keeps every field name (`title`, `description`, `kind`, `close_at`, `outcome_labels`, `outcome_labels_text`) and the datetime-local → UTC `close_at` conversion exactly as they were — only `outcomes[index]` is new local UI state, joined back into the same `outcome_labels_text` field the server action already parses (`split('\n')`, trim, filter blank). The binary branch is untouched.

- [ ] **Step 16: Run it to verify it passes**

Run: `npx vitest run 'tests/components/create-market-form.test.tsx'`
Expected: PASS (3 tests)

- [ ] **Step 17: Rewrite `app/(app)/markets/page.tsx`**

```typescript
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ChartColumn, Plus } from 'lucide-react'
import { requireUser } from '@/lib/auth/require-user'
import { listMarkets } from '@/lib/markets/list-markets'
import { computeOdds } from '@/lib/markets/odds'
import { marketCardStatus, type MarketCardStatus } from '@/lib/markets/market-status'
import { Page, PageHeader, h2Class } from '@/components/ui/page'
import { EmptyState } from '@/components/ui/empty-state'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { MarketCard } from '@/components/markets/market-card'

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
  const now = new Date()

  const cards = markets.map((market) => {
    const odds = computeOdds(market.outcomes.map((o) => ({ id: o.id, label: o.label, pool_total: o.poolTotal })))
    return {
      id: market.id,
      title: market.title,
      status: marketCardStatus(market.status, market.closeAt, now),
      closeAt: market.closeAt,
      resolvedAt: market.resolvedAt,
      outcomes: odds.map((o) => ({
        id: o.outcomeId,
        label: o.label,
        pct: o.impliedProbability === null ? null : Math.round(o.impliedProbability * 100),
      })),
      resolvedOutcomeLabel: market.resolvedOutcomeLabel,
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
            <div className="grid gap-5 lg:grid-cols-3">
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

The header action is `sm` (44px) on phone and grows to the default `md` (48px) at `md:`, matching `Markets--phone-light` (`btn btn-primary btn-sm`) versus `Markets--desktop-light` (`btn btn-primary`, no `-sm`). The empty-state action stays `secondary`/`sm` at every width — the artboard doesn't resize it.

- [ ] **Step 18: Rewrite `app/(app)/markets/new/page.tsx`**

```typescript
import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth/require-user'
import { Page, PageHeader } from '@/components/ui/page'
import { BackLink } from '@/components/ui/back-link'
import { CreateMarketForm } from './create-market-form'

export default async function NewMarketPage() {
  const { user } = await requireUser()
  if (!user) redirect('/sign-in')

  return (
    <Page>
      <BackLink href="/markets">Markets</BackLink>
      <PageHeader title="Create market" />
      <CreateMarketForm />
    </Page>
  )
}
```

- [ ] **Step 19: Run the whole chain**

Run: `npm run lint && npx vitest run && npm run build`
Expected: all PASS.

Then run the browser suite:

Run: `lsof -ti:3000 | xargs -r kill 2>/dev/null; npx playwright test`
Expected: 13 passed.

- [ ] **Step 20: Commit**

```bash
git add lib/markets/market-status.ts lib/markets/list-markets.ts 'components/markets/market-card.tsx' 'app/(app)/markets/page.tsx' 'app/(app)/markets/new/page.tsx' 'app/(app)/markets/new/create-market-form.tsx' tests/lib/markets/market-status.test.ts tests/db/list-markets.test.ts 'tests/components/market-card.test.tsx' 'tests/components/create-market-form.test.tsx'
git commit -m "Restyle the markets list and create-market screens"
```

---

## Task 7: Market detail page — forms, bets, admin card, layout, and the e2e selector

This task restyles `/markets/[id]` to its three artboards, using Task 5's pieces:
- `Market--*`: open, the viewer is the creator, and the insufficient-balance error is showing
- `MarketFull--*`: the slip is full
- `MarketResolved--*`: resolved, with the admin override

The "Chance over time" card is omitted entirely (PR C).

**Files:**
- Modify (rewrite): `app/(app)/markets/[id]/page.tsx`
- Modify (rewrite): `app/(app)/markets/[id]/bet-form.tsx`
- Modify (rewrite): `app/(app)/markets/[id]/resolve-form.tsx`
- Modify (rewrite): `app/(app)/markets/[id]/void-button.tsx`
- Delete: `app/(app)/markets/[id]/slip-control.tsx` (replaced by `OutcomeRow`)
- Modify: `e2e/parlays.spec.ts` (decision 2's selector, lines 25–29)
- Test: `tests/components/market-forms.test.tsx`

**Interfaces:**
- Consumes:
  - Task 1: `Page` and `h1Class` (`components/ui/page.tsx`), `SectionCard` (`components/ui/section-card.tsx`) and `BackLink` (`components/ui/back-link.tsx`). It also relies on Task 1's `Message` roles: `ok` is `role="status"`, and `gold` has no live-region role.
  - Task 2: `placeBetAction` returns the insufficient-balance copy in `formError`. This task only renders it.
  - Task 5:
    - `OutcomeRow` and `OutcomeRowState` (`components/markets/outcome-row.tsx`)
    - `BetList` (`components/markets/bet-list.tsx`)
    - `LocalTime` (`components/ui/local-time.tsx`)
    - `outcomeSeries` (`lib/markets/outcome-series.ts`)
    - `MarketDetail.creatorName` and `MarketDetail.resolvedAt`
  - PR A: `Button`, `Field`/`Input`/`Select`, `StatusChip`, `Message`
  - the repo: `addToSlipAction`/`removeFromSlipAction`, `readSlip`, `MAX_PICKS`/`legOddsBp`, `computeOdds`, and the three market actions, all unchanged
- Produces:
  - `BetForm` and `ResolveForm` keep their props (`{ marketId, outcomes }`).
  - `VoidButton` gains an optional `className`: `VoidButton({ marketId, className }: { marketId: string; className?: string })`.
  - Test: `tests/components/market-forms.test.tsx` covers both forms' field labels and server-error ARIA.

**Layout.**
- **Desktop (`lg`, 1024px and up):** the `.cols` grid.
  - The left column holds Outcomes, then Bets.
  - The right column holds either Place a bet or Betting closed, then the Resolve/Override card.
- **DOM order:** Outcomes, then the right column, then Bets. This does two things:
  - The bet form's `<select>` is the page's first combobox and the resolve form's is the last, as the e2e needs.
  - On phones, a member sees Outcomes → Place a bet → Bets, as the phone artboard shows.
- **Keeping the columns independent:** the right column spans both grid rows, and the rows are `auto_1fr`. So neither column's height pushes the other's second card down:
  - Bets starts right under Outcomes.
  - The right column is as tall as its own cards.

**Which row state each outcome gets:**
- `inslip` when the outcome is in the slip, on any market status, so it can still be removed
- `none` when betting is closed or the outcome's pool is 0, because a 0 pool has no odds. That matches today's hidden button.
- `disabled` when the slip is full (6 picks) and this market isn't already in it
- `add` otherwise

This is today's `canAdd` rule. The MarketFull artboard shows a pick from the same market in the slip while the other rows are disabled. That contradicts the rule, because `addToSlipAction` swaps a same-market pick rather than growing the slip. The rule is kept.

**Status chip.**
- The text stays `Status: {market.status}`. That's exactly one element, so `getByText('Status: resolved')` still resolves to one element.
- The tone is:
  - `done` when resolved
  - `void` when voided
  - `wait` when open but past its close time (awaiting resolution)
  - `open` otherwise

- [ ] **Step 1: Write the failing form tests**

Create `tests/components/market-forms.test.tsx`:

```typescript
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const { placeBetAction, resolveMarketAction } = vi.hoisted(() => ({
  placeBetAction: vi.fn(),
  resolveMarketAction: vi.fn(),
}))
vi.mock('@/lib/markets/place-bet', () => ({ placeBetAction }))
vi.mock('@/lib/markets/resolve-market', () => ({ resolveMarketAction }))

import { BetForm } from '@/app/(app)/markets/[id]/bet-form'
import { ResolveForm } from '@/app/(app)/markets/[id]/resolve-form'

const outcomes = [
  { id: 'o-yes', label: 'Yes' },
  { id: 'o-no', label: 'No' },
]
const balanceError = 'Insufficient balance — you have 120 DC. Try a smaller amount.'

beforeEach(() => {
  placeBetAction.mockReset()
  resolveMarketAction.mockReset()
})

describe('BetForm', () => {
  it('labels both fields and keeps the amount placeholder', () => {
    render(<BetForm marketId="m1" outcomes={outcomes} />)
    expect(screen.getByRole('combobox', { name: 'Outcome' })).toHaveAttribute('name', 'outcome_id')
    const amount = screen.getByLabelText('Amount (DC)')
    expect(amount).toHaveAttribute('name', 'amount')
    expect(amount).toHaveAttribute('placeholder', 'Amount (DC)')
    expect(amount).toHaveAttribute('aria-invalid', 'false')
    expect(amount).not.toHaveAttribute('aria-describedby')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('ties a server error to the amount field', async () => {
    placeBetAction.mockResolvedValue({ formError: balanceError })
    render(<BetForm marketId="m1" outcomes={outcomes} />)
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Outcome' }), 'No')
    await userEvent.type(screen.getByLabelText('Amount (DC)'), '200')
    await userEvent.click(screen.getByRole('button', { name: 'Place bet' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(balanceError)
    expect(alert).toHaveAttribute('id', 'bet-error')
    const amount = screen.getByLabelText('Amount (DC)')
    expect(amount).toHaveAttribute('aria-invalid', 'true')
    expect(amount).toHaveAccessibleDescription(balanceError)

    const [marketId, prevState, formData] = placeBetAction.mock.calls[0]
    expect(marketId).toBe('m1')
    expect(prevState).toBeUndefined()
    expect(formData.get('outcome_id')).toBe('o-no')
    expect(formData.get('amount')).toBe('200')
  })
})

describe('ResolveForm', () => {
  it('starts on a placeholder, so the winner is always a deliberate choice', () => {
    render(<ResolveForm marketId="m1" outcomes={outcomes} />)
    const select = screen.getByRole('combobox', { name: 'Winning outcome' })
    expect(select).toHaveAttribute('name', 'outcome_id')
    expect(select).toHaveValue('')
    expect(screen.getByRole('option', { name: 'Choose the winner…' })).toBeDisabled()
  })

  it('ties a server error to the outcome select', async () => {
    resolveMarketAction.mockResolvedValue({ formError: 'market not found' })
    render(<ResolveForm marketId="m1" outcomes={outcomes} />)
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Winning outcome' }), 'Yes')
    await userEvent.click(screen.getByRole('button', { name: 'Confirm outcome' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveAttribute('id', 'resolve-error')
    const select = screen.getByRole('combobox', { name: 'Winning outcome' })
    expect(select).toHaveAttribute('aria-invalid', 'true')
    expect(select).toHaveAccessibleDescription('market not found')
    expect(resolveMarketAction.mock.calls[0][2].get('outcome_id')).toBe('o-yes')
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/components/market-forms.test.tsx`
Expected: FAIL (4 tests), with `Unable to find an accessible element with the role "combobox" and name "Outcome"` and `… name "Winning outcome"`, because today's selects have no labels.

- [ ] **Step 3: Rewrite `app/(app)/markets/[id]/bet-form.tsx`**

The amount keeps `placeholder="Amount (DC)"` for the e2e, next to its new visible label. The error `Message` sits after the form, as in the artboard. The amount input points at it. Every `placeBetAction` error concerns the amount, apart from "Choose an outcome.", which the native `required` select prevents.

```typescript
'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { Field, Input, Select } from '@/components/ui/field'
import { Message } from '@/components/ui/message'
import { placeBetAction, type ActionState } from '@/lib/markets/place-bet'

export function BetForm({ marketId, outcomes }: { marketId: string; outcomes: { id: string; label: string }[] }) {
  const boundAction = placeBetAction.bind(null, marketId)
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
        <Button type="submit" block>
          Place bet
        </Button>
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

- [ ] **Step 4: Rewrite `app/(app)/markets/[id]/resolve-form.tsx`**

The artboard's "Choose the winner…" placeholder is a disabled, empty option, and the select is `required`. So confirming without a choice is blocked in the browser, and `resolveMarketAction`'s "Choose the winning outcome." remains the fallback. The override form uses the placeholder too. It doesn't pre-select the current winner.

```typescript
'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { Field, Select } from '@/components/ui/field'
import { Message } from '@/components/ui/message'
import { resolveMarketAction, type ActionState } from '@/lib/markets/resolve-market'

export function ResolveForm({ marketId, outcomes }: { marketId: string; outcomes: { id: string; label: string }[] }) {
  const boundAction = resolveMarketAction.bind(null, marketId)
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
        <Button type="submit" block>
          Confirm outcome
        </Button>
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

- [ ] **Step 5: Rewrite `app/(app)/markets/[id]/void-button.tsx`**

The artboard's note "Voiding refunds every bet and parlay leg." becomes the button's description.

```typescript
'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { Message } from '@/components/ui/message'
import { voidMarketAction, type ActionState } from '@/lib/markets/void-market'
import { cn } from '@/lib/utils'

export function VoidButton({ marketId, className }: { marketId: string; className?: string }) {
  const boundAction = voidMarketAction.bind(null, marketId)
  const [state, formAction] = useActionState<ActionState, FormData>(boundAction, undefined)

  return (
    <form action={formAction} className={cn('flex flex-col gap-2', className)}>
      <Button
        type="submit"
        variant="danger"
        block
        aria-describedby={state?.formError ? 'void-hint void-error' : 'void-hint'}
      >
        Void this market
      </Button>
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

- [ ] **Step 6: Run the form tests to verify they pass**

Run: `npx vitest run tests/components/market-forms.test.tsx`
Expected: PASS (4 tests)

- [ ] **Step 7: Rewrite `app/(app)/markets/[id]/page.tsx` and delete `slip-control.tsx`**

Run: `git rm "app/(app)/markets/[id]/slip-control.tsx"`

Then write `app/(app)/markets/[id]/page.tsx`. The permission and slip rules (`canBet`, `canResolve`, `canOverride`, `canVoid`, `slipFull`) are unchanged from today's page. The existing `react-hooks/purity` comment and disable stay as they are.

```typescript
import Link from 'next/link'
import { redirect, notFound } from 'next/navigation'
import { requireUser } from '@/lib/auth/require-user'
import { isAdmin } from '@/lib/auth/is-admin'
import { getMarket, getMarketBets } from '@/lib/markets/get-market'
import { computeOdds } from '@/lib/markets/odds'
import { outcomeSeries } from '@/lib/markets/outcome-series'
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
import { OutcomeRow, type OutcomeRowState } from '@/components/markets/outcome-row'
import { BetForm } from './bet-form'
import { ResolveForm } from './resolve-form'
import { VoidButton } from './void-button'

export default async function MarketDetailPage(props: PageProps<'/markets/[id]'>) {
  const { id } = await props.params
  const { supabase, user } = await requireUser()
  if (!user) redirect('/sign-in')

  const market = await getMarket(supabase, id)
  if (!market) notFound()

  const bets = await getMarketBets(supabase, id)
  const admin = await isAdmin(supabase)
  const odds = computeOdds(market.outcomes.map((o) => ({ id: o.id, label: o.label, pool_total: o.poolTotal })))
  const totalPool = odds.reduce((sum, o) => sum + o.poolTotal, 0)

  const isCreator = market.createdBy === user.id
  // Server Components render once per request with no re-render/
  // reconciliation cycle for React to keep consistent across -- the
  // purity rule protects Client Components from that, which doesn't
  // apply here, and this page already does non-deterministic async DB
  // reads (getMarket, getMarketBets, isAdmin) on every invocation regardless.
  // eslint-disable-next-line react-hooks/purity
  const isPastClose = new Date(market.closeAt).getTime() <= Date.now()
  const canBet = market.status === 'open' && !isPastClose
  const canResolve = market.status === 'open' && ((isCreator && isPastClose) || admin)
  const canOverride = market.status === 'resolved' && admin
  const canVoid = market.status === 'open' && (isCreator || admin)
  const showResolve = canResolve || canOverride

  const slip = await readSlip()
  const marketInSlip = market.outcomes.some((o) => slip.includes(o.id))
  const slipFull = slip.length >= MAX_PICKS && !marketInSlip

  function rowState(outcomeId: string, poolTotal: number): OutcomeRowState {
    if (slip.includes(outcomeId)) return 'inslip'
    if (!canBet || poolTotal === 0) return 'none'
    return slipFull ? 'disabled' : 'add'
  }

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
          <StatusChip tone={statusTone}>Status: {market.status}</StatusChip>
          <span className="text-sm text-ink2">
            {when}Created by {isCreator ? 'you' : market.creatorName}
          </span>
        </div>
        <h1 className={h1Class}>{market.title}</h1>
        {market.description && <p className="max-w-[68ch] text-ink2">{market.description}</p>}
        {market.status === 'resolved' && market.resolvedOutcomeLabel && (
          <Message tone="ok" className="self-start">
            Winning outcome: {market.resolvedOutcomeLabel}
          </Message>
        )}
      </div>

      <div className="flex flex-col gap-5 lg:grid lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:grid-rows-[auto_1fr] lg:items-start lg:gap-7">
        <SectionCard
          title="Outcomes"
          titleId="outcomes-title"
          action={<span className="text-sm text-ink2 tabular-nums">{totalPool} DC in the pool</span>}
          className="gap-1 lg:col-start-1 lg:row-start-1"
        >
          {canBet && slipFull && (
            <Message tone="gold" className="mt-2">
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
                  state={rowState(o.outcomeId, o.poolTotal)}
                  winner={market.status === 'resolved' && o.label === market.resolvedOutcomeLabel}
                  addAction={addToSlipAction.bind(null, o.outcomeId)}
                  removeAction={removeFromSlipAction.bind(null, o.outcomeId)}
                />
              </li>
            ))}
          </ul>
        </SectionCard>

        <div className="flex flex-col gap-5 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:gap-7">
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

        <SectionCard title="Bets" titleId="bets-title" className="gap-1 lg:col-start-1 lg:row-start-2">
          <BetList bets={bets} outcomes={market.outcomes} viewerId={user.id} canBet={canBet} />
        </SectionCard>
      </div>
    </Page>
  )
}
```

- [ ] **Step 8: Update the parlays e2e selector (decision 2)**

In `e2e/parlays.spec.ts`, replace lines 25–29.

Before:

```typescript
    await page
      .getByRole('listitem')
      .filter({ hasText: /^Yes —/ })
      .getByRole('button', { name: 'Add to parlay' })
      .click()
```

After:

```typescript
    await page
      .getByRole('region', { name: 'Outcomes' })
      .getByRole('listitem')
      .filter({ hasText: 'Yes' })
      .getByRole('button', { name: 'Add to parlay' })
      .click()
```

Notes on the new locator:
- The "No" row contains no "yes", even case-insensitively. Its text is "No", its percentage, its payout and "Add to parlay No". So the filter picks exactly one row.
- The button's name "Add to parlay Yes" still substring-matches `'Add to parlay'`.
- No asserted string changes.

- [ ] **Step 9: Verify**

Run: `npm run lint && npx vitest run && npm run build`
Expected: all PASS

Run: `lsof -ti:3000 | xargs -r kill 2>/dev/null; npx playwright test`
Expected: 13 passed

These e2e checks touch this page:
- `market-engine.spec.ts`: the heading, the first and last combobox, `Amount (DC)`, `20 DC on Yes`, `Status: resolved`
- `parlays.spec.ts`: the Outcomes region, `In your slip`, `5 DC on Yes`, `15 DC on No`
- `social.spec.ts`: `Alice — 5 DC on Yes (you)`

- [ ] **Step 10: Visual check (when a browser is available)**

Run `npm run dev`. With a market you created, compare the page against `Market--phone-light` and `Market--desktop-light`, at 375px and 1280px, in both themes:
- Submit a bet larger than your balance to see the error state.
- Fill the slip to 6 picks from other markets to compare against `MarketFull`.
- Resolve the market as the admin to compare against `MarketResolved`.

Check each of these:
- the columns at 1280px
- the stacked order at 375px
- every button is at least 44px
- focus rings are visible
- the long-label wrap on a multiple-choice market

- [ ] **Step 11: Commit**

```bash
git add "app/(app)/markets/[id]/page.tsx" "app/(app)/markets/[id]/bet-form.tsx" "app/(app)/markets/[id]/resolve-form.tsx" "app/(app)/markets/[id]/void-button.tsx" tests/components/market-forms.test.tsx e2e/parlays.spec.ts
git commit -m "Restyle market detail: outcome rows, bet and resolve forms, bets list, admin card"
```

(`slip-control.tsx`'s deletion was staged by `git rm` in Step 7.)

---

## Task 8: Parlays

Restyles `/parlays` to its four artboards:
- `Parlays`: a normal slip plus placed parlays
- `ParlaysStale`: a pick that's no longer available
- `ParlaysOnePick`: a slip with one pick
- `ParlaysPlaced`: the success message after placing

The `EmptyStates` artboard supplies the empty slip and the empty "My parlays" list.

**Files:**
- Create: `components/parlays/slip-pick.tsx`
- Create: `components/parlays/placed-parlay.tsx`
- Modify (rewrite): `app/(app)/parlays/slip-form.tsx`
- Modify (rewrite): `app/(app)/parlays/page.tsx`
- Test: `tests/components/slip-pick.test.tsx`
- Test: `tests/components/placed-parlay.test.tsx`
- Test: `tests/components/slip-form.test.tsx`

**Interfaces:**
- Consumes:
  - Task 1: `Page` and `PageHeader` from `components/ui/page.tsx`, `SectionCard` from `components/ui/section-card.tsx`, and `EmptyState` from `components/ui/empty-state.tsx`. It also relies on Task 1's `Message` change: `ok` is `role="status"`, and `gold` has no live-region role.
  - Task 2: `placeParlayAction` returns the friendly insufficient-balance copy in `formError`. This task only renders `state.formError`.
  - Task 7: the `e2e/parlays.spec.ts` selector change for "Add to parlay". The parlays e2e test can't reach `/parlays` without it.
  - Unchanged, from PR A and the repo:
    - `Button`/`buttonVariants`, `Field`/`Input`, `StatusChip`, `Message`
    - `SlipView` and `SlipPick` (the type) from `lib/parlays/get-slip.ts`
    - `ParlayView` from `lib/parlays/list-parlays.ts`
    - `LegStatus` from `lib/parlays/leg-status.ts`
    - `formatOdds`, `potentialPayout` and `MAX_PICKS` from `lib/parlays/odds.ts`
    - `placeParlayAction` and `PlaceParlayState` from `lib/parlays/place-parlay.ts`
    - `removeFromSlipAction` from `lib/parlays/slip-actions.ts`
- Produces:
  - `SlipPick({ pick, removeAction }: { pick: SlipPickView; removeAction: (formData: FormData) => void | Promise<void> }): JSX.Element` in `components/parlays/slip-pick.tsx`. It renders one slip row: the market link, the outcome, then either the odds or a "No longer available" chip, and a Remove button that submits `removeAction`.
  - `PlacedParlay({ parlay }: { parlay: ParlayView }): JSX.Element` in `components/parlays/placed-parlay.tsx`. It renders one `<li>` of the "My parlays" list: the status line, then one row per leg with a status pill.
  - `SlipForm({ slip }: { slip: SlipView }): JSX.Element` in `app/(app)/parlays/slip-form.tsx`. This client component now owns the whole slip column: the success message and the "Your slip" card with its picks, footer and empty state. The `ParlaysPlaced` artboard puts the success message above the card. That message is `useActionState` state, so it has to live in a component that stays mounted when `placeParlayAction` empties the slip and revalidates the page.

**How the e2e strings are kept.** Playwright's `getByText` returns the smallest element whose whole text contains the string. The mockup splits some of these strings across child elements, but always inside one `<p>`. That `<p>` is still the single element that matches:

| String | Element |
|---|---|
| `Combined: 16.00×` | `<p>` in the slip footer |
| `Stake (DC)` | the `Field` label, tied to `#stake` |
| `Potential payout: 80 DC` | `<p>Potential payout: <strong>80 DC</strong></p>`, rendered only once the stake is a whole number above 0, as today |
| `Place parlay` | the submit button. No other button's name contains it; the Remove buttons are named "Remove {outcome}, {market}". |
| `Parlay placed at 16.00× — potential payout 80 DC.` | the `<span>` inside the `ok` `Message` above the slip card. It doesn't collide with "Potential payout:", which has a colon. |
| `Pending — … if every pick wins` and `Won — … paid 80 DC` | `<p><span>Pending</span> — 5 DC at 16.00× — pays 80 DC if every pick wins</p>`, one per parlay (the tests use `.first()`) |

**Slip states (the Place parlay rules):**

| Picks | Footer |
|---|---|
| 0 | No footer. Shows `EmptyState`: "Your slip is empty." / "Add picks from any open market." / a "Browse markets" link. The header reads "Empty". |
| 1 (live or stale) | Muted "Add at least one more pick to place a parlay." and a full-width secondary "Browse markets" link. No stake field, no button (`ParlaysOnePick`). |
| ≥ 2, all live | "Combined", the stake field, the payout (once a stake is typed) and an enabled "Place parlay" button. |
| ≥ 2, any stale | The same, but "Place parlay" is disabled. A gold `Message` reads "Remove the pick that’s no longer available to place this parlay." and the button's `aria-describedby` points at it (`ParlaysStale`). "Combined" and the payout count only the live picks, which is what `getSlipView` already computes. |

A server error renders as `<Message tone="error" id="slip-error">` after the button, and the stake input gets `aria-invalid` and `aria-describedby="slip-error"`.

Mockup classes map as follows:
- `.pick`: `flex items-center gap-3 py-3.5`
- `.leg`: `flex items-center justify-between gap-3 py-2 text-[15px]`
- `.st-*`: `font-extrabold` plus `text-gold` / `text-win` / `text-loss` / `text-ink2`
- `.pill` with `.chip-*`: the pill base plus `bg-gold-soft text-gold` (pending), `bg-acc-soft text-acc-text` (won), `bg-loss-soft text-loss` (lost) or `bg-sunk text-ink2` (voided)

Tailwind's preflight strips link underlines, so every text link gets an explicit `underline` (the base `a` rule in `globals.css` supplies the colour, thickness and offset). Icons: the empty-state icon is lucide `Layers` (the mockup's three stacked chevron layers). Check it exists with `ls node_modules/lucide-react/dist/esm/icons/ | grep -x 'layers.mjs'`.

- [ ] **Step 1: Write `tests/components/slip-pick.test.tsx` (will fail — the module doesn't exist yet)**

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SlipPick } from '@/components/parlays/slip-pick'
import type { SlipPick as SlipPickView } from '@/lib/parlays/get-slip'

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
    expect(screen.getByText('4.00×')).toBeInTheDocument()
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

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/components/slip-pick.test.tsx`
Expected: FAIL — `Failed to resolve import "@/components/parlays/slip-pick"`.

- [ ] **Step 3: Write `components/parlays/slip-pick.tsx`**

```tsx
import Link from 'next/link'
import { Button } from '@/components/ui/button'
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
        <Link href={`/markets/${pick.marketId}`} className="text-sm underline">
          {pick.marketTitle}
        </Link>
        <span className="text-[17px] font-extrabold leading-[1.3]">{pick.outcomeLabel}</span>
      </div>
      {pick.available && pick.oddsBp !== null ? (
        <span className="whitespace-nowrap text-lg font-extrabold tabular-nums">{`${formatOdds(pick.oddsBp)}×`}</span>
      ) : (
        <StatusChip tone="lost">No longer available</StatusChip>
      )}
      <form action={removeAction}>
        <Button type="submit" variant="quiet" size="sm">
          Remove{' '}
          <span className="sr-only">{`${pick.outcomeLabel}, ${pick.marketTitle}`}</span>
        </Button>
      </form>
    </div>
  )
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npx vitest run tests/components/slip-pick.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Write `tests/components/placed-parlay.test.tsx` (will fail — the module doesn't exist yet)**

```tsx
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PlacedParlay } from '@/components/parlays/placed-parlay'
import type { ParlayView } from '@/lib/parlays/list-parlays'

function parlay(overrides: Partial<ParlayView>): ParlayView {
  return {
    id: 'p1',
    stake: 5,
    status: 'pending',
    credited: 0,
    multiplierBp: 160_000,
    capped: false,
    potentialPayout: 80,
    createdAt: '2026-09-25T12:00:00Z',
    legs: [
      { marketId: 'm1', marketTitle: 'Will it rain?', outcomeLabel: 'Yes', lockedOddsBp: 40_000, status: 'pending' },
      { marketId: 'm2', marketTitle: 'Who wins trivia night?', outcomeLabel: 'Grace', lockedOddsBp: 40_000, status: 'pending' },
    ],
    ...overrides,
  }
}

function renderParlay(p: ParlayView) {
  render(
    <ul>
      <PlacedParlay parlay={p} />
    </ul>,
  )
}

// The status word is its own <span>, so the whole sentence is only the <p>'s combined text.
function statusLine(text: string) {
  return screen.getByText((_, element) => element?.tagName === 'P' && element.textContent === text)
}

describe('PlacedParlay', () => {
  it('describes a pending parlay and colours its status gold', () => {
    renderParlay(parlay({}))
    expect(statusLine('Pending — 5 DC at 16.00× — pays 80 DC if every pick wins')).toBeInTheDocument()
    expect(screen.getByText('Pending')).toHaveClass('font-extrabold', 'text-gold')
  })

  it('describes a won parlay with what it paid', () => {
    renderParlay(parlay({ status: 'won', credited: 80 }))
    expect(statusLine('Won — 5 DC at 16.00× — paid 80 DC')).toBeInTheDocument()
    expect(screen.getByText('Won')).toHaveClass('text-win')
  })

  it('describes a lost parlay', () => {
    renderParlay(parlay({ status: 'lost' }))
    expect(statusLine('Lost — 5 DC at 16.00×')).toBeInTheDocument()
    expect(screen.getByText('Lost')).toHaveClass('text-loss')
  })

  it('describes a refunded parlay', () => {
    renderParlay(parlay({ status: 'refunded', credited: 5, multiplierBp: 10_000, potentialPayout: 5 }))
    expect(statusLine('Refunded — 5 DC returned')).toBeInTheDocument()
    expect(screen.getByText('Refunded')).toHaveClass('text-ink2')
  })

  it('notes when the multiplier was capped', () => {
    renderParlay(parlay({ multiplierBp: 200_000, capped: true, potentialPayout: 100 }))
    expect(statusLine('Pending — 5 DC at 20.00× — pays 100 DC if every pick wins (capped at 20×)')).toBeInTheDocument()
  })

  it('lists each leg with a link to its market, the picked outcome and a status pill', () => {
    renderParlay(
      parlay({
        status: 'lost',
        legs: [
          { marketId: 'm1', marketTitle: 'Will it rain?', outcomeLabel: 'Yes', lockedOddsBp: 40_000, status: 'won' },
          { marketId: 'm2', marketTitle: 'Who wins trivia night?', outcomeLabel: 'Grace', lockedOddsBp: 40_000, status: 'lost' },
          { marketId: 'm3', marketTitle: 'Will the choir sing?', outcomeLabel: 'No', lockedOddsBp: 20_000, status: 'voided' },
          { marketId: 'm4', marketTitle: 'Will the bake sale top $500?', outcomeLabel: 'Yes', lockedOddsBp: 20_000, status: 'pending' },
        ],
      }),
    )
    expect(screen.getByRole('link', { name: 'Will it rain?' })).toHaveAttribute('href', '/markets/m1')
    expect(screen.getByRole('link', { name: 'Who wins trivia night?' })).toHaveAttribute('href', '/markets/m2')
    expect(screen.getByText('Grace').tagName).toBe('STRONG')
    expect(screen.getByText('won')).toHaveClass('bg-acc-soft', 'text-acc-text', 'h-6', 'rounded-full')
    expect(screen.getByText('lost')).toHaveClass('bg-loss-soft', 'text-loss')
    expect(screen.getByText('voided')).toHaveClass('bg-sunk', 'text-ink2')
    expect(screen.getByText('pending')).toHaveClass('bg-gold-soft', 'text-gold')
  })
})
```

- [ ] **Step 6: Run it and watch it fail**

Run: `npx vitest run tests/components/placed-parlay.test.tsx`
Expected: FAIL — `Failed to resolve import "@/components/parlays/placed-parlay"`.

- [ ] **Step 7: Write `components/parlays/placed-parlay.tsx`**

```tsx
import Link from 'next/link'
import type { LegStatus } from '@/lib/parlays/leg-status'
import type { ParlayView } from '@/lib/parlays/list-parlays'
import { formatOdds } from '@/lib/parlays/odds'
import { cn } from '@/lib/utils'

const STATUS: Record<ParlayView['status'], { label: string; className: string }> = {
  pending: { label: 'Pending', className: 'text-gold' },
  won: { label: 'Won', className: 'text-win' },
  lost: { label: 'Lost', className: 'text-loss' },
  refunded: { label: 'Refunded', className: 'text-ink2' },
}

const LEG_PILL: Record<LegStatus, string> = {
  pending: 'bg-gold-soft text-gold',
  won: 'bg-acc-soft text-acc-text',
  lost: 'bg-loss-soft text-loss',
  voided: 'bg-sunk text-ink2',
}

function terms(p: ParlayView): string {
  const odds = `${formatOdds(p.multiplierBp)}×`
  switch (p.status) {
    case 'pending':
      return ` — ${p.stake} DC at ${odds} — pays ${p.potentialPayout} DC if every pick wins`
    case 'won':
      return ` — ${p.stake} DC at ${odds} — paid ${p.credited} DC`
    case 'lost':
      return ` — ${p.stake} DC at ${odds}`
    case 'refunded':
      return ` — ${p.stake} DC returned`
  }
}

export function PlacedParlay({ parlay }: { parlay: ParlayView }) {
  const status = STATUS[parlay.status]
  return (
    <li className="flex flex-col gap-2 py-4">
      <p>
        <span className={cn('font-extrabold', status.className)}>{status.label}</span>
        {`${terms(parlay)}${parlay.capped ? ' (capped at 20×)' : ''}`}
      </p>
      <ul className="flex flex-col">
        {parlay.legs.map((leg) => (
          <li key={leg.marketId} className="flex items-center justify-between gap-3 py-2 text-[15px]">
            <span className="min-w-0 grow">
              <Link href={`/markets/${leg.marketId}`} className="underline">
                {leg.marketTitle}
              </Link>
              {' — '}
              <strong>{leg.outcomeLabel}</strong>
            </span>
            <span
              className={cn(
                'inline-flex h-6 items-center whitespace-nowrap rounded-full px-[9px] text-xs font-extrabold',
                LEG_PILL[leg.status],
              )}
            >
              {leg.status}
            </span>
          </li>
        ))}
      </ul>
    </li>
  )
}
```

- [ ] **Step 8: Run it and watch it pass**

Run: `npx vitest run tests/components/placed-parlay.test.tsx`
Expected: PASS (6 tests)

- [ ] **Step 9: Write `tests/components/slip-form.test.tsx` (will fail — `SlipForm` still takes the old props)**

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { SlipPick as SlipPickView, SlipView } from '@/lib/parlays/get-slip'
import { combineOdds } from '@/lib/parlays/odds'

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
    expect(screen.getByText('Combined: 16.00×')).toBeInTheDocument()
    expect(screen.queryByText(/Potential payout/)).toBeNull()
    await userEvent.type(screen.getByLabelText('Stake (DC)'), '5')
    expect(screen.getByText(/Potential payout:/)).toHaveTextContent('Potential payout: 80 DC')
    expect(screen.getByRole('button', { name: 'Place parlay' })).toBeEnabled()
  })

  it('notes a capped multiplier and caps the payout', async () => {
    render(<SlipForm slip={slipView([pick(1), pick(2), pick(3)])} />)
    expect(screen.getByText('Combined: 20.00× (capped at 20×)')).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('Stake (DC)'), '5')
    expect(screen.getByText(/Potential payout:/)).toHaveTextContent('Potential payout: 100 DC')
  })

  it('blocks placing while a pick is no longer available, and says why', () => {
    render(<SlipForm slip={slipView([pick(1), pick(2, false)])} />)
    expect(screen.getByText('No longer available')).toBeInTheDocument()
    expect(screen.getByText('Combined: 4.00×')).toBeInTheDocument()
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

- [ ] **Step 10: Run it and watch it fail**

Run: `npx vitest run tests/components/slip-form.test.tsx`
Expected: FAIL. The current `SlipForm` takes `legBps`/`canPlace`/`hasPicks`, so with `slip` it renders no region named "Your slip", and assertions fail or it throws reading `legBps`.

- [ ] **Step 11: Rewrite `app/(app)/parlays/slip-form.tsx`**

```tsx
'use client'

import { useActionState, useState } from 'react'
import Link from 'next/link'
import { Layers } from 'lucide-react'
import { SlipPick } from '@/components/parlays/slip-pick'
import { Button, buttonVariants } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Field, Input } from '@/components/ui/field'
import { Message } from '@/components/ui/message'
import { SectionCard } from '@/components/ui/section-card'
import type { SlipView } from '@/lib/parlays/get-slip'
import { formatOdds, MAX_PICKS, potentialPayout } from '@/lib/parlays/odds'
import { placeParlayAction, type PlaceParlayState } from '@/lib/parlays/place-parlay'
import { removeFromSlipAction } from '@/lib/parlays/slip-actions'

function pickCount(n: number): string {
  if (n === 0) return 'Empty'
  return `${n} ${n === 1 ? 'pick' : 'picks'} · max ${MAX_PICKS}`
}

// Owns the success message as well as the slip card: placing empties the slip and
// revalidates the page, and the message must outlive that re-render.
export function SlipForm({ slip }: { slip: SlipView }) {
  const [state, formAction] = useActionState<PlaceParlayState, FormData>(placeParlayAction, undefined)
  const [stake, setStake] = useState('')
  const stakeNumber = Number(stake)
  const showPayout = Number.isInteger(stakeNumber) && stakeNumber > 0
  const { picks } = slip
  const hasStalePick = picks.some((p) => !p.available)

  return (
    <div className="flex flex-col gap-5 md:gap-7">
      {state?.placed && (
        <Message tone="ok">
          {`Parlay placed at ${formatOdds(state.placed.multiplierBp)}× — potential payout ${state.placed.potentialPayout} DC.`}
        </Message>
      )}
      <SectionCard
        title="Your slip"
        titleId="slip-title"
        action={<span className="text-sm text-ink2">{pickCount(picks.length)}</span>}
        className={picks.length > 0 ? 'gap-0' : undefined}
      >
        {picks.length === 0 ? (
          <EmptyState
            icon={Layers}
            title="Your slip is empty."
            action={
              <Link href="/markets" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
                Browse markets
              </Link>
            }
          >
            Add picks from any open market.
          </EmptyState>
        ) : (
          <>
            <ul className="flex flex-col divide-y divide-line">
              {picks.map((pick) => (
                <li key={pick.outcomeId}>
                  <SlipPick pick={pick} removeAction={removeFromSlipAction.bind(null, pick.outcomeId)} />
                </li>
              ))}
            </ul>
            {picks.length === 1 ? (
              <div className="flex flex-col gap-3 border-t border-line pt-4">
                <p className="text-ink2">Add at least one more pick to place a parlay.</p>
                <Link href="/markets" className={buttonVariants({ variant: 'secondary', block: true })}>
                  Browse markets
                </Link>
              </div>
            ) : (
              <form action={formAction} className="flex flex-col gap-4 border-t border-line pt-4">
                <p className="font-extrabold">
                  {`Combined: ${formatOdds(slip.multiplierBp)}×${slip.capped ? ' (capped at 20×)' : ''}`}
                </p>
                <Field label="Stake (DC)" htmlFor="stake">
                  <Input
                    id="stake"
                    name="stake"
                    type="number"
                    inputMode="numeric"
                    min="1"
                    step="1"
                    required
                    value={stake}
                    onChange={(e) => setStake(e.target.value)}
                    aria-invalid={Boolean(state?.formError)}
                    aria-describedby={state?.formError ? 'slip-error' : undefined}
                  />
                </Field>
                {showPayout && (
                  <p className="text-lg">
                    Potential payout:{' '}
                    <strong className="tabular-nums">{`${potentialPayout(stakeNumber, slip.legBps)} DC`}</strong>
                  </p>
                )}
                <Button
                  type="submit"
                  block
                  disabled={!slip.canPlace}
                  aria-describedby={hasStalePick ? 'slip-blocked' : undefined}
                >
                  Place parlay
                </Button>
                {hasStalePick && (
                  <Message tone="gold" id="slip-blocked">
                    Remove the pick that’s no longer available to place this parlay.
                  </Message>
                )}
                {state?.formError && (
                  <Message tone="error" id="slip-error">
                    {state.formError}
                  </Message>
                )}
              </form>
            )}
          </>
        )}
      </SectionCard>
    </div>
  )
}
```

- [ ] **Step 12: Run it and watch it pass**

Run: `npx vitest run tests/components/slip-form.test.tsx`
Expected: PASS (7 tests)

- [ ] **Step 13: Rewrite `app/(app)/parlays/page.tsx`**

`describeParlay` moves into `PlacedParlay`, and the slip list moves into `SlipForm`. The page now just fetches and lays out the two columns (`.cols-r` from `lg`, stacked below).

```tsx
import { redirect } from 'next/navigation'
import { Layers } from 'lucide-react'
import { PlacedParlay } from '@/components/parlays/placed-parlay'
import { EmptyState } from '@/components/ui/empty-state'
import { Page, PageHeader } from '@/components/ui/page'
import { SectionCard } from '@/components/ui/section-card'
import { requireUser } from '@/lib/auth/require-user'
import { getSlipView } from '@/lib/parlays/get-slip'
import { listMyParlays } from '@/lib/parlays/list-parlays'
import { readSlip } from '@/lib/parlays/slip'
import { SlipForm } from './slip-form'

export default async function ParlaysPage() {
  const { supabase, user } = await requireUser()
  if (!user) redirect('/sign-in')

  const slip = await getSlipView(supabase, await readSlip())
  const parlays = await listMyParlays(supabase, user.id)

  return (
    <Page>
      <PageHeader title="Parlays" />
      <div className="flex flex-col gap-5 md:gap-7 lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start">
        <SlipForm slip={slip} />
        <SectionCard
          title="My parlays"
          titleId="my-parlays-title"
          className={parlays.length > 0 ? 'gap-1' : undefined}
        >
          {parlays.length === 0 ? (
            <EmptyState icon={Layers} title="No parlays yet.">
              Parlays you place show up here.
            </EmptyState>
          ) : (
            <ul className="flex flex-col divide-y divide-line">
              {parlays.map((p) => (
                <PlacedParlay key={p.id} parlay={p} />
              ))}
            </ul>
          )}
        </SectionCard>
      </div>
    </Page>
  )
}
```

- [ ] **Step 14: Verify**

Run: `npm run lint && npx vitest run && npm run build`
Expected: all PASS (the three new files add 16 tests). The build lists `/parlays` as a dynamic (ƒ) route.

Run: `lsof -ti:3000 | xargs -r kill 2>/dev/null; npx playwright test`
Expected: 13 passed. `e2e/parlays.spec.ts` must pass unchanged apart from Task 7's selector. If it fails on `Potential payout: 80 DC` or a status line with a strict-mode "resolved to 2 elements" error, some element other than the one in this task's e2e table also contains the text. Remove the duplicate rather than changing the test.

- [ ] **Step 15: Visual check**

Start `npm run dev` and open `/parlays` in the built-in browser at 375px and 1280px, in light and dark. Compare against the canvas artboards `Parlays--*`, `ParlaysOnePick--*`, `ParlaysPlaced--*` and `ParlaysStale--*`:
- Empty slip: shows the "Your slip is empty." block and "Browse markets".
- One pick (add one from a market page): shows the one-more-pick message.
- Two picks: shows "Combined", the stake field and the button.
- Placing: shows the green message above an empty slip card, and the new parlay at the top of "My parlays".
- A stale pick (add a pick, then have an admin resolve that market): shows the red chip and the gold message, with the button disabled.

Check that:
- the two columns only appear from 1024px up
- the Remove buttons and "Browse markets" are at least 44px tall
- links are underlined

- [ ] **Step 16: Commit**

```bash
git add components/parlays/slip-pick.tsx components/parlays/placed-parlay.tsx "app/(app)/parlays/slip-form.tsx" "app/(app)/parlays/page.tsx" tests/components/slip-pick.test.tsx tests/components/placed-parlay.test.tsx tests/components/slip-form.test.tsx
git commit -m "Restyle the parlays page: slip picks, slip states, and placed parlays"
```

---

## Task 9: Tasks

**Files:**
- Create: `components/tasks/task-row.tsx`
- Create: `lib/tasks/period-label.ts` (the period labels, moved out of the page so Task 12's admin catalog shares them)
- Modify: `app/(app)/tasks/page.tsx`
- Modify: `app/(app)/tasks/submit-button.tsx`
- Modify: `lib/tasks/list-task-completions.ts`
- Test: `tests/components/task-row.test.tsx`

**Interfaces:**
- Consumes:
  - `Page`, `PageHeader` (`components/ui/page.tsx`, Task 1)
  - `SectionCard` (`components/ui/section-card.tsx`, Task 1)
  - `EmptyState` (`components/ui/empty-state.tsx`, Task 1)
  - `Button` (`components/ui/button.tsx`), `Message` (`components/ui/message.tsx`), `StatusChip` (`components/ui/status-chip.tsx`) — all PR A, unchanged
  - `listTasks`, `TaskSummary` (`lib/tasks/list-tasks.ts`, unchanged)
  - `getCurrentPeriodKeys` (`lib/tasks/period-keys.ts`, unchanged)
  - `submitTaskCompletionAction`, `ActionState` (`lib/tasks/submit-task-completion.ts`, unchanged)
- Produces:
  - `listMyTaskCompletions` (`lib/tasks/list-task-completions.ts`) now also returns `reviewNote: string | null` on `MyCompletion`
  - `type TaskRowState = { kind: 'pending' } | { kind: 'approved' } | { kind: 'available'; rejectionNote?: string | null }` and `TaskRow(props)` from `components/tasks/task-row.tsx`, where `props.cadence?: string | null` is the task's period label (e.g. `"Weekly"`) shown as a pill, or `null`/omitted for a one-off task
  - `PERIOD_LABEL: Record<NonNullable<TaskSummary['period']>, string>` from `lib/tasks/period-label.ts` (`Daily`/`Weekly`/`Monthly`/`Yearly`), which Task 12 imports
  - a restyled `TasksPage` and `SubmitButton`

**How it fits together:**
- The mockup's task row joins the title and reward in one `<p class="h3">` element (text node, then a `<span>` for the reward), so `getByText('Read Genesis 1-3 — 10 DC')` on `/tasks` resolves to exactly that `<p>` — no ancestor or descendant also has that exact accumulated text. `TaskRow` reproduces this structure exactly.
- A task's current-period status comes from the **most recent** completion for `(taskId, periodKey)` in `listMyTaskCompletions`'s result, which is already ordered by `submitted_at` descending. Unlike the current code, this task does **not** exclude `status === 'rejected'`: if the member's latest submission for the period was rejected, the row still shows the "I did this" button (nothing else blocks it — the DB's partial unique index only covers `pending`/`approved`), but now carries the admin's `review_note` next to the button, if there is one. This is the "rejection note if the data has one" behaviour from the brief; the mockup itself has no rejected-state artboard, so the exact placement (a muted line under the button) is this task's own call.
- Per this plan's rulings, the mockup's "Repeatable" pill is sample text: the real pill shows the task's cadence, using the same `PERIOD_LABEL` map (`Daily`/`Weekly`/`Monthly`/`Yearly`) the current `/tasks` page already uses. A one-off task shows no pill, as drawn. `TaskRow` takes this as a plain `cadence?: string | null` string rather than a `repeatable: boolean`, so it stays agnostic of the period vocabulary.
- The current page's separate "My submissions" list (every completion ever, across all periods) has no artboard. It is removed: the per-row pending/approved/available+note states already surface the useful part of that information for the current period (see "Rulings this plan makes").
- `TaskRow` takes an `action?: ReactNode` slot instead of importing `SubmitButton` itself, so it stays presentational (no server action import) and its own tests don't need to mock one.

- [ ] **Step 1: Write `tests/components/task-row.test.tsx` (will fail — the module doesn't exist yet)**

```typescript
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TaskRow } from '@/components/tasks/task-row'

describe('TaskRow', () => {
  it('joins the title and reward in one element, and renders the action when available', () => {
    render(
      <ul>
        <TaskRow
          title="Read Genesis 1-3"
          rewardAmount={10}
          description="The creation account and the fall."
          cadence={null}
          state={{ kind: 'available' }}
          action={<button type="button">I did this</button>}
        />
      </ul>,
    )
    // The reward is its own <span>, so the whole string is only the <p>'s combined text (Testing Library's
    // string matchers read an element's own text nodes only; Playwright's getByText reads descendants too).
    expect(
      screen.getAllByText((_, element) => element?.tagName === 'P' && element.textContent === 'Read Genesis 1-3 — 10 DC'),
    ).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'I did this' })).toBeInTheDocument()
  })

  it('shows a pending chip instead of the action', () => {
    render(
      <ul>
        <TaskRow
          title="Memorize Psalm 23"
          rewardAmount={25}
          description={null}
          cadence={null}
          state={{ kind: 'pending' }}
          action={<button type="button">I did this</button>}
        />
      </ul>,
    )
    expect(screen.getByText('Pending review')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'I did this' })).toBeNull()
  })

  it('shows an approved chip', () => {
    render(
      <ul>
        <TaskRow
          title="Read the Sermon on the Mount"
          rewardAmount={15}
          description={null}
          cadence={null}
          state={{ kind: 'approved' }}
        />
      </ul>,
    )
    expect(screen.getByText('Approved')).toBeInTheDocument()
  })

  it('shows the rejection note beside the action when the latest submission was turned down', () => {
    render(
      <ul>
        <TaskRow
          title="Journal on Sunday’s sermon"
          rewardAmount={5}
          description={null}
          cadence="Weekly"
          state={{ kind: 'available', rejectionNote: 'Please write a full paragraph.' }}
          action={<button type="button">I did this</button>}
        />
      </ul>,
    )
    expect(screen.getByRole('button', { name: 'I did this' })).toBeInTheDocument()
    expect(screen.getByText(/Please write a full paragraph\./)).toBeInTheDocument()
  })

  it('shows the cadence as a pill for a repeatable task', () => {
    render(
      <ul>
        <TaskRow
          title="Journal on Sunday’s sermon"
          rewardAmount={5}
          description="A paragraph on what stuck with you."
          cadence="Weekly"
          state={{ kind: 'available' }}
        />
      </ul>,
    )
    expect(screen.getByText('Weekly')).toBeInTheDocument()
  })

  it('shows no pill for a one-off task', () => {
    render(
      <ul>
        <TaskRow title="Read Genesis 1-3" rewardAmount={10} description={null} cadence={null} state={{ kind: 'available' }} />
      </ul>,
    )
    expect(screen.queryByText('Weekly')).toBeNull()
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/components/task-row.test.tsx`
Expected: FAIL with `Failed to resolve import "@/components/tasks/task-row"`

- [ ] **Step 3: Write `components/tasks/task-row.tsx`**

```typescript
import type { ReactNode } from 'react'
import { Check, Clock } from 'lucide-react'
import { StatusChip } from '@/components/ui/status-chip'

const h3Class = 'text-[17px] font-extrabold leading-[1.3] tracking-[-0.01em]'

export type TaskRowState = { kind: 'pending' } | { kind: 'approved' } | { kind: 'available'; rejectionNote?: string | null }

export function TaskRow({
  title,
  rewardAmount,
  description,
  cadence,
  state,
  action,
}: {
  title: string
  rewardAmount: number
  description: string | null
  cadence?: string | null
  state: TaskRowState
  action?: ReactNode
}) {
  return (
    <li className="flex flex-col gap-3 py-[18px] md:flex-row md:items-center md:gap-5 md:py-[22px]">
      <div className="flex grow flex-col gap-1">
        <p className={h3Class}>
          {title} — <span className="text-gold">{rewardAmount} DC</span>
        </p>
        {(description || cadence) && (
          <p className="flex flex-wrap items-center gap-1 text-sm text-ink2">
            {description}
            {cadence && (
              <span className="inline-flex h-6 items-center whitespace-nowrap rounded-full bg-sunk px-[9px] text-xs font-extrabold text-ink2">
                {cadence}
              </span>
            )}
          </p>
        )}
      </div>
      <div className="flex min-h-11 shrink-0 flex-col items-start gap-1.5">
        {state.kind === 'pending' && (
          <StatusChip tone="wait">
            <Clock aria-hidden="true" className="size-4" />
            Pending review
          </StatusChip>
        )}
        {state.kind === 'approved' && (
          <StatusChip tone="open">
            <Check aria-hidden="true" className="size-4" />
            Approved
          </StatusChip>
        )}
        {state.kind === 'available' && (
          <>
            {action}
            {state.rejectionNote && <p className="max-w-[220px] text-sm text-ink2">Not approved — {state.rejectionNote}</p>}
          </>
        )}
      </div>
    </li>
  )
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/components/task-row.test.tsx`
Expected: PASS (6 tests)

- [ ] **Step 5: Add `reviewNote` to `lib/tasks/list-task-completions.ts`**

Change the `MyCompletion` interface and the `listMyTaskCompletions` function to this:

```typescript
export interface MyCompletion {
  taskId: string
  status: 'pending' | 'approved' | 'rejected'
  periodKey: string
  rewardAmount: number
  reviewNote: string | null
}

export async function listMyTaskCompletions(supabase: SupabaseClient, profileId: string): Promise<MyCompletion[]> {
  const { data, error } = await supabase
    .from('task_completions')
    .select('task_id, status, period_key, reward_amount, review_note')
    .eq('profile_id', profileId)
    .order('submitted_at', { ascending: false })

  if (error) throw error

  return (data ?? []).map((c) => ({
    taskId: c.task_id,
    status: c.status,
    periodKey: c.period_key,
    rewardAmount: c.reward_amount,
    reviewNote: c.review_note,
  }))
}
```

Leave `PendingCompletion` and `listPendingTaskCompletions` in the same file untouched.

- [ ] **Step 6: Rewrite `app/(app)/tasks/page.tsx`**

First move the period labels out of the page, into `lib/tasks/period-label.ts`:

```typescript
import type { TaskSummary } from './list-tasks'

export const PERIOD_LABEL: Record<NonNullable<TaskSummary['period']>, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
  yearly: 'Yearly',
}
```

Then rewrite the page:

```typescript
import { redirect } from 'next/navigation'
import { BookOpen } from 'lucide-react'
import { requireUser } from '@/lib/auth/require-user'
import { listTasks } from '@/lib/tasks/list-tasks'
import { listMyTaskCompletions } from '@/lib/tasks/list-task-completions'
import { getCurrentPeriodKeys } from '@/lib/tasks/period-keys'
import { Page, PageHeader } from '@/components/ui/page'
import { SectionCard } from '@/components/ui/section-card'
import { EmptyState } from '@/components/ui/empty-state'
import { TaskRow, type TaskRowState } from '@/components/tasks/task-row'
import { PERIOD_LABEL } from '@/lib/tasks/period-label'
import { SubmitButton } from './submit-button'

export default async function TasksPage() {
  const { supabase, user } = await requireUser()
  if (!user) redirect('/sign-in')

  const allTasks = await listTasks(supabase)
  const activeTasks = allTasks.filter((t) => t.isActive)
  const myCompletions = await listMyTaskCompletions(supabase, user.id)
  const currentPeriodKeys = await getCurrentPeriodKeys(
    supabase,
    activeTasks.map((t) => t.period),
  )

  return (
    <Page>
      <PageHeader title="Tasks" description="Earn DC with Bible study. An admin reviews each one before the coins land." />
      {activeTasks.length === 0 ? (
        <EmptyState icon={BookOpen} title="No tasks yet.">
          Admins add Bible-study tasks here.
        </EmptyState>
      ) : (
        <SectionCard title={<span className="sr-only">Task catalog</span>} titleId="task-catalog" className="gap-0 p-0 md:p-0">
          <ul className="flex flex-col divide-y divide-line px-[18px] md:px-6">
            {activeTasks.map((task) => {
              const periodKey = currentPeriodKeys.get(task.period ?? 'once')!
              const current = myCompletions.find((c) => c.taskId === task.id && c.periodKey === periodKey)
              const state: TaskRowState =
                current?.status === 'pending'
                  ? { kind: 'pending' }
                  : current?.status === 'approved'
                    ? { kind: 'approved' }
                    : { kind: 'available', rejectionNote: current?.status === 'rejected' ? current.reviewNote : null }

              return (
                <TaskRow
                  key={task.id}
                  title={task.title}
                  rewardAmount={task.rewardAmount}
                  description={task.description}
                  cadence={task.isRepeatable ? PERIOD_LABEL[task.period!] : null}
                  state={state}
                  action={<SubmitButton taskId={task.id} />}
                />
              )
            })}
          </ul>
        </SectionCard>
      )}
    </Page>
  )
}
```

- [ ] **Step 7: Rewrite `app/(app)/tasks/submit-button.tsx`**

```typescript
'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { Message } from '@/components/ui/message'
import { submitTaskCompletionAction, type ActionState } from '@/lib/tasks/submit-task-completion'

export function SubmitButton({ taskId }: { taskId: string }) {
  const boundAction = submitTaskCompletionAction.bind(null, taskId)
  const [state, formAction] = useActionState<ActionState, FormData>(boundAction, undefined)

  return (
    <form action={formAction} className="flex flex-col items-start gap-2">
      <Button type="submit" size="sm">
        I did this
      </Button>
      {state?.formError && <Message tone="error">{state.formError}</Message>}
    </form>
  )
}
```

- [ ] **Step 8: Verify**

Run: `npm run lint && npx vitest run && npm run build`
Expected: all PASS.

- [ ] **Step 9: Run the e2e suite**

Run: `lsof -ti:3000 | xargs -r kill 2>/dev/null; npx playwright test`
Expected: 13 passed, including `e2e/coin-economy.spec.ts` ("Read Genesis 1-3 — 10 DC" visible on `/admin/tasks` and `/tasks`, one "Pending review", "I did this" → "Nothing pending." → balance credited) and `e2e/admin-controls.spec.ts` (two "I did this" clicks give `toHaveCount(2)` on "Pending review", bulk-approve works). This task adds no e2e tests.

- [ ] **Step 10: Commit**

```bash
git add components/tasks 'app/(app)/tasks/page.tsx' 'app/(app)/tasks/submit-button.tsx' lib/tasks/list-task-completions.ts lib/tasks/period-label.ts tests/components/task-row.test.tsx
git commit -m "Restyle Tasks to the mockup, with a presentational TaskRow"
```

---

## Task 10: Feed, Leaderboard and Profile

**Files:**
- Create: `components/feed/feed-item.tsx`
- Create: `components/leaderboard/leaderboard-row.tsx`
- Modify: `app/(app)/feed/feed-list.tsx`
- Modify: `app/(app)/feed/page.tsx`
- Modify: `app/(app)/leaderboard/page.tsx`
- Modify: `app/(app)/members/[id]/page.tsx`
- Test: `tests/components/feed-item.test.tsx`
- Test: `tests/components/feed-list.test.tsx`
- Test: `tests/components/leaderboard-row.test.tsx`

**Interfaces:**
- Consumes:
  - `Page`, `PageHeader`, `h1Class` (`components/ui/page.tsx`, Task 1)
  - `SectionCard` (`components/ui/section-card.tsx`, Task 1)
  - `EmptyState` (`components/ui/empty-state.tsx`, Task 1)
  - `BackLink` (`components/ui/back-link.tsx`, Task 1)
  - `Avatar` (`components/ui/avatar.tsx`, Task 1)
  - `describeEvent`, `type FeedEvent`, `type FeedKind`, `type Segment` (`lib/social/describe-event.ts`, unchanged)
  - `listFeed` (`lib/social/list-feed.ts`, unchanged)
  - `getLeaderboard`, `type LeaderboardEntry` (`lib/social/leaderboard.ts`, unchanged)
  - `ageLabel` (`lib/social/relative-time.ts`, unchanged)
- Produces:
  - `FeedItem({ icon, segments, age })` from `components/feed/feed-item.tsx`
  - `FeedList({ events, heading, headingId }: { events: FeedEvent[]; heading: ReactNode; headingId: string })` from `app/(app)/feed/feed-list.tsx` — **signature change**: it now takes `heading`/`headingId` so the same component can supply the Feed page's hidden "Events" label and the Profile page's visible "Recent activity" label, and it now owns the empty/non-empty branch itself
  - `LeaderboardRow({ rank, name, balance, isMe, href })` from `components/leaderboard/leaderboard-row.tsx`
  - restyled `FeedPage`, `LeaderboardPage`, `MemberPage`

**How it fits together:**
- **Event icon mapping** (from the Feed artboard's SVGs, matched against `describe-event.ts`'s `FeedKind`s):

  | `FeedKind` | Mockup SVG shape | lucide icon |
  |---|---|---|
  | `bet_placed` | two concentric circles | `Target` |
  | `parlay_placed` | stacked diamonds | `Layers` (same shape as the nav's Parlays icon) |
  | `market_created` | plus | `Plus` |
  | `market_resolved` | flag | `Flag` |
  | `bet_won` | trophy | `Trophy` |
  | `parlay_won` | trophy (identical path to `bet_won`'s, confirmed in the mockup body) | `Trophy` |
  | `task_completed` | open book (identical path to the Tasks empty-state icon) | `BookOpen` |

  All six verified present under `node_modules/lucide-react/dist/esm/icons/`.
- **`describeEvent`'s sentence stays byte-for-byte the same.** `FeedItem` only wraps its `Segment[]` output in markup (a `<span>` per string segment, a `<Link>` per `{text, href}` segment) — it doesn't touch `describe-event.ts`, so `tests/lib/social/describe-event.test.ts` needs no change. Confirmed: for `bet_placed` with actor "Alice", amount 5, outcome "Yes", market "Social layer market", the concatenated text is exactly `Alice bet 5 DC on Yes in Social layer market`, matching the e2e string.
- **`FeedList`'s empty branch renders `EmptyState` directly, with no `SectionCard` wrapper** — confirmed against Task 1's actual `EmptyState` (a bare `<div>`, no card border/background) and Task 6's `MarketsPage`, which already renders `<EmptyState icon={...} title="No markets yet." action={...}>…</EmptyState>` unwrapped the same way. The `EmptyStates` artboard's "Feed"/"Member activity" blocks are drawn as full cards with an eyebrow label ("Feed", "Member activity") above the icon, but that eyebrow is that reference sheet's own labelling for cataloguing every empty-state variant together on one page — not copy meant to appear on a real screen, and not something `EmptyState`'s props even have room for. So both the real Feed and Profile "nothing yet" states render the same bare `EmptyState`, no heading, matching the established pattern.
- **Leaderboard's `rank-top` styling is keyed off the *computed rank number equalling 1*, not "row index 0".** Confirmed against `rankMembers`: two members tied at rank 1 (e.g. two members both with the top balance) both render the lime rank badge. `Leaderboard--phone-light.html`/`--desktop-light.html` also apply `rank-top` to the viewer's own row at rank 3 (`Aaron`) — I judged that a copy/paste artifact in that specific mock instance, not a rule, since the brief itself states "`.rank-top` for rank 1" and a rank-3 lime badge would contradict the ranking numbers shown right next to it.
- **Leaderboard empty state fires only when there are no *other* members** (`board.length <= 1`), matching "the leaderboard with only the viewer" from the brief. The seeded e2e session always has at least two profiles (`global-setup.ts`'s `seedMembers()` creates both Alice and Bob), so this branch is never hit by the existing suite — it only matters for a brand-new instance.
- **`Segment` link markup gets no extra classes.** The mockup's inline `<a>` tags inside feed sentences carry no special class (`classes.css`'s only rule for them is `.app a{color:...}` — the same base link styling already applied globally in PR A's `app/globals.css`), so `FeedItem`'s `<Link>` needs nothing beyond `href`.

- [ ] **Step 1: Write the three failing test files (will fail — the modules don't exist yet)**

`tests/components/feed-item.test.tsx`:

```typescript
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Target, Trophy } from 'lucide-react'
import { FeedItem } from '@/components/feed/feed-item'

describe('FeedItem', () => {
  it('renders a segment sentence with a linked actor and market, plus the relative age', () => {
    render(
      <ul>
        <FeedItem
          icon={Target}
          segments={[{ text: 'Alice', href: '/members/1' }, ' bet 5 DC on Yes in ', { text: 'Social layer market', href: '/markets/2' }]}
          age="5m ago"
        />
      </ul>,
    )
    const item = screen.getByRole('listitem')
    expect(item).toHaveTextContent('Alice bet 5 DC on Yes in Social layer market')
    expect(screen.getByRole('link', { name: 'Alice' })).toHaveAttribute('href', '/members/1')
    expect(screen.getByRole('link', { name: 'Social layer market' })).toHaveAttribute('href', '/markets/2')
    expect(screen.getByText('5m ago')).toBeInTheDocument()
  })

  it('only links the segments that have an href', () => {
    render(
      <ul>
        <FeedItem icon={Trophy} segments={[{ text: 'Will it rain?', href: '/markets/2' }, ' resolved: Yes']} age="1h ago" />
      </ul>,
    )
    expect(screen.getByRole('listitem')).toHaveTextContent('Will it rain? resolved: Yes')
    expect(screen.queryAllByRole('link')).toHaveLength(1)
  })

  it('hides the icon from assistive tech', () => {
    const { container } = render(
      <ul>
        <FeedItem icon={Target} segments={['x']} age="1h ago" />
      </ul>,
    )
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  })
})
```

`tests/components/leaderboard-row.test.tsx`:

```typescript
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { LeaderboardRow } from '@/components/leaderboard/leaderboard-row'

describe('LeaderboardRow', () => {
  it('links the name to the member profile and shows the balance', () => {
    render(
      <ol>
        <LeaderboardRow rank={2} name="Bob" balance={90} isMe={false} href="/members/bob" />
      </ol>,
    )
    const link = screen.getByRole('link', { name: 'Bob' })
    expect(link).toHaveAttribute('href', '/members/bob')
    expect(screen.getByText('90 DC')).toBeInTheDocument()
  })

  it('gives rank 1 the top style, aria-labelled with the rank', () => {
    render(
      <ol>
        <LeaderboardRow rank={1} name="Sarah" balance={245} isMe={false} href="/members/sarah" />
      </ol>,
    )
    expect(screen.getByLabelText('Rank 1')).toHaveClass('bg-lime', 'text-on-lime')
  })

  it('does not use the top style for lower ranks', () => {
    render(
      <ol>
        <LeaderboardRow rank={3} name="Aaron" balance={120} isMe={false} href="/members/aaron" />
      </ol>,
    )
    expect(screen.getByLabelText('Rank 3')).not.toHaveClass('bg-lime')
  })

  it("marks the viewer's own row with (you), outside the link's accessible name", () => {
    render(
      <ol>
        <LeaderboardRow rank={3} name="Aaron" balance={120} isMe={true} href="/members/aaron" />
      </ol>,
    )
    expect(screen.getByRole('link', { name: 'Aaron' })).toBeInTheDocument()
    expect(screen.getByText('(you)', { exact: false })).toBeInTheDocument()
  })
})
```

`tests/components/feed-list.test.tsx`:

```typescript
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { FeedList } from '@/app/(app)/feed/feed-list'
import type { FeedEvent } from '@/lib/social/describe-event'

const event: FeedEvent = {
  id: '1',
  kind: 'bet_placed',
  occurredAt: '2026-09-25T12:00:00Z',
  actorId: 'a1',
  actorName: 'Alice',
  marketId: 'm1',
  marketTitle: 'Social layer market',
  outcomeLabel: 'Yes',
  amount: 5,
  legCount: null,
  taskTitle: null,
}

describe('FeedList', () => {
  it('shows the empty state and no list when there are no events', () => {
    render(<FeedList events={[]} heading="Events" headingId="events" />)
    expect(screen.getByText('Nothing yet.')).toBeInTheDocument()
    expect(screen.queryByRole('list')).toBeNull()
  })

  it('lists each event under the given heading', () => {
    render(<FeedList events={[event]} heading="Recent activity" headingId="recent-activity" />)
    expect(screen.getByRole('heading', { name: 'Recent activity' })).toBeInTheDocument()
    expect(screen.getByRole('listitem')).toHaveTextContent('Alice bet 5 DC on Yes in Social layer market')
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/components/feed-item.test.tsx tests/components/leaderboard-row.test.tsx tests/components/feed-list.test.tsx`
Expected: FAIL with unresolved imports for `@/components/feed/feed-item`, `@/components/leaderboard/leaderboard-row` and `@/app/(app)/feed/feed-list` (the last one fails differently once Step 5 lands mid-way — run this before touching `feed-list.tsx`).

- [ ] **Step 3: Write `components/feed/feed-item.tsx`**

```typescript
import Link from 'next/link'
import type { LucideIcon } from 'lucide-react'
import type { Segment } from '@/lib/social/describe-event'

export function FeedItem({ icon: Icon, segments, age }: { icon: LucideIcon; segments: Segment[]; age: string }) {
  return (
    <li className="flex items-start gap-3 py-3.5">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-sunk text-ink">
        <Icon aria-hidden="true" className="size-5" />
      </span>
      <p className="grow pt-[5px] text-base">
        {segments.map((segment, i) =>
          typeof segment === 'string' ? (
            <span key={i}>{segment}</span>
          ) : (
            <Link key={i} href={segment.href}>
              {segment.text}
            </Link>
          ),
        )}
      </p>
      <span className="shrink-0 pt-[7px] text-sm whitespace-nowrap text-ink2">{age}</span>
    </li>
  )
}
```

- [ ] **Step 4: Write `components/leaderboard/leaderboard-row.tsx`**

```typescript
import Link from 'next/link'
import { Avatar } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'

export function LeaderboardRow({
  rank,
  name,
  balance,
  isMe,
  href,
}: {
  rank: number
  name: string
  balance: number
  isMe: boolean
  href: string
}) {
  return (
    <li className={cn('flex min-h-[60px] items-center gap-3 rounded-[12px] px-2.5 py-2.5 md:px-3.5', isMe && 'bg-acc-soft')}>
      <span
        aria-label={`Rank ${rank}`}
        className={cn(
          'flex size-10 shrink-0 items-center justify-center rounded-control text-lg font-extrabold tabular-nums',
          rank === 1 ? 'bg-lime text-on-lime' : 'bg-sunk text-ink',
        )}
      >
        {rank}
      </span>
      <Avatar name={name} />
      <span className="grow text-[17px] font-extrabold">
        <Link href={href}>{name}</Link>
        {isMe && <span className="font-semibold text-ink2"> (you)</span>}
      </span>
      <span className="text-[17px] font-extrabold tabular-nums">{balance} DC</span>
    </li>
  )
}
```

- [ ] **Step 5: Rewrite `app/(app)/feed/feed-list.tsx`**

```typescript
import type { ReactNode } from 'react'
import { BookOpen, Flag, Layers, MessageSquareText, Plus, Target, Trophy, type LucideIcon } from 'lucide-react'
import { describeEvent, type FeedEvent, type FeedKind } from '@/lib/social/describe-event'
import { ageLabel } from '@/lib/social/relative-time'
import { SectionCard } from '@/components/ui/section-card'
import { EmptyState } from '@/components/ui/empty-state'
import { FeedItem } from '@/components/feed/feed-item'

const EVENT_ICONS: Record<FeedKind, LucideIcon> = {
  bet_placed: Target,
  parlay_placed: Layers,
  market_created: Plus,
  market_resolved: Flag,
  bet_won: Trophy,
  parlay_won: Trophy,
  task_completed: BookOpen,
}

export function FeedList({ events, heading, headingId }: { events: FeedEvent[]; heading: ReactNode; headingId: string }) {
  if (events.length === 0) return <EmptyState icon={MessageSquareText} title="Nothing yet." />

  return (
    <SectionCard title={heading} titleId={headingId} className="gap-0 py-1 px-0 md:py-1 md:px-0">
      <ul className="flex flex-col divide-y divide-line px-[18px] md:px-6">
        {events.map((e) => (
          <FeedItem key={e.id} icon={EVENT_ICONS[e.kind]} segments={describeEvent(e)} age={ageLabel(e.occurredAt)} />
        ))}
      </ul>
    </SectionCard>
  )
}
```

- [ ] **Step 6: Run the three test files to verify they pass**

Run: `npx vitest run tests/components/feed-item.test.tsx tests/components/leaderboard-row.test.tsx tests/components/feed-list.test.tsx`
Expected: PASS (3 + 4 + 2 = 9 tests)

- [ ] **Step 7: Rewrite `app/(app)/feed/page.tsx`**

```typescript
import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth/require-user'
import { listFeed } from '@/lib/social/list-feed'
import { Page, PageHeader } from '@/components/ui/page'
import { FeedList } from './feed-list'

export default async function FeedPage() {
  const { supabase, user } = await requireUser()
  if (!user) redirect('/sign-in')

  const events = await listFeed(supabase)

  return (
    <Page>
      <PageHeader title="Feed" description="The 50 newest things that happened in DwellDuel." />
      <FeedList events={events} heading={<span className="sr-only">Events</span>} headingId="feed-events" />
    </Page>
  )
}
```

- [ ] **Step 8: Rewrite `app/(app)/leaderboard/page.tsx`**

```typescript
import { redirect } from 'next/navigation'
import { Trophy } from 'lucide-react'
import { requireUser } from '@/lib/auth/require-user'
import { getLeaderboard } from '@/lib/social/leaderboard'
import { Page, PageHeader } from '@/components/ui/page'
import { SectionCard } from '@/components/ui/section-card'
import { EmptyState } from '@/components/ui/empty-state'
import { LeaderboardRow } from '@/components/leaderboard/leaderboard-row'

export default async function LeaderboardPage() {
  const { supabase, user } = await requireUser()
  if (!user) redirect('/sign-in')

  const board = await getLeaderboard(supabase)

  return (
    <Page>
      <PageHeader title="Leaderboard" description="Ranked by balance. Ties share a rank." />
      {board.length <= 1 ? (
        <EmptyState icon={Trophy} title="No other members yet.">
          Invite friends to start the competition.
        </EmptyState>
      ) : (
        <SectionCard title={<span className="sr-only">Rankings</span>} titleId="leaderboard-rankings" className="gap-0 py-1.5 px-2 md:py-1.5 md:px-3">
          <ol className="flex flex-col">
            {board.map((member) => (
              <LeaderboardRow
                key={member.id}
                rank={member.rank}
                name={member.displayName}
                balance={member.balance}
                isMe={member.id === user.id}
                href={`/members/${member.id}`}
              />
            ))}
          </ol>
        </SectionCard>
      )}
    </Page>
  )
}
```

- [ ] **Step 9: Rewrite `app/(app)/members/[id]/page.tsx`**

```typescript
import { redirect, notFound } from 'next/navigation'
import { requireUser } from '@/lib/auth/require-user'
import { getLeaderboard } from '@/lib/social/leaderboard'
import { listFeed } from '@/lib/social/list-feed'
import { Page, h1Class } from '@/components/ui/page'
import { BackLink } from '@/components/ui/back-link'
import { Avatar } from '@/components/ui/avatar'
import { FeedList } from '@/app/(app)/feed/feed-list'

export default async function MemberPage(props: PageProps<'/members/[id]'>) {
  const { id } = await props.params
  const { supabase, user } = await requireUser()
  if (!user) redirect('/sign-in')

  const board = await getLeaderboard(supabase)
  const member = board.find((m) => m.id === id)
  if (!member) notFound()

  const events = await listFeed(supabase, { actorId: member.id })

  return (
    <Page>
      <BackLink href="/leaderboard">Leaderboard</BackLink>
      <section className="flex items-center gap-4 md:gap-5">
        <Avatar name={member.displayName} size="lg" />
        <div className="flex flex-col gap-1">
          <h1 className={h1Class}>{member.displayName}</h1>
          <p className="text-[18px] font-extrabold tabular-nums">
            {member.balance} DC · Rank {member.rank} of {board.length}
          </p>
        </div>
      </section>
      <FeedList events={events} heading="Recent activity" headingId="recent-activity" />
    </Page>
  )
}
```

- [ ] **Step 10: Verify**

Run: `npm run lint && npx vitest run && npm run build`
Expected: all PASS.

- [ ] **Step 11: Run the e2e suite**

Run: `lsof -ti:3000 | xargs -r kill 2>/dev/null; npx playwright test`
Expected: 13 passed, including `e2e/social.spec.ts` (the feed listitem sentence on `/feed`, the "Alice" leaderboard link, the profile heading and its own feed listitem, and the unknown-id 404). This task adds no e2e tests.

- [ ] **Step 12: Commit**

```bash
git add components/feed components/leaderboard 'app/(app)/feed/feed-list.tsx' 'app/(app)/feed/page.tsx' 'app/(app)/leaderboard/page.tsx' 'app/(app)/members/[id]/page.tsx' tests/components/feed-item.test.tsx tests/components/feed-list.test.tsx tests/components/leaderboard-row.test.tsx
git commit -m "Restyle Feed, Leaderboard and Profile to the mockup"
```

---

## Task 11: Admin sections, invites, members and ledger

**Files:**
- Create: `app/(app)/admin/layout.tsx` (the shared "Admin" `<h1>` and the section tabs, gated like the pages)
- Create: `components/admin/admin-nav.tsx`
- Create: `components/admin/invite-list-item.tsx`
- Create: `components/admin/ledger-row.tsx`
- Modify: `app/(app)/admin/invites/page.tsx`
- Modify: `app/(app)/admin/invites/add-invite-form.tsx`
- Modify: `app/(app)/admin/invites/revoke-invite-button.tsx`
- Modify: `app/(app)/admin/members/page.tsx`
- Modify: `app/(app)/admin/members/adjust-balance-form.tsx`
- Modify: `app/(app)/admin/ledger/page.tsx`
- Modify: `app/(app)/admin/tasks/page.tsx` (only drops its own `<h1>`, link row and page wrapper; Task 12 restyles it)
- Modify: `lib/members/adjust-balance.ts` (the approved reason copy, and which field an error belongs to)
- Modify: `lib/ledger/list-transactions.ts` (adds `profileId`, so a ledger row can link to the member)
- Test:
  - `tests/components/admin-nav.test.tsx`
  - `tests/components/admin-invites.test.tsx`
  - `tests/components/admin-members.test.tsx`
  - `tests/components/admin-ledger.test.tsx`
  - `tests/db/list-transactions.test.ts`

**Interfaces:**
- Consumes:
  - `Page`, `PageHeader` (`components/ui/page.tsx`), `SectionCard` (`components/ui/section-card.tsx`), `EmptyState` (`components/ui/empty-state.tsx`) and `Avatar` (`components/ui/avatar.tsx`), all from Task 1
  - PR A's `Button`, `Field`, `Input`, `cardClass` and `Message`
  - `requireUser()` and `isAdmin(supabase)`. Both are wrapped in React `cache`, so the layout and the page share one lookup per request.
  - `listInvites`/`InviteRow` (`lib/invites/list-invites.ts`), `addInviteAction` and `revokeInviteAction` (`lib/invites/actions.ts`), `listMembers`/`MemberSummary` (`lib/members/list-members.ts`), `ageLabel(occurredAt)` (`lib/social/relative-time.ts`)
- Produces:
  - `AdminNav()` in `components/admin/admin-nav.tsx`: a client `nav` named "Admin sections", with Invites / Tasks / Members / Ledger links. The link whose `href` equals `usePathname()` gets `aria-current="page"`.
  - `app/(app)/admin/layout.tsx`: it redirects exactly as the pages do (no user → `/sign-in`, non-admin → `/`). Then it renders `<Page>` with `PageHeader title="Admin"`, `AdminNav` and `{children}`. Admin pages return only their sections.
  - `InviteListItem({ invite, revoke }: { invite: InviteRow; revoke: ReactNode })` in `components/admin/invite-list-item.tsx`. It renders `revoke` (the page passes `<RevokeInviteButton email=… />`) only for an unclaimed invite.
  - `LedgerRow({ entry }: { entry: LedgerEntry })` in `components/admin/ledger-row.tsx`
  - All three are presentational: they import no server actions. `RevokeInviteButton` imports `revokeInviteAction`, so it stays beside its route.
  - `AdjustBalanceForm({ member }: { member: MemberSummary })`. Before, it took `{ profileId }`.
  - `lib/members/adjust-balance.ts`: `ActionState = { formError?: string; field?: 'amount' | 'reason' } | undefined`
  - `lib/ledger/list-transactions.ts`: `LedgerEntry` gains `profileId: string`

**Why a layout.** All four artboards share the "Admin" `<h1>` and the `.subnav`. A layout renders them once, and the tabs stay mounted as you move between sections.

- **The gate.** A layout doesn't stop its pages from rendering: Next renders the page segment regardless. So a layout that only rendered the header could put it in front of a non-admin while the page's `redirect('/')` was still on its way. This layout runs the same two checks and the same redirects as the pages, so a non-admin is redirected before any admin markup renders.
- **The pages keep their own checks.** Layouts don't re-render when you move between their pages (`node_modules/next/dist/docs/01-app/02-guides/authentication.md`, "Layouts and auth checks"). The redirect behaviour is unchanged: 307 to `/sign-in` or `/`, whichever runs first.
- **Cost.** Both checks are `cache`d, so they add no queries.

The admin pages' own section-link rows go away. `app/(app)/admin/tasks/page.tsx` also loses its `<h1>Tasks</h1>`, so no admin page has two `<h1>`s before Task 12 restyles it.

**E2E constraints this task keeps** (`e2e/foundation.spec.ts`):
- The add form keeps the placeholder `friend@gmail.com` and the button `Add`.
- `getByText(email)` must match exactly one element. So Revoke's accessible name "Revoke {email}" comes from `aria-label`, not from the artboard's visually hidden text suffix. A second copy of the email in the DOM would make that locator ambiguous.

**Error copy.** The artboard shows "Add a reason — it’s shown in the ledger next to this adjustment." under the member row, tied to the Reason input.
- It replaces the action's old "Enter a reason."
- The Reason input drops `required`, so an empty reason reaches the server and gets the approved copy instead of the browser's bubble.
- The action now also says which field an error belongs to. That way the form marks only that input `aria-invalid`.

- [ ] **Step 1: Write the failing component tests**

Create `tests/components/admin-nav.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'

let pathname = '/admin/invites'
vi.mock('next/navigation', () => ({ usePathname: () => pathname }))

import { AdminNav } from '@/components/admin/admin-nav'

const SECTIONS = [
  ['Invites', '/admin/invites'],
  ['Tasks', '/admin/tasks'],
  ['Members', '/admin/members'],
  ['Ledger', '/admin/ledger'],
]

describe('AdminNav', () => {
  it('links every admin section, in order', () => {
    render(<AdminNav />)
    const nav = screen.getByRole('navigation', { name: 'Admin sections' })
    const links = within(nav).getAllByRole('link')
    expect(links.map((link) => [link.textContent, link.getAttribute('href')])).toEqual(SECTIONS)
  })

  it.each(SECTIONS)('marks only %s as the current page at %s', (label, href) => {
    pathname = href
    render(<AdminNav />)
    for (const link of screen.getAllByRole('link')) {
      if (link.textContent === label) expect(link).toHaveAttribute('aria-current', 'page')
      else expect(link).not.toHaveAttribute('aria-current')
    }
  })
})
```

Create `tests/components/admin-invites.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { InviteRow } from '@/lib/invites/list-invites'

const { addInviteAction } = vi.hoisted(() => ({ addInviteAction: vi.fn() }))
vi.mock('@/lib/invites/actions', () => ({ addInviteAction, revokeInviteAction: vi.fn() }))

import { InviteListItem } from '@/components/admin/invite-list-item'
import { AddInviteForm } from '@/app/(app)/admin/invites/add-invite-form'
import { RevokeInviteButton } from '@/app/(app)/admin/invites/revoke-invite-button'

function renderItem(invite: InviteRow) {
  render(
    <ul>
      <InviteListItem invite={invite} revoke={<RevokeInviteButton email={invite.email} />} />
    </ul>,
  )
}

describe('InviteListItem', () => {
  it('marks a claimed invite and offers no revoke', () => {
    renderItem({ email: 'sarah@example.com', claimed: true, createdAt: '2026-09-01T00:00:00Z' })
    expect(screen.getByRole('listitem')).toHaveTextContent('sarah@example.com (claimed)')
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('offers a revoke named for the email, without repeating the email as text', () => {
    renderItem({ email: 'newfriend@example.com', claimed: false, createdAt: '2026-09-01T00:00:00Z' })
    expect(screen.getByRole('button', { name: 'Revoke newfriend@example.com' })).toHaveAttribute('type', 'submit')
    expect(screen.getAllByText('newfriend@example.com')).toHaveLength(1)
    expect(screen.queryByText('(claimed)')).toBeNull()
    expect(document.querySelector('input[type="hidden"][name="email"]')).toHaveValue('newfriend@example.com')
  })
})

describe('AddInviteForm', () => {
  it('keeps the placeholder the e2e suite fills, and describes the input with its hint', () => {
    render(<AddInviteForm />)
    const input = screen.getByLabelText('Email')
    expect(input).toHaveAttribute('placeholder', 'friend@gmail.com')
    expect(input).toHaveAccessibleDescription('They can sign in with this Google account right away.')
    expect(screen.getByRole('button', { name: 'Add' })).toHaveAttribute('type', 'submit')
  })

  it('ties a server error to the email input', async () => {
    addInviteAction.mockResolvedValue({ formError: 'That email is already invited.' })
    render(<AddInviteForm />)
    await userEvent.type(screen.getByLabelText('Email'), 'sarah@example.com')
    await userEvent.click(screen.getByRole('button', { name: 'Add' }))

    const error = await screen.findByRole('alert')
    expect(error).toHaveTextContent('That email is already invited.')
    const input = screen.getByLabelText('Email')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveAccessibleDescription(
      'They can sign in with this Google account right away. That email is already invited.',
    )
  })
})
```

Create `tests/components/admin-members.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const { adjustBalanceAction } = vi.hoisted(() => ({ adjustBalanceAction: vi.fn() }))
vi.mock('@/lib/members/adjust-balance', () => ({ adjustBalanceAction }))

import { AdjustBalanceForm } from '@/app/(app)/admin/members/adjust-balance-form'

const BEN = { id: 'p-ben', displayName: 'Ben', email: 'ben@example.com', balance: 60, isAdmin: false }

beforeEach(() => {
  adjustBalanceAction.mockReset()
})

async function submit(amount: string, reason: string) {
  await userEvent.type(screen.getByLabelText('Amount'), amount)
  if (reason) await userEvent.type(screen.getByLabelText('Reason'), reason)
  await userEvent.click(screen.getByRole('button', { name: 'Adjust Ben' }))
}

describe('AdjustBalanceForm', () => {
  it('links the member to their profile and shows their balance', () => {
    render(<AdjustBalanceForm member={BEN} />)
    expect(screen.getByRole('link', { name: 'Ben' })).toHaveAttribute('href', '/members/p-ben')
    expect(screen.getByText('60 DC')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Adjust Ben' })).toHaveAttribute('type', 'submit')
  })

  it('sends the amount and reason for this member', async () => {
    adjustBalanceAction.mockResolvedValue(undefined)
    render(<AdjustBalanceForm member={BEN} />)
    await submit('25', 'Choir volunteer bonus')

    await waitFor(() => expect(adjustBalanceAction).toHaveBeenCalledOnce())
    const [profileId, , formData] = adjustBalanceAction.mock.calls[0]
    expect(profileId).toBe('p-ben')
    expect(formData.get('amount')).toBe('25')
    expect(formData.get('reason')).toBe('Choir volunteer bonus')
  })

  it('ties a missing-reason error to the reason input only', async () => {
    adjustBalanceAction.mockResolvedValue({
      formError: 'Add a reason — it’s shown in the ledger next to this adjustment.',
      field: 'reason',
    })
    render(<AdjustBalanceForm member={BEN} />)
    await submit('-50', '')

    const error = await screen.findByRole('alert')
    expect(error).toHaveTextContent('Add a reason — it’s shown in the ledger next to this adjustment.')
    expect(error).toHaveAttribute('id', 'adjust-p-ben-error')
    expect(screen.getByLabelText('Reason')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByLabelText('Reason')).toHaveAttribute('aria-describedby', 'adjust-p-ben-error')
    expect(screen.getByLabelText('Amount')).toHaveAttribute('aria-invalid', 'false')
    expect(screen.getByLabelText('Amount')).not.toHaveAttribute('aria-describedby')
  })

  it('ties an amount error to the amount input only', async () => {
    adjustBalanceAction.mockResolvedValue({ formError: 'Enter a non-zero whole number of DC.', field: 'amount' })
    render(<AdjustBalanceForm member={BEN} />)
    await submit('0', 'Oops')

    await screen.findByRole('alert')
    expect(screen.getByLabelText('Amount')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByLabelText('Amount')).toHaveAttribute('aria-describedby', 'adjust-p-ben-error')
    expect(screen.getByLabelText('Reason')).toHaveAttribute('aria-invalid', 'false')
  })
})
```

Create `tests/components/admin-ledger.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { LedgerEntry } from '@/lib/ledger/list-transactions'
import { LedgerRow } from '@/components/admin/ledger-row'

function renderRow(overrides: Partial<LedgerEntry>) {
  const entry: LedgerEntry = {
    id: 1,
    profileId: 'p-mia',
    memberName: 'Mia',
    amount: 10,
    type: 'Task reward',
    reason: null,
    createdAt: new Date(Date.now() - 5 * 60_000).toISOString(),
    ...overrides,
  }
  render(
    <ul>
      <LedgerRow entry={entry} />
    </ul>,
  )
}

describe('LedgerRow', () => {
  it('shows a credit as a plus amount, linked to the member, with its age', () => {
    renderRow({})
    expect(screen.getByText('+10 DC')).toHaveClass('text-win')
    expect(screen.getByRole('listitem')).toHaveTextContent('Mia: +10 DC — Task reward')
    expect(screen.getByRole('link', { name: 'Mia' })).toHaveAttribute('href', '/members/p-mia')
    expect(screen.getByText('5m ago')).toBeInTheDocument()
  })

  it('shows a debit as a minus amount, with the adjustment reason', () => {
    renderRow({ amount: -15, type: 'Admin adjustment', reason: 'Task was claimed twice' })
    expect(screen.getByText('−15 DC')).toHaveClass('text-loss')
    expect(screen.getByRole('listitem')).toHaveTextContent('Mia: −15 DC — Admin adjustment — “Task was claimed twice”')
  })
})
```

- [ ] **Step 2: Write the failing DB test for the ledger's member id**

Create `tests/db/list-transactions.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { listAllTransactions } from '@/lib/ledger/list-transactions'
import { serviceClient } from './helpers'
import { seedMembers, clientFor, ensureInvited, type Member } from './fixtures'

let admin: Member
let bob: Member

beforeEach(async () => {
  ;[admin, bob] = await seedMembers()
  await serviceClient().from('profiles').update({ is_admin: true }).eq('id', admin.id)
})

describe('listAllTransactions', () => {
  it("carries each entry's member id alongside their name", async () => {
    const adminClient = await clientFor(admin)
    await ensureInvited(adminClient)

    const entries = await listAllTransactions(adminClient)

    expect(entries).toContainEqual(
      expect.objectContaining({ profileId: bob.id, memberName: 'Bob', amount: 100, type: 'Starting grant' }),
    )
  })
})
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run tests/components/admin-nav.test.tsx tests/components/admin-invites.test.tsx tests/components/admin-members.test.tsx tests/components/admin-ledger.test.tsx tests/db/list-transactions.test.ts`

Expected: FAIL.
- `admin-nav`, `admin-invites` and `admin-ledger` fail to import. `admin-nav.tsx`, `invite-list-item.tsx` and `ledger-row.tsx` don't exist yet.
- `admin-members` fails with "Unable to find an accessible element with the role "link" and name "Ben"". The current form takes `profileId` and renders no member.
- `list-transactions` fails because `profileId` is missing from the entries.

- [ ] **Step 4: Write `components/admin/admin-nav.tsx`**

The mockup's `.subnav`: a sunk track with 44px tabs, where the current tab is raised on the surface. The tabs fill the track on phones and hug their labels from `md` up, like `.desk .subnav`.
- **Phone padding.** Phone tabs use `px-2`, not the mockup's 16px. Four bold labels with 16px padding come to about 350px, and a 375px screen has 343px inside the page gutter.
- **The shadow.** Its colour is the literal the stylesheet uses for `.subtab[aria-current]` (`rgba(3,39,45,.12)`). There's no token for it.

```tsx
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

const SECTIONS = [
  { href: '/admin/invites', label: 'Invites' },
  { href: '/admin/tasks', label: 'Tasks' },
  { href: '/admin/members', label: 'Members' },
  { href: '/admin/ledger', label: 'Ledger' },
]

export function AdminNav() {
  const pathname = usePathname()

  return (
    <nav aria-label="Admin sections" className="flex gap-1 rounded-[14px] bg-sunk p-1 md:self-start">
      {SECTIONS.map(({ href, label }) => {
        const current = pathname === href
        return (
          <Link
            key={href}
            href={href}
            aria-current={current ? 'page' : undefined}
            className={cn(
              'inline-flex min-h-11 grow items-center justify-center rounded-[10px] px-2 text-[15px] font-bold no-underline md:grow-0 md:px-4',
              current ? 'bg-surface text-ink shadow-[0_1px_3px_rgba(3,39,45,0.12)]' : 'text-ink2 hover:text-ink',
            )}
          >
            {label}
          </Link>
        )
      })}
    </nav>
  )
}
```

- [ ] **Step 5: Write `app/(app)/admin/layout.tsx`**

```tsx
import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth/require-user'
import { isAdmin } from '@/lib/auth/is-admin'
import { Page, PageHeader } from '@/components/ui/page'
import { AdminNav } from '@/components/admin/admin-nav'

export default async function AdminLayout({ children }: { children: ReactNode }) {
  // The same gate as every admin page, so a non-admin never gets the Admin header. The pages keep
  // their own checks, because a layout doesn't re-render when you move between its pages.
  const { supabase, user } = await requireUser()
  if (!user) redirect('/sign-in')
  if (!(await isAdmin(supabase))) redirect('/')

  return (
    <Page>
      <div className="flex flex-col gap-4">
        <PageHeader title="Admin" />
        <AdminNav />
      </div>
      {children}
    </Page>
  )
}
```

- [ ] **Step 6: Restyle the invites screen**

Replace `app/(app)/admin/invites/page.tsx`. At `lg` it's the desktop artboard's `.cols-r` grid: the form card beside the list card.

```tsx
import { redirect } from 'next/navigation'
import { Mail } from 'lucide-react'
import { requireUser } from '@/lib/auth/require-user'
import { isAdmin } from '@/lib/auth/is-admin'
import { listInvites } from '@/lib/invites/list-invites'
import { SectionCard } from '@/components/ui/section-card'
import { EmptyState } from '@/components/ui/empty-state'
import { InviteListItem } from '@/components/admin/invite-list-item'
import { AddInviteForm } from './add-invite-form'
import { RevokeInviteButton } from './revoke-invite-button'

export default async function AdminInvitesPage() {
  const { supabase, user } = await requireUser()
  if (!user) redirect('/sign-in')
  if (!(await isAdmin(supabase))) redirect('/')

  const invites = await listInvites(supabase)

  return (
    <div className="flex flex-col gap-5 lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start lg:gap-7">
      <SectionCard title="Invite someone" titleId="invite-someone">
        <AddInviteForm />
      </SectionCard>
      <SectionCard title="Invites" titleId="invites" className="gap-1">
        {invites.length === 0 ? (
          <EmptyState icon={Mail} title="No invites yet.">
            Add an email above to invite someone.
          </EmptyState>
        ) : (
          <ul className="flex flex-col divide-y divide-line">
            {invites.map((invite) => (
              <InviteListItem key={invite.email} invite={invite} revoke={<RevokeInviteButton email={invite.email} />} />
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  )
}
```

Create `components/admin/invite-list-item.tsx`. It takes the revoke control as a `revoke` slot, not by importing `RevokeInviteButton`, so a component under `components/` never imports from a route.


```tsx
import type { ReactNode } from 'react'
import type { InviteRow } from '@/lib/invites/list-invites'

export function InviteListItem({ invite, revoke }: { invite: InviteRow; revoke: ReactNode }) {
  return (
    <li className="flex min-h-16 items-center justify-between gap-3 py-2.5">
      <span className="wrap-anywhere">
        {invite.email}
        {invite.claimed && (
          <>
            {' '}
            <span className="text-ink2">(claimed)</span>
          </>
        )}
      </span>
      {!invite.claimed && revoke}
    </li>
  )
}
```

Replace `app/(app)/admin/invites/add-invite-form.tsx`.
- The artboard puts the hint under the input-and-button row, where `Field` would put it above the control. So the label and hint are written out here, using `Field`'s classes.
- The input is described by its hint always, and by the error too when there is one.

```tsx
'use client'

import { useActionState } from 'react'
import { addInviteAction } from '@/lib/invites/actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/field'
import { Message } from '@/components/ui/message'

export function AddInviteForm() {
  const [state, formAction] = useActionState(addInviteAction, undefined)

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
        <Button type="submit" className="shrink-0">
          Add
        </Button>
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

Replace `app/(app)/admin/invites/revoke-invite-button.tsx`:

```tsx
'use client'

import { useActionState } from 'react'
import { revokeInviteAction } from '@/lib/invites/actions'
import { Button } from '@/components/ui/button'
import { Message } from '@/components/ui/message'

export function RevokeInviteButton({ email }: { email: string }) {
  const [state, formAction] = useActionState(revokeInviteAction, undefined)

  return (
    <form action={formAction} className="flex shrink-0 flex-col items-end gap-2">
      <input type="hidden" name="email" value={email} />
      {/* An aria-label rather than a visually hidden suffix: the e2e suite finds the invite by its email, which must appear as text only once. */}
      <Button type="submit" variant="danger" size="sm" aria-label={`Revoke ${email}`}>
        Revoke
      </Button>
      {state?.formError && <Message tone="error">{state.formError}</Message>}
    </form>
  )
}
```

- [ ] **Step 7: Restyle the members screen**

Replace `lib/members/adjust-balance.ts`. Only the `ActionState` type and the two validation returns change. The RPC error keeps its message and names no field, because it isn't about one input.

```typescript
'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth/require-user'

export type ActionState = { formError?: string; field?: 'amount' | 'reason' } | undefined

export async function adjustBalanceAction(profileId: string, _prevState: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase, user } = await requireUser()
  if (!user) return { formError: 'Not signed in.' }

  const amount = Number(formData.get('amount'))
  const reason = String(formData.get('reason') ?? '').trim()

  if (!Number.isInteger(amount) || amount === 0) return { formError: 'Enter a non-zero whole number of DC.', field: 'amount' }
  if (!reason) return { formError: 'Add a reason — it’s shown in the ledger next to this adjustment.', field: 'reason' }

  const { error } = await supabase.rpc('adjust_balance', {
    p_profile_id: profileId,
    p_amount: amount,
    p_reason: reason,
  })
  if (error) return { formError: error.message }

  // Refreshes the shared layout too, so the nav's balance and slip count stay current.
  revalidatePath('/', 'layout')
  return undefined
}
```

Replace `app/(app)/admin/members/page.tsx`. It's one card with a visually hidden `<h2>`, as drawn.

```tsx
import { redirect } from 'next/navigation'
import { Users } from 'lucide-react'
import { requireUser } from '@/lib/auth/require-user'
import { isAdmin } from '@/lib/auth/is-admin'
import { listMembers } from '@/lib/members/list-members'
import { cardClass } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { cn } from '@/lib/utils'
import { AdjustBalanceForm } from './adjust-balance-form'

export default async function AdminMembersPage() {
  const { supabase, user } = await requireUser()
  if (!user) redirect('/sign-in')
  if (!(await isAdmin(supabase))) redirect('/')

  const members = await listMembers(supabase)

  return (
    <section aria-labelledby="members-title" className={cn(cardClass, 'px-[18px] py-1 md:px-6')}>
      <h2 id="members-title" className="sr-only">
        Members
      </h2>
      {members.length === 0 ? (
        <div className="py-[18px] md:py-6">
          <EmptyState icon={Users} title="No members yet." />
        </div>
      ) : (
        <ul className="flex flex-col divide-y divide-line">
          {members.map((m) => (
            <li key={m.id} className="flex flex-col gap-3 py-4">
              <AdjustBalanceForm member={m} />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
```

Replace `app/(app)/admin/members/adjust-balance-form.tsx`.
- **Phone:** the member on top, then Amount and Reason side by side, then a full-width Adjust.
- **`md` and up:** one row, with a 240px member column, a 150px Amount, Reason filling the rest, and Adjust at the end.
- **Adjust's name.** Its visually hidden suffix names the member ("Adjust Ben"), so the page's many Adjust buttons are told apart.
- **The space goes outside that span** (`Adjust{' '}<span …>`). Testing Library's name calculation drops a space inside it and would compute "AdjustBen".
- The amount stays `type="number" step="1"`, which allows the minus sign. Only Amount keeps `required`.

```tsx
'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { adjustBalanceAction, type ActionState } from '@/lib/members/adjust-balance'
import type { MemberSummary } from '@/lib/members/list-members'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/field'
import { Message } from '@/components/ui/message'

export function AdjustBalanceForm({ member }: { member: MemberSummary }) {
  const boundAction = adjustBalanceAction.bind(null, member.id)
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
        <Button type="submit" block className="md:w-auto">
          Adjust{' '}
          <span className="sr-only">{member.displayName}</span>
        </Button>
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

- [ ] **Step 8: Restyle the ledger screen**

Replace `lib/ledger/list-transactions.ts`. It selects `profile_id` and maps it to `profileId`, and nothing else changes.

```typescript
import type { SupabaseClient } from '@supabase/supabase-js'

export interface LedgerEntry {
  id: number
  profileId: string
  memberName: string
  amount: number
  type: string
  reason: string | null
  createdAt: string
}

const TYPE_LABELS: Record<string, string> = {
  bet_placed: 'Bet placed',
  bet_won: 'Bet won',
  bet_refunded: 'Bet refunded',
  bet_voided_refund: 'Market voided',
  resolution_reversed: 'Resolution reversed',
  task_completed: 'Task reward',
  admin_adjustment: 'Admin adjustment',
  starting_grant: 'Starting grant',
  parlay_placed: 'Parlay placed',
  parlay_won: 'Parlay won',
  parlay_refunded: 'Parlay refunded',
  parlay_reversed: 'Parlay reversed',
}

export async function listAllTransactions(supabase: SupabaseClient): Promise<LedgerEntry[]> {
  const { data, error } = await supabase
    .from('coin_transactions')
    .select('id, profile_id, amount, type, meta, created_at, profiles(display_name)')
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })

  if (error) throw error

  return (data ?? []).map((t) => {
    const profile = t.profiles as unknown as { display_name: string } | null
    const meta = t.meta as { reason?: string }
    return {
      id: t.id,
      profileId: t.profile_id,
      memberName: profile?.display_name ?? 'Unknown member',
      amount: t.amount,
      type: TYPE_LABELS[t.type] ?? t.type,
      reason: t.type === 'admin_adjustment' ? (meta.reason ?? null) : null,
      createdAt: t.created_at,
    }
  })
}
```

Create `components/admin/ledger-row.tsx`. It follows the artboard's `.plus`/`.minus` amounts:
- a credit is `+10 DC` in `text-win`
- a debit is `−15 DC` in `text-loss`, with a real minus sign (U+2212), as drawn
- an admin adjustment's reason follows in curly quotes

The descriptions are the ledger's existing type labels. The age is the feed's `ageLabel`.

```tsx
import Link from 'next/link'
import type { LedgerEntry } from '@/lib/ledger/list-transactions'
import { ageLabel } from '@/lib/social/relative-time'
import { cn } from '@/lib/utils'

export function LedgerRow({ entry }: { entry: LedgerEntry }) {
  const credit = entry.amount >= 0

  return (
    <li className="flex items-start gap-3 py-3.5">
      <p className="min-w-0 grow">
        <Link href={`/members/${entry.profileId}`}>{entry.memberName}</Link>:{' '}
        <span className={cn('font-extrabold tabular-nums', credit ? 'text-win' : 'text-loss')}>
          {credit ? '+' : '−'}
          {Math.abs(entry.amount)} DC
        </span>{' '}
        — {entry.type}
        {entry.reason && ` — “${entry.reason}”`}
      </p>
      <span className="whitespace-nowrap pt-0.5 text-sm text-ink2">{ageLabel(entry.createdAt)}</span>
    </li>
  )
}
```

Replace `app/(app)/admin/ledger/page.tsx`:

```tsx
import { redirect } from 'next/navigation'
import { NotebookText } from 'lucide-react'
import { requireUser } from '@/lib/auth/require-user'
import { isAdmin } from '@/lib/auth/is-admin'
import { listAllTransactions } from '@/lib/ledger/list-transactions'
import { cardClass } from '@/components/ui/card'
import { LedgerRow } from '@/components/admin/ledger-row'
import { EmptyState } from '@/components/ui/empty-state'
import { cn } from '@/lib/utils'

export default async function AdminLedgerPage() {
  const { supabase, user } = await requireUser()
  if (!user) redirect('/sign-in')
  if (!(await isAdmin(supabase))) redirect('/')

  const entries = await listAllTransactions(supabase)

  return (
    <section aria-labelledby="ledger-title" className={cn(cardClass, 'px-[18px] py-1 md:px-6')}>
      <h2 id="ledger-title" className="sr-only">
        Every coin movement
      </h2>
      {entries.length === 0 ? (
        <div className="py-[18px] md:py-6">
          <EmptyState icon={NotebookText} title="No coin movements yet." />
        </div>
      ) : (
        <ul className="flex flex-col divide-y divide-line">
          {entries.map((e) => (
            <LedgerRow key={e.id} entry={e} />
          ))}
        </ul>
      )}
    </section>
  )
}
```

- [ ] **Step 9: Drop the tasks page's own heading and links**

Replace `app/(app)/admin/tasks/page.tsx` with the version below. The layout now supplies the `<h1>` and the section tabs, so this removes the page's `<h1>Tasks</h1>`, its Invites/Members/Ledger link row, its `mx-auto max-w-2xl p-8` wrapper, the first `<h2>`'s `mt-6`, and the unused `Link` import. Everything else stays as it is until Task 12.

```tsx
import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth/require-user'
import { isAdmin } from '@/lib/auth/is-admin'
import { listTasks } from '@/lib/tasks/list-tasks'
import { listPendingTaskCompletions } from '@/lib/tasks/list-task-completions'
import { CreateTaskForm } from './create-task-form'
import { EditTaskForm } from './edit-task-form'
import { PendingApprovals } from './pending-approvals'

export default async function AdminTasksPage() {
  const { supabase, user } = await requireUser()
  if (!user) redirect('/sign-in')
  if (!(await isAdmin(supabase))) redirect('/')

  const tasks = await listTasks(supabase)
  const pending = await listPendingTaskCompletions(supabase)

  return (
    <div>
      <h2 className="text-lg font-semibold">Pending approvals</h2>
      <PendingApprovals pending={pending} />

      <h2 className="mt-8 text-lg font-semibold">Catalog</h2>
      <CreateTaskForm />
      <ul className="mt-4 space-y-3">
        {tasks.map((task) => (
          <li key={task.id} className="border p-3">
            <p className="font-medium">
              {task.title} — {task.rewardAmount} DC {!task.isActive && '(inactive)'}
            </p>
            <EditTaskForm task={task} />
          </li>
        ))}
      </ul>
    </div>
  )
}
```

- [ ] **Step 10: Run the tests to verify they pass**

Run: `npx vitest run tests/components/admin-nav.test.tsx tests/components/admin-invites.test.tsx tests/components/admin-members.test.tsx tests/components/admin-ledger.test.tsx tests/db/list-transactions.test.ts`
Expected: PASS (16 tests: 5 + 4 + 4 + 2 + 1)

- [ ] **Step 11: Verify**

Run: `npm run lint && npx vitest run && npm run build`
Expected: all PASS

Run: `lsof -ti:3000 | xargs -r kill 2>/dev/null; npx playwright test`
Expected: all PASS, 13 tests (PR A's 12 plus Task 3's 404 check). The admin specs still find:
- on `/admin/invites`: the `friend@gmail.com` placeholder, `Add`, the only `Revoke`, and the invited email as one element
- on `/admin/tasks`: unchanged markup under the new header

- [ ] **Step 12: Commit**

```bash
git add 'app/(app)/admin' components/admin lib/members/adjust-balance.ts lib/ledger/list-transactions.ts tests/components/admin-nav.test.tsx tests/components/admin-invites.test.tsx tests/components/admin-members.test.tsx tests/components/admin-ledger.test.tsx tests/db/list-transactions.test.ts
git commit -m "Restyle admin invites, members and ledger under a shared Admin header and section tabs"
```

---

## Task 12: Admin tasks

**Files:**
- Create: `app/(app)/admin/tasks/task-catalog-item.tsx`
- Modify: `app/(app)/admin/tasks/page.tsx`
- Modify: `app/(app)/admin/tasks/pending-approvals.tsx`
- Modify: `app/(app)/admin/tasks/review-buttons.tsx`
- Modify: `app/(app)/admin/tasks/create-task-form.tsx`
- Modify: `app/(app)/admin/tasks/edit-task-form.tsx`
- Modify: `lib/tasks/list-task-completions.ts` (the pending reader adds the submitter's id and the reward)
- Modify: `lib/tasks/create-task.ts` and `lib/tasks/update-task.ts` (each validation error names its field)
- Test:
  - `tests/components/admin-tasks.test.tsx`
  - `tests/db/list-pending-task-completions.test.ts`

**Interfaces:**
- Consumes:
  - Task 11's `app/(app)/admin/layout.tsx`. It supplies the `<Page>`, the "Admin" `<h1>` and the section tabs, so this page returns only its sections.
  - `SectionCard` and `EmptyState` (Task 1)
  - PR A's `Button`, `Field`, `Input`, `Textarea`, `Select` and `Message`
  - `ageLabel(occurredAt)` (`lib/social/relative-time.ts`)
  - `PERIOD_LABEL` (`lib/tasks/period-label.ts`, Task 9)
  - the unchanged server actions `approveTaskCompletionAction`, `rejectTaskCompletionAction`, `bulkApproveTaskCompletionsAction` and `bulkRejectTaskCompletionsAction` (`lib/tasks/review-task-completion.ts`), `createTaskAction` and `updateTaskAction`
- Produces:
  - `PendingCompletion` gains `submitterId: string` and `rewardAmount: number`
  - `PendingApprovals({ pending }: { pending: PendingRow[] })`, with `export type PendingRow = PendingCompletion & { submittedAge: string }`
  - `TaskCatalogItem({ task }: { task: TaskSummary })`: a catalog `<li>` with a cadence pill, Edit (a disclosure) and Deactivate/Reactivate
  - `EditTaskForm({ id, task, onDone }: { id: string; task: TaskSummary; onDone: () => void })`. Before, it took `{ task }`.
  - `create-task.ts`: `ActionState = { formError?: string; field?: 'title' | 'reward_amount' | 'period' } | undefined`
  - `update-task.ts`: `ActionState = { formError?: string; field?: 'title' | 'reward_amount' } | undefined`

**Where the pieces live.** Every component here imports a server action: `PendingApprovals`, `ReviewButtons`, `CreateTaskForm`, `EditTaskForm`, and `TaskCatalogItem`, which imports `updateTaskAction` for its toggle. So they all stay beside the route in `app/(app)/admin/tasks/`, and their tests import from the route path.

**E2E constraints this task keeps** (`e2e/coin-economy.spec.ts` and `e2e/admin-controls.spec.ts`):
- **Labels.** `getByLabel('Title')` and `getByLabel('Reward (DC)')` each resolve to exactly one element.
  - Playwright's `getByLabel` also matches any element named by `aria-labelledby` or `aria-label`. So no section title and no `aria-label` on this page may contain "title" or "reward (dc)". "Pending approvals", "Create task" and "Task catalog" are safe.
  - The edit form (which also says "Title") only renders while an admin has opened it.
- **Catalog text.** `Read Genesis 1-3 — 10 DC` stays one element: the catalog row's `<p>`.
  - A pending row shows "Alice — **Read Genesis 1-3** (10 DC)", which doesn't contain that string.
  - The Edit and Deactivate buttons' visually hidden suffix is the title alone.
- **`getByRole('button', { name: 'Approve' }).first()`** substring-matches "Approve selected" too. So the rows, with their Approve buttons, come before the bulk toolbar in the DOM. The artboard draws the toolbar above the rows. It moves below them, in the same sunk box, and focus order still follows reading order.
- **Checkboxes.** `input[name="completionIds"]` stays a native checkbox outside the bulk `<form id="bulk-review-form">`, joined to it by `form="bulk-review-form"`, exactly as before. Each row's own Approve/Reject forms can't nest inside it.
- **Messages.** "Approve selected", "2 approved." (the bulk summary, now a `Message tone="ok"`) and "Nothing pending." (the empty state's title) keep their text. Each is one element.

- [ ] **Step 1: Write the failing component tests**

Create `tests/components/admin-tasks.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { TaskSummary } from '@/lib/tasks/list-tasks'

const { bulkApproveTaskCompletionsAction, createTaskAction, updateTaskAction } = vi.hoisted(() => ({
  bulkApproveTaskCompletionsAction: vi.fn(),
  createTaskAction: vi.fn(),
  updateTaskAction: vi.fn(),
}))
vi.mock('@/lib/tasks/review-task-completion', () => ({
  approveTaskCompletionAction: vi.fn(),
  rejectTaskCompletionAction: vi.fn(),
  bulkApproveTaskCompletionsAction,
  bulkRejectTaskCompletionsAction: vi.fn(),
}))
vi.mock('@/lib/tasks/create-task', () => ({ createTaskAction }))
vi.mock('@/lib/tasks/update-task', () => ({ updateTaskAction }))

import { PendingApprovals, type PendingRow } from '@/app/(app)/admin/tasks/pending-approvals'
import { CreateTaskForm } from '@/app/(app)/admin/tasks/create-task-form'
import { TaskCatalogItem } from '@/app/(app)/admin/tasks/task-catalog-item'

const PENDING: PendingRow[] = [
  {
    id: 'c1',
    taskTitle: 'Read Genesis 1-3',
    submitterId: 'p-alice',
    submitterName: 'Alice',
    rewardAmount: 10,
    submittedAt: '2026-09-25T09:00:00Z',
    submittedAge: '1h ago',
  },
  {
    id: 'c2',
    taskTitle: 'Memorize Psalm 23',
    submitterId: 'p-ben',
    submitterName: 'Ben',
    rewardAmount: 25,
    submittedAt: '2026-09-24T10:00:00Z',
    submittedAge: '1d ago',
  },
]

const GENESIS: TaskSummary = {
  id: 't1',
  title: 'Read Genesis 1-3',
  description: null,
  rewardAmount: 10,
  isRepeatable: false,
  period: null,
  isActive: true,
}

function rowCheckboxes() {
  return [...document.querySelectorAll<HTMLInputElement>('input[name="completionIds"]')]
}

beforeEach(() => {
  bulkApproveTaskCompletionsAction.mockReset()
  createTaskAction.mockReset()
  updateTaskAction.mockReset()
})

describe('PendingApprovals', () => {
  it('ties every row checkbox to the bulk form through its form attribute', () => {
    render(<PendingApprovals pending={PENDING} />)
    const bulkForm = screen.getByRole('button', { name: 'Approve selected' }).closest('form')!
    const boxes = rowCheckboxes()
    expect(boxes.map((box) => box.value)).toEqual(['c1', 'c2'])
    for (const box of boxes) {
      expect(box).toHaveAttribute('form', bulkForm.id)
      expect(box.form).toBe(bulkForm)
      expect(bulkForm).not.toContainElement(box)
    }
  })

  it('names each checkbox for its submitter and shows what they did', () => {
    render(<PendingApprovals pending={PENDING} />)
    expect(screen.getByRole('checkbox', { name: 'Select Alice’s submission' })).toHaveAttribute('value', 'c1')
    expect(screen.getByRole('link', { name: 'Alice' })).toHaveAttribute('href', '/members/p-alice')
    expect(screen.getByText('Submitted 1h ago')).toBeInTheDocument()
    expect(screen.getByText('(10 DC)')).toBeInTheDocument()
    expect(screen.queryByText('Read Genesis 1-3 — 10 DC')).toBeNull()
  })

  it('puts the row buttons before the bulk ones, so the first "Approve" approves a row', () => {
    render(<PendingApprovals pending={PENDING} />)
    const approves = screen.getAllByRole('button', { name: /Approve/ })
    expect(approves.map((button) => button.textContent)).toEqual(['Approve', 'Approve', 'Approve selected'])
  })

  it('checks every row with Select all', async () => {
    render(<PendingApprovals pending={PENDING} />)
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select all' }))
    for (const box of rowCheckboxes()) expect(box).toBeChecked()
  })

  it('sends only the checked ids with Approve selected, then shows the summary', async () => {
    bulkApproveTaskCompletionsAction.mockResolvedValue({ summary: '1 approved.' })
    render(<PendingApprovals pending={PENDING} />)
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select Ben’s submission' }))
    await userEvent.click(screen.getByRole('button', { name: 'Approve selected' }))

    expect(await screen.findByRole('status')).toHaveTextContent('1 approved.')
    const [, formData] = bulkApproveTaskCompletionsAction.mock.calls[0]
    expect(formData.getAll('completionIds')).toEqual(['c2'])
  })

  it('shows the empty state, and no bulk controls, when nothing is pending', () => {
    render(<PendingApprovals pending={[]} />)
    expect(screen.getByText('Nothing pending.')).toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Approve selected' })).toBeNull()
  })
})

describe('CreateTaskForm', () => {
  it('labels the fields the e2e suite fills', () => {
    render(<CreateTaskForm />)
    expect(screen.getByLabelText('Title')).toHaveAttribute('name', 'title')
    expect(screen.getByLabelText('Reward (DC)')).toHaveAttribute('name', 'reward_amount')
    expect(screen.getByRole('button', { name: 'Create task' })).toHaveAttribute('type', 'submit')
  })

  it('asks for a cadence only for a repeatable task', async () => {
    render(<CreateTaskForm />)
    expect(screen.queryByLabelText('Cadence')).toBeNull()
    await userEvent.click(screen.getByRole('checkbox', { name: 'Repeatable' }))
    expect(screen.getByRole('combobox', { name: 'Cadence' })).toHaveAttribute('name', 'period')
  })

  it('ties a reward error to the reward input only', async () => {
    createTaskAction.mockResolvedValue({ formError: 'Enter a whole number of DC greater than 0.', field: 'reward_amount' })
    render(<CreateTaskForm />)
    await userEvent.type(screen.getByLabelText('Title'), 'Read Ruth')
    await userEvent.type(screen.getByLabelText('Reward (DC)'), '5')
    await userEvent.click(screen.getByRole('button', { name: 'Create task' }))

    expect(await screen.findByRole('alert')).toHaveAttribute('id', 'create-task-error')
    expect(screen.getByLabelText('Reward (DC)')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByLabelText('Reward (DC)')).toHaveAttribute('aria-describedby', 'create-task-error')
    expect(screen.getByLabelText('Title')).toHaveAttribute('aria-invalid', 'false')
  })
})

describe('TaskCatalogItem', () => {
  function renderItem(task: TaskSummary) {
    render(
      <ul>
        <TaskCatalogItem task={task} />
      </ul>,
    )
  }

  it('shows the title and reward as one piece of text', () => {
    renderItem(GENESIS)
    expect(screen.getAllByText('Read Genesis 1-3 — 10 DC')).toHaveLength(1)
    expect(screen.queryByText('Inactive')).toBeNull()
    expect(screen.queryByText('Weekly')).toBeNull()
  })

  it('deactivates an active task by resending its fields without is_active', async () => {
    updateTaskAction.mockResolvedValue(undefined)
    renderItem(GENESIS)
    await userEvent.click(screen.getByRole('button', { name: 'Deactivate Read Genesis 1-3' }))

    await waitFor(() => expect(updateTaskAction).toHaveBeenCalledOnce())
    const [taskId, , formData] = updateTaskAction.mock.calls[0]
    expect(taskId).toBe('t1')
    expect(formData.get('title')).toBe('Read Genesis 1-3')
    expect(formData.get('reward_amount')).toBe('10')
    expect(formData.has('is_active')).toBe(false)
  })

  it('shows an inactive weekly task as Inactive and Weekly, and reactivates it', async () => {
    updateTaskAction.mockResolvedValue(undefined)
    renderItem({ ...GENESIS, isActive: false, isRepeatable: true, period: 'weekly' })
    expect(screen.getByText('Inactive')).toBeInTheDocument()
    expect(screen.getByText('Weekly')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Reactivate Read Genesis 1-3' }))

    await waitFor(() => expect(updateTaskAction).toHaveBeenCalledOnce())
    expect(updateTaskAction.mock.calls[0][2].get('is_active')).toBe('on')
  })

  it('opens the edit form and closes it on Cancel', async () => {
    renderItem(GENESIS)
    const edit = screen.getByRole('button', { name: 'Edit Read Genesis 1-3' })
    expect(edit).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByLabelText('Title')).toBeNull()

    await userEvent.click(edit)
    expect(edit).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByLabelText('Title')).toHaveValue('Read Genesis 1-3')

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByLabelText('Title')).toBeNull()
  })

  it('saves an edit, keeping the task active, and closes the form', async () => {
    updateTaskAction.mockResolvedValue(undefined)
    renderItem(GENESIS)
    await userEvent.click(screen.getByRole('button', { name: 'Edit Read Genesis 1-3' }))
    await userEvent.clear(screen.getByLabelText('Title'))
    await userEvent.type(screen.getByLabelText('Title'), 'Read Genesis 1-4')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(screen.queryByLabelText('Title')).toBeNull())
    const [taskId, , formData] = updateTaskAction.mock.calls[0]
    expect(taskId).toBe('t1')
    expect(formData.get('title')).toBe('Read Genesis 1-4')
    expect(formData.get('is_active')).toBe('on')
  })

  it('keeps the edit form open and ties a title error to the title input', async () => {
    updateTaskAction.mockResolvedValue({ formError: 'Enter a title.', field: 'title' })
    renderItem(GENESIS)
    await userEvent.click(screen.getByRole('button', { name: 'Edit Read Genesis 1-3' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Enter a title.')
    expect(screen.getByLabelText('Title')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByLabelText('Title')).toHaveAttribute('aria-describedby', 'edit-task-t1-error')
  })
})
```

- [ ] **Step 2: Write the failing DB test for the pending reader**

Create `tests/db/list-pending-task-completions.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { listPendingTaskCompletions } from '@/lib/tasks/list-task-completions'
import { serviceClient } from './helpers'
import { seedMembers, clientFor, ensureInvited, createTestTask, type Member } from './fixtures'

let admin: Member
let alice: Member

beforeEach(async () => {
  ;[alice, admin] = await seedMembers()
  await serviceClient().from('profiles').update({ is_admin: true }).eq('id', admin.id)
})

describe('listPendingTaskCompletions', () => {
  it("carries the submitter's id and the reward", async () => {
    const { taskId } = await createTestTask(admin, { title: 'Read Ruth', rewardAmount: 20 })
    const aliceClient = await clientFor(alice)
    await ensureInvited(aliceClient)
    const { error } = await aliceClient.rpc('submit_task_completion', { p_task_id: taskId })
    expect(error).toBeNull()

    const adminClient = await clientFor(admin)
    await ensureInvited(adminClient)
    const pending = await listPendingTaskCompletions(adminClient)

    expect(pending).toEqual([
      expect.objectContaining({ taskTitle: 'Read Ruth', submitterId: alice.id, submitterName: 'Alice', rewardAmount: 20 }),
    ])
  })
})
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run tests/components/admin-tasks.test.tsx tests/db/list-pending-task-completions.test.ts`
Expected: FAIL.
- `admin-tasks` fails to import `task-catalog-item.tsx`, which doesn't exist yet.
- `list-pending-task-completions` fails because `submitterId` and `rewardAmount` are missing.

- [ ] **Step 4: Extend the pending reader and name each validation error's field**

Replace `lib/tasks/list-task-completions.ts`. `listMyTaskCompletions` stays exactly as Task 9 left it (with `reviewNote`, which `/tasks` reads). The pending select adds `profile_id` and `reward_amount`. `reward_amount` is the reward snapshotted when the member submitted, which is what approval pays.

```typescript
import type { SupabaseClient } from '@supabase/supabase-js'

export interface MyCompletion {
  taskId: string
  status: 'pending' | 'approved' | 'rejected'
  periodKey: string
  rewardAmount: number
  reviewNote: string | null
}

export async function listMyTaskCompletions(supabase: SupabaseClient, profileId: string): Promise<MyCompletion[]> {
  const { data, error } = await supabase
    .from('task_completions')
    .select('task_id, status, period_key, reward_amount, review_note')
    .eq('profile_id', profileId)
    .order('submitted_at', { ascending: false })

  if (error) throw error

  return (data ?? []).map((c) => ({
    taskId: c.task_id,
    status: c.status,
    periodKey: c.period_key,
    rewardAmount: c.reward_amount,
    reviewNote: c.review_note,
  }))
}

export interface PendingCompletion {
  id: string
  taskTitle: string
  submitterId: string
  submitterName: string
  rewardAmount: number
  submittedAt: string
}

export async function listPendingTaskCompletions(supabase: SupabaseClient): Promise<PendingCompletion[]> {
  const { data, error } = await supabase
    .from('task_completions')
    .select('id, profile_id, reward_amount, submitted_at, tasks(title), profiles!task_completions_profile_id_fkey(display_name)')
    .eq('status', 'pending')
    .order('submitted_at', { ascending: true })

  if (error) throw error

  return (data ?? []).map((c) => {
    const task = c.tasks as unknown as { title: string } | null
    const profile = c.profiles as unknown as { display_name: string } | null
    return {
      id: c.id,
      taskTitle: task?.title ?? 'Unknown task',
      submitterId: c.profile_id,
      submitterName: profile?.display_name ?? 'Unknown member',
      rewardAmount: c.reward_amount,
      submittedAt: c.submitted_at,
    }
  })
}
```

Replace `lib/tasks/create-task.ts`. Only the type and the three validation returns change.

```typescript
'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth/require-user'

export type ActionState = { formError?: string; field?: 'title' | 'reward_amount' | 'period' } | undefined

const PERIODS = ['daily', 'weekly', 'monthly', 'yearly'] as const

export async function createTaskAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase, user } = await requireUser()
  if (!user) return { formError: 'Not signed in.' }

  const title = String(formData.get('title') ?? '').trim()
  const description = String(formData.get('description') ?? '').trim()
  const rewardAmount = Number(formData.get('reward_amount'))
  const isRepeatable = formData.get('is_repeatable') === 'on'
  const period = String(formData.get('period') ?? '')

  if (!title) return { formError: 'Enter a title.', field: 'title' }
  if (!Number.isInteger(rewardAmount) || rewardAmount <= 0) {
    return { formError: 'Enter a whole number of DC greater than 0.', field: 'reward_amount' }
  }
  if (isRepeatable && !PERIODS.includes(period as (typeof PERIODS)[number])) {
    return { formError: 'Choose a cadence for a repeatable task.', field: 'period' }
  }

  const { error } = await supabase.from('tasks').insert({
    title,
    description: description || null,
    reward_amount: rewardAmount,
    is_repeatable: isRepeatable,
    period: isRepeatable ? period : null,
  })

  if (error) return { formError: error.message }

  revalidatePath('/admin/tasks')
  return undefined
}
```

Replace `lib/tasks/update-task.ts`. Only the type and the two validation returns change.

```typescript
'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth/require-user'

export type ActionState = { formError?: string; field?: 'title' | 'reward_amount' } | undefined

export async function updateTaskAction(taskId: string, _prevState: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase, user } = await requireUser()
  if (!user) return { formError: 'Not signed in.' }

  const title = String(formData.get('title') ?? '').trim()
  const description = String(formData.get('description') ?? '').trim()
  const rewardAmount = Number(formData.get('reward_amount'))
  const isActive = formData.get('is_active') === 'on'

  if (!title) return { formError: 'Enter a title.', field: 'title' }
  if (!Number.isInteger(rewardAmount) || rewardAmount <= 0) {
    return { formError: 'Enter a whole number of DC greater than 0.', field: 'reward_amount' }
  }

  const { error } = await supabase
    .from('tasks')
    .update({ title, description: description || null, reward_amount: rewardAmount, is_active: isActive })
    .eq('id', taskId)

  if (error) return { formError: error.message }

  revalidatePath('/admin/tasks')
  return undefined
}
```

- [ ] **Step 5: Restyle the pending approvals**

Replace `app/(app)/admin/tasks/pending-approvals.tsx`.
- **Checkboxes** follow the mockup's `.checkbox`: native, 22px, `accent-primary`, in a label at least 44×44px. A row's checkbox is named "Select {name}’s submission".
- **Messages** sit above the list, where the artboard draws "2 approved.".
- **Ages** arrive as `submittedAge`. The page works them out on the server, so the client-rendered text can't differ at hydration.

```tsx
'use client'

import Link from 'next/link'
import { useActionState, useRef } from 'react'
import { Check } from 'lucide-react'
import {
  bulkApproveTaskCompletionsAction,
  bulkRejectTaskCompletionsAction,
  type BulkActionState,
} from '@/lib/tasks/review-task-completion'
import type { PendingCompletion } from '@/lib/tasks/list-task-completions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/field'
import { Message } from '@/components/ui/message'
import { EmptyState } from '@/components/ui/empty-state'
import { ReviewButtons } from './review-buttons'

const BULK_FORM_ID = 'bulk-review-form'

export type PendingRow = PendingCompletion & { submittedAge: string }

export function PendingApprovals({ pending }: { pending: PendingRow[] }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [approveState, approveAction] = useActionState<BulkActionState | undefined, FormData>(bulkApproveTaskCompletionsAction, undefined)
  const [rejectState, rejectAction] = useActionState<BulkActionState | undefined, FormData>(bulkRejectTaskCompletionsAction, undefined)

  function toggleAll(checked: boolean) {
    containerRef.current?.querySelectorAll<HTMLInputElement>('input[name="completionIds"]').forEach((el) => {
      el.checked = checked
    })
  }

  return (
    <div ref={containerRef} className="flex flex-col gap-4">
      {approveState?.formError && <Message tone="error">{approveState.formError}</Message>}
      {approveState?.summary && <Message tone="ok">{approveState.summary}</Message>}
      {rejectState?.formError && <Message tone="error">{rejectState.formError}</Message>}
      {rejectState?.summary && <Message tone="ok">{rejectState.summary}</Message>}

      {pending.length === 0 ? (
        <EmptyState icon={Check} title="Nothing pending." />
      ) : (
        <>
          <ul className="flex flex-col divide-y divide-line">
            {pending.map((c) => (
              <li key={c.id} className="flex flex-col gap-3 py-4">
                <div className="flex items-start gap-2">
                  <label className="inline-flex min-h-11 min-w-11 shrink-0 cursor-pointer items-center">
                    {/* Outside the bulk form (row forms can't nest inside it), so the form attribute joins it. */}
                    <input
                      type="checkbox"
                      name="completionIds"
                      value={c.id}
                      form={BULK_FORM_ID}
                      className="m-0 size-[22px] accent-primary"
                    />
                    <span className="sr-only">Select {c.submitterName}’s submission</span>
                  </label>
                  <div className="flex min-w-0 grow flex-col pt-[9px]">
                    <p>
                      <Link href={`/members/${c.submitterId}`}>{c.submitterName}</Link> — <strong>{c.taskTitle}</strong>{' '}
                      <span className="font-extrabold text-gold">({c.rewardAmount} DC)</span>
                    </p>
                    <p className="text-sm text-ink2">Submitted {c.submittedAge}</p>
                  </div>
                </div>
                <ReviewButtons completionId={c.id} />
              </li>
            ))}
          </ul>

          {/* After the rows, not above them as drawn: the e2e suite clicks the first button named "Approve", which must be a row's. */}
          <div className="flex flex-col gap-3 rounded-[14px] bg-sunk p-3.5">
            <label className="inline-flex min-h-11 cursor-pointer items-center gap-2.5 self-start font-bold">
              <input type="checkbox" onChange={(e) => toggleAll(e.target.checked)} className="m-0 size-[22px] accent-primary" />
              Select all
            </label>
            <form id={BULK_FORM_ID} className="flex flex-col gap-2 md:flex-row md:items-center">
              <label htmlFor="bulk-reason" className="sr-only">
                Shared reason (optional)
              </label>
              <Input id="bulk-reason" name="reason" placeholder="Shared reason (optional)" className="md:grow" />
              <div className="flex shrink-0 gap-2">
                <Button type="submit" size="sm" formAction={approveAction} className="grow">
                  Approve selected
                </Button>
                <Button type="submit" size="sm" variant="secondary" formAction={rejectAction} className="grow">
                  Reject selected
                </Button>
              </div>
            </form>
          </div>
        </>
      )}
    </div>
  )
}
```

Replace `app/(app)/admin/tasks/review-buttons.tsx`.
- **Phone:** Approve, the reason input and Reject stack full width.
- **`md` and up:** they sit in one row, indented 52px (the checkbox's 44px plus the 8px gap) to line up under the row's text.
- **The reject reason** is the reject form's only input, so it's the one a reject error describes.

```tsx
'use client'

import { useActionState } from 'react'
import { approveTaskCompletionAction, rejectTaskCompletionAction, type ActionState } from '@/lib/tasks/review-task-completion'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/field'
import { Message } from '@/components/ui/message'

export function ReviewButtons({ completionId }: { completionId: string }) {
  const boundApprove = approveTaskCompletionAction.bind(null, completionId)
  const boundReject = rejectTaskCompletionAction.bind(null, completionId)
  const [approveState, approveAction] = useActionState<ActionState, FormData>(boundApprove, undefined)
  const [rejectState, rejectAction] = useActionState<ActionState, FormData>(boundReject, undefined)
  const reasonId = `reject-reason-${completionId}`
  const rejectErrorId = `reject-${completionId}-error`

  return (
    <div className="flex flex-col gap-2 md:pl-[52px]">
      <div className="flex flex-col gap-2 md:flex-row md:items-center">
        <form action={approveAction} className="flex">
          <Button type="submit" size="sm" className="grow">
            Approve
          </Button>
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
          <Button type="submit" size="sm" variant="secondary">
            Reject
          </Button>
        </form>
      </div>
      {approveState?.formError && <Message tone="error">{approveState.formError}</Message>}
      {rejectState?.formError && (
        <Message tone="error" id={rejectErrorId}>
          {rejectState.formError}
        </Message>
      )}
    </div>
  )
}
```

- [ ] **Step 6: Restyle the create form**

Replace `app/(app)/admin/tasks/create-task-form.tsx`. The field names (`title`, `description`, `reward_amount`, `is_repeatable`, `period`) and the Repeatable → Cadence reveal are unchanged. The button is full width on phones and hugs its label from `md` up, as drawn.

```tsx
'use client'

import { useActionState, useState } from 'react'
import { createTaskAction, type ActionState } from '@/lib/tasks/create-task'
import { Button } from '@/components/ui/button'
import { Field, Input, Select, Textarea } from '@/components/ui/field'
import { Message } from '@/components/ui/message'

export function CreateTaskForm() {
  const [isRepeatable, setIsRepeatable] = useState(false)
  const [state, formAction] = useActionState<ActionState, FormData>(createTaskAction, undefined)

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Field label="Title" htmlFor="create-task-title">
        <Input
          id="create-task-title"
          name="title"
          required
          aria-invalid={state?.field === 'title'}
          aria-describedby={state?.field === 'title' ? 'create-task-error' : undefined}
        />
      </Field>
      <Field label="Description" htmlFor="create-task-description">
        <Textarea id="create-task-description" name="description" />
      </Field>
      <Field label="Reward (DC)" htmlFor="create-task-reward">
        <Input
          id="create-task-reward"
          name="reward_amount"
          type="number"
          min="1"
          step="1"
          required
          aria-invalid={state?.field === 'reward_amount'}
          aria-describedby={state?.field === 'reward_amount' ? 'create-task-error' : undefined}
        />
      </Field>
      <label className="inline-flex min-h-11 cursor-pointer items-center gap-2.5 self-start font-bold">
        <input
          name="is_repeatable"
          type="checkbox"
          checked={isRepeatable}
          onChange={(e) => setIsRepeatable(e.target.checked)}
          className="m-0 size-[22px] accent-primary"
        />
        Repeatable
      </label>
      {isRepeatable && (
        <Field label="Cadence" htmlFor="create-task-period">
          <Select
            id="create-task-period"
            name="period"
            required
            aria-invalid={state?.field === 'period'}
            aria-describedby={state?.field === 'period' ? 'create-task-error' : undefined}
          >
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
            <option value="yearly">Yearly</option>
          </Select>
        </Field>
      )}
      {state?.formError && (
        <Message tone="error" id="create-task-error">
          {state.formError}
        </Message>
      )}
      <Button type="submit" block className="md:w-auto md:self-start">
        Create task
      </Button>
    </form>
  )
}
```

- [ ] **Step 7: Restyle the catalog**

The artboard's catalog row shows the title and reward in bold, a void pill ("Repeatable" in the mockup) or an `Inactive` (gold) pill, and two buttons: `Edit` and `Deactivate` (or `Reactivate` when inactive), each with the title as a visually hidden suffix.
- **The cadence pill.** A repeatable task's void pill shows its cadence ("Daily", "Weekly", "Monthly" or "Yearly"), not the mockup's sample word "Repeatable". These are the same labels the `/tasks` page shows. A one-off task gets no pill, as drawn.
- **Deactivate/Reactivate** is a small form that sends the task's current title, description and reward back through the same `updateTaskAction`. It adds `is_active=on` only when reactivating. That action always saves every field.
- **Edit** opens the edit form below the row.
- **The edit form's Active checkbox is gone.** Deactivate/Reactivate replaces it, and the edit form sends the current active state as a hidden field, so saving an edit never changes it.
- **Saving closes the form.** The form wraps the action to call `onDone` on success.

Create `app/(app)/admin/tasks/task-catalog-item.tsx`:

```tsx
'use client'

import { useActionState, useState } from 'react'
import { updateTaskAction, type ActionState } from '@/lib/tasks/update-task'
import type { TaskSummary } from '@/lib/tasks/list-tasks'
import { PERIOD_LABEL } from '@/lib/tasks/period-label'
import { Button } from '@/components/ui/button'
import { Message } from '@/components/ui/message'
import { cn } from '@/lib/utils'
import { EditTaskForm } from './edit-task-form'

const pillClass = 'inline-flex h-6 items-center whitespace-nowrap rounded-full px-[9px] text-xs font-extrabold'

export function TaskCatalogItem({ task }: { task: TaskSummary }) {
  const [editing, setEditing] = useState(false)
  const boundUpdate = updateTaskAction.bind(null, task.id)
  const [toggleState, toggleAction] = useActionState<ActionState, FormData>(boundUpdate, undefined)
  const editFormId = `edit-task-${task.id}`

  return (
    <li className="flex flex-col gap-2 py-3.5">
      <div className="flex items-center justify-between gap-3">
        <p className={cn('font-extrabold', !task.isActive && 'text-ink2')}>
          {task.title} — {task.rewardAmount} DC
        </p>
        <span className="flex shrink-0 gap-1.5">
          {task.isRepeatable && task.period && <span className={cn(pillClass, 'bg-sunk text-ink2')}>{PERIOD_LABEL[task.period]}</span>}
          {!task.isActive && <span className={cn(pillClass, 'bg-gold-soft text-gold')}>Inactive</span>}
        </span>
      </div>
      <div className="flex gap-2">
        <Button
          variant="secondary"
          size="sm"
          aria-expanded={editing}
          aria-controls={editing ? editFormId : undefined}
          onClick={() => setEditing(!editing)}
        >
          Edit{' '}
          <span className="sr-only">{task.title}</span>
        </Button>
        {/* updateTaskAction saves every field, so the toggle resends the current ones unchanged. */}
        <form action={toggleAction}>
          <input type="hidden" name="title" value={task.title} />
          <input type="hidden" name="description" value={task.description ?? ''} />
          <input type="hidden" name="reward_amount" value={task.rewardAmount} />
          {!task.isActive && <input type="hidden" name="is_active" value="on" />}
          <Button type="submit" variant={task.isActive ? 'quiet' : 'secondary'} size="sm">
            {task.isActive ? 'Deactivate' : 'Reactivate'}{' '}
            <span className="sr-only">{task.title}</span>
          </Button>
        </form>
      </div>
      {toggleState?.formError && <Message tone="error">{toggleState.formError}</Message>}
      {editing && <EditTaskForm id={editFormId} task={task} onDone={() => setEditing(false)} />}
    </li>
  )
}
```

Replace `app/(app)/admin/tasks/edit-task-form.tsx`:

```tsx
'use client'

import { useActionState } from 'react'
import { updateTaskAction, type ActionState } from '@/lib/tasks/update-task'
import type { TaskSummary } from '@/lib/tasks/list-tasks'
import { Button } from '@/components/ui/button'
import { Field, Input, Textarea } from '@/components/ui/field'
import { Message } from '@/components/ui/message'

export function EditTaskForm({ id, task, onDone }: { id: string; task: TaskSummary; onDone: () => void }) {
  const [state, formAction] = useActionState<ActionState, FormData>(async (prevState, formData) => {
    const result = await updateTaskAction(task.id, prevState, formData)
    if (!result?.formError) onDone()
    return result
  }, undefined)
  const errorId = `${id}-error`

  return (
    <form id={id} action={formAction} className="flex flex-col gap-4 rounded-[14px] bg-sunk p-3.5">
      <Field label="Title" htmlFor={`${id}-title`}>
        <Input
          id={`${id}-title`}
          name="title"
          defaultValue={task.title}
          required
          aria-invalid={state?.field === 'title'}
          aria-describedby={state?.field === 'title' ? errorId : undefined}
        />
      </Field>
      <Field label="Description" htmlFor={`${id}-description`}>
        <Textarea id={`${id}-description`} name="description" defaultValue={task.description ?? ''} />
      </Field>
      <Field label="Reward (DC)" htmlFor={`${id}-reward`}>
        <Input
          id={`${id}-reward`}
          name="reward_amount"
          type="number"
          min="1"
          step="1"
          defaultValue={task.rewardAmount}
          required
          aria-invalid={state?.field === 'reward_amount'}
          aria-describedby={state?.field === 'reward_amount' ? errorId : undefined}
        />
      </Field>
      {/* Deactivate/Reactivate owns this flag; saving an edit keeps it as it is. */}
      {task.isActive && <input type="hidden" name="is_active" value="on" />}
      {state?.formError && (
        <Message tone="error" id={errorId}>
          {state.formError}
        </Message>
      )}
      <div className="flex gap-2">
        <Button type="submit" size="sm">
          Save
        </Button>
        <Button size="sm" variant="quiet" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
```

- [ ] **Step 8: Restyle the page**

Replace `app/(app)/admin/tasks/page.tsx`.
- **Pending approvals** spans the width, with "{n} waiting" beside its title.
- **Create task and Task catalog** sit below it, side by side from `lg` up, like the desktop artboard's `.cols-r` grid.
- **An empty catalog** shows "No tasks yet.". The EmptyStates artboard's "Admins add Bible-study tasks here." is written for members on `/tasks`, so it's left off here.

```tsx
import { redirect } from 'next/navigation'
import { BookOpen } from 'lucide-react'
import { requireUser } from '@/lib/auth/require-user'
import { isAdmin } from '@/lib/auth/is-admin'
import { listTasks } from '@/lib/tasks/list-tasks'
import { listPendingTaskCompletions } from '@/lib/tasks/list-task-completions'
import { ageLabel } from '@/lib/social/relative-time'
import { SectionCard } from '@/components/ui/section-card'
import { EmptyState } from '@/components/ui/empty-state'
import { CreateTaskForm } from './create-task-form'
import { PendingApprovals } from './pending-approvals'
import { TaskCatalogItem } from './task-catalog-item'

export default async function AdminTasksPage() {
  const { supabase, user } = await requireUser()
  if (!user) redirect('/sign-in')
  if (!(await isAdmin(supabase))) redirect('/')

  const tasks = await listTasks(supabase)
  // Ages are worked out here, on the server, so the client-rendered list hydrates with the same text.
  const pending = (await listPendingTaskCompletions(supabase)).map((c) => ({ ...c, submittedAge: ageLabel(c.submittedAt) }))

  return (
    <>
      <SectionCard
        title="Pending approvals"
        titleId="pending-approvals"
        className="gap-4"
        action={pending.length > 0 ? <span className="text-sm text-ink2">{pending.length} waiting</span> : undefined}
      >
        <PendingApprovals pending={pending} />
      </SectionCard>
      <div className="flex flex-col gap-5 lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start lg:gap-7">
        <SectionCard title="Create task" titleId="create-task" className="gap-4">
          <CreateTaskForm />
        </SectionCard>
        <SectionCard title="Task catalog" titleId="task-catalog" className="gap-1">
          {tasks.length === 0 ? (
            <EmptyState icon={BookOpen} title="No tasks yet." />
          ) : (
            <ul className="flex flex-col divide-y divide-line">
              {tasks.map((task) => (
                <TaskCatalogItem key={task.id} task={task} />
              ))}
            </ul>
          )}
        </SectionCard>
      </div>
    </>
  )
}
```

- [ ] **Step 9: Run the tests to verify they pass**

Run: `npx vitest run tests/components/admin-tasks.test.tsx tests/db/list-pending-task-completions.test.ts`
Expected: PASS (16 tests: 15 + 1)

- [ ] **Step 10: Verify**

Run: `npm run lint && npx vitest run && npm run build`
Expected: all PASS

Run: `lsof -ti:3000 | xargs -r kill 2>/dev/null; npx playwright test`
Expected: all PASS, 13 tests (PR A's 12 plus Task 3's 404 check). In particular:
- `e2e/coin-economy.spec.ts` creates "Read Genesis 1-3", approves it with the first `Approve` button, and sees "Nothing pending."
- `e2e/admin-controls.spec.ts` checks two `completionIds` boxes, submits `Approve selected`, and sees "2 approved." and then "Nothing pending."

- [ ] **Step 11: Commit**

```bash
git add 'app/(app)/admin/tasks' lib/tasks/list-task-completions.ts lib/tasks/create-task.ts lib/tasks/update-task.ts tests/components/admin-tasks.test.tsx tests/db/list-pending-task-completions.test.ts
git commit -m "Restyle admin tasks: pending approvals, create form and catalog"
```

---

## Task 13: Cleanup, the phone top bar, an empty-state e2e check and full verification

**Files:**
- Modify: `app/globals.css` (remove the two legacy colour aliases)
- Modify: `components/app-nav/app-nav.tsx` (phone top bar spacing, balance chip, tab bar padding)
- Modify: `app/(app)/layout.tsx` (bottom padding)
- Modify: `e2e/app-nav.spec.ts` (one new test)
- Create: `e2e/empty-states.spec.ts`
- Modify: `AGENTS.md` (a short UI conventions section)

**Interfaces:**
- Consumes: every restyled screen from Tasks 1–12; `EmptyState` (Task 1); the parlays slip empty state "Your slip is empty." with its "Browse markets" link (Task 8).
- Produces: nothing new for other tasks. This is the last task.

Three follow-ups the spec carried from PR A land here:
- **Phone top bar width.** At 375px, an admin with a 5-digit balance
  pushed the phone top bar about 6px past the screen edge. PR A's probe
  measured the balance chip's right edge at 380.8px against a content box
  ending at 367px. Tightening the phone-only gaps and the chip's padding
  wins back about 16px.
- **`env(safe-area-inset-bottom)` is dropped.** It does nothing without
  `viewport-fit=cover`. Enabling cover would also need top-inset padding
  on the sticky top bar and side insets in landscape. That is a bigger
  change than the screens need, so this task takes the smaller option in
  the spec.
- **The legacy `--color-background` / `--color-foreground` aliases are
  removed.** PR A kept them "until PR B restyles them". Every page is now
  restyled.

- [ ] **Step 1: Confirm nothing still uses the legacy aliases or the starter classes**

Run:

```bash
grep -rnE "bg-background|text-foreground|border-foreground|text-gray-|bg-gray-|text-red-|text-green-|text-blue-|border-gray-|border px-2" app components
```

Expected: no output. If anything matches, a screen task missed it. Restyle that element with the tokens the task used for its neighbours (`text-ink2` for secondary text, `text-loss` for errors, `border-line` for borders) before continuing, and name the file in your report.

- [ ] **Step 2: Remove the legacy aliases from `app/globals.css`**

In the `@theme inline` block, delete these three lines:

```css
  /* Existing pages keep these until PR B restyles them. */
  --color-background: var(--bg);
  --color-foreground: var(--ink);
```

- [ ] **Step 3: Write the failing e2e test for the phone top bar**

Add this test to the end of `e2e/app-nav.spec.ts`, and add the import at the top of the file next to the existing one:

```typescript
import { serviceClient } from '../tests/db/helpers'
```

```typescript
test.describe('phone top bar', () => {
  test.use({ viewport: { width: 375, height: 812 } })

  test('fits at 375px with a five-digit balance', async ({ page }) => {
    const db = serviceClient()
    const { data: admin, error } = await db.from('profiles').select('id, balance').eq('is_admin', true).single()
    expect(error).toBeNull()
    try {
      await db.from('profiles').update({ balance: 99999 }).eq('id', admin!.id)
      await page.goto('/')
      await expect(page.getByRole('banner').getByText('Balance 99999 DC')).toBeAttached()
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
      expect(overflow).toBe(0)
    } finally {
      await db.from('profiles').update({ balance: admin!.balance }).eq('id', admin!.id)
    }
  })
})
```

The balance goes back to its old value in `finally`, so the other specs, which share this one seeded admin, see the same balance as before. The update goes straight to `profiles.balance` and writes no ledger row. This test only needs the rendered width, and the restore undoes it.

- [ ] **Step 4: Run it to verify it fails**

Run: `lsof -ti:3000 | xargs -r kill 2>/dev/null; npx playwright test e2e/app-nav.spec.ts -g "five-digit"`
Expected: FAIL. `expect(overflow).toBe(0)` receives 6. (If it receives 0, an earlier task already changed the phone top bar. Record that in your report and continue.)

- [ ] **Step 5: Tighten the phone top bar and the chip, and drop the inert safe-area calls**

In `components/app-nav/app-nav.tsx`:

The balance chip. Before:

```tsx
    <span className="inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-full bg-gold-soft pr-3 pl-2 text-[15px] font-extrabold tabular-nums text-gold">
      <CircleDot aria-hidden="true" className="size-[18px]" />
```

After:

```tsx
    <span className="inline-flex h-9 items-center gap-1 whitespace-nowrap rounded-full bg-gold-soft pr-2.5 pl-1.5 text-[15px] font-extrabold tabular-nums text-gold md:gap-1.5 md:pr-3 md:pl-2">
      <CircleDot aria-hidden="true" className="size-4 md:size-[18px]" />
```

The phone top bar. Before:

```tsx
      <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-1.5 border-b border-line bg-surface pr-2 pl-3 md:hidden">
```

After:

```tsx
      <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-1 border-b border-line bg-surface pr-2 pl-3 md:hidden">
```

The tab bar. Before:

```tsx
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-6 gap-0.5 border-t border-line bg-surface px-1 pt-1.5 pb-[max(12px,env(safe-area-inset-bottom))] md:hidden"
```

After:

```tsx
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-6 gap-0.5 border-t border-line bg-surface px-1 pt-1.5 pb-3 md:hidden"
```

In `app/(app)/layout.tsx`. Before:

```tsx
      <main id="main" className="flex flex-1 flex-col pb-[calc(82px+env(safe-area-inset-bottom))] md:pb-0">
```

After:

```tsx
      <main id="main" className="flex flex-1 flex-col pb-[82px] md:pb-0">
```

- [ ] **Step 6: Run it to verify it passes**

Run: `lsof -ti:3000 | xargs -r kill 2>/dev/null; npx playwright test e2e/app-nav.spec.ts`
Expected: PASS, 4 tests.

- [ ] **Step 7: Write the empty-state e2e check**

The slip lives in a cookie. Playwright gives every test a fresh context loaded from the seeded session, and that session holds no slip cookie. So `/parlays` always opens with an empty slip, whichever specs ran before this one.

Create `e2e/empty-states.spec.ts`:

```typescript
import { test, expect } from '@playwright/test'

test('an empty slip shows its empty state and a way to markets', async ({ page }) => {
  await page.goto('/parlays')
  await expect(page.getByText('Your slip is empty.')).toBeVisible()
  await expect(page.getByText('Add picks from any open market.')).toBeVisible()

  await page.getByRole('link', { name: 'Browse markets' }).click()
  await expect(page).toHaveURL(/\/markets$/)
})
```

- [ ] **Step 8: Run it**

Run: `lsof -ti:3000 | xargs -r kill 2>/dev/null; npx playwright test e2e/empty-states.spec.ts`
Expected: PASS, 1 test. It checks behaviour Task 8 already built, so there's no failing run first. If it fails, Task 8's empty state or its link doesn't match the approved copy. Fix it in `app/(app)/parlays/`.

- [ ] **Step 9: Document the UI conventions in `AGENTS.md`**

Add this section to `AGENTS.md`, directly after the `## Working in this repo` section:

```markdown
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
- **Visual source of truth:** `docs/design/app-redesign-handoff.md` and
  the design spec in `docs/superpowers/specs/`.
```

- [ ] **Step 10: Run the whole chain**

Run: `npm run lint && npx vitest run && npm run build`
Expected: all PASS.

Run: `npm run db:reset && (lsof -ti:3000 | xargs -r kill 2>/dev/null); npx playwright test`
Expected: PASS. That's 15 tests: PR A's 12, Task 3's 404 test, and this task's two.

- [ ] **Step 11: Re-run the chain on the CLI version CI pins**

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

Expected: every step passes on this exact CLI version.

- [ ] **Step 12: Commit**

```bash
git add app/globals.css components/app-nav/app-nav.tsx 'app/(app)/layout.tsx' e2e/app-nav.spec.ts e2e/empty-states.spec.ts AGENTS.md
git commit -m "Drop legacy tokens, fit the phone top bar, and add empty-state and width e2e checks"
```

- [ ] **Step 13 (controller, not the implementer): visual check against the artboards**

The executing controller does this step in the built-in browser. It isn't dispatched to a subagent.
1. Start the app locally, signed in as the seeded member.
2. Compare every restyled route by eye with its artboards, at 375px and 1280px, in light and dark.
3. Check each screen for:
   - every control is at least 44px
   - focus rings are visible when you tab
   - no clickable `div`s
   - no sideways scroll at 375px

   These are the spec's per-screen accessibility checks.
4. Record any mismatch as a final-review finding.

---


## Self-Review

**Spec coverage (the spec's PR B section):**
- **Every route restyled to its artboards, in the spec's order:**
  - auth → Task 3
  - home → Task 4
  - markets → Task 6
  - market detail → Tasks 5 and 7
  - parlays → Task 8
  - tasks → Task 9
  - feed, leaderboard and profile → Task 10
  - admin → Tasks 11 and 12
  - 404 → Task 3 ✓
- **Every list's empty state** → built in the task that owns each list, with the EmptyStates artboard's copy. Task 13 adds an e2e check for one of them ✓
- **A new `app/not-found.tsx`** → Task 3, which also adds `app/(app)/not-found.tsx` ✓
- **The approved copy:**
  - "Insufficient balance — you have {n} DC. Try a smaller amount." → Task 2, mapped from Postgres error `23514` / `profiles_balance_check`
  - "Add at least one more pick…" and "Remove the pick that’s no longer available…" → Task 8
  - "Your slip is empty." → Task 8
  - "Awaiting resolution" → Tasks 6 and 7
  - "Winning outcome: {x}" → Task 7
  - "Add a reason — it’s shown in the ledger…" → Task 11
  - "Page not found" / "This page wandered off…" → Task 3
  - "Friendly bets. Faithful study." → Task 3 ✓
- **The e2e selector change (decision 2)** → Task 7 ✓
- **Charts left out until PR C** → no task builds them ✓
- **Carried from PR A:**
  - `Field` ARIA → wired at each call site (Global Constraints)
  - home's second balance → ruled on (Rulings)
  - `Message tone="gold"` without a live region → Task 1
  - the phone top bar at 375px, the inert `env()` calls and the duplicate home fetch → Task 13, or accepted in Rulings
- **The spec's testing section:**
  - the 404 page renders → Task 3's e2e test
  - an empty state renders → Task 13's e2e test
  - the Postgres-error → friendly-copy mapping → Task 2's unit and DB tests
  - the per-screen accessibility and visual checks → Task 13, Step 13 ✓

**Copy this plan adds that no artboard draws** (flagged for sign-off):
- **Home tiles and caption:**
  - "No open markets" / "1 open market" / "{n} open markets"
  - "1 pick in your slip" / "{n} picks in your slip" (an empty slip reuses "Your slip is empty.")
  - "You’re ranked {r} of {n}"
  - "Nothing waiting" / "1 approval waiting" / "{n} approvals waiting"
  - the hero caption "Rank {r} of {n}", followed by " · {x} DC pending in {k} task review(s)" when something is pending
- **Market detail:**
  - the voided body, "This market was voided, and every bet and parlay leg was refunded."
  - the awaiting body, "This market closed {date · time} and is awaiting resolution."
  - the two Resolve card hints for an admin and for the creator
  - "Override resolution"
  - the "Closed {day}" meta line
- **Markets list:** the "Voided" group heading and chip.
- **Tasks:** "Not approved — {reason}" under a rejected task.
- **Not-invited:** a generic "This Google account isn’t on the invite list yet" line, in place of the per-email sentence.

**Placeholder scan:** none. Every code step has its full code, and a cross-task consistency pass checked the seams: files touched by more than one task, every Consumes against its Produces, mock paths, `git add` lists, e2e strings and counts, and task references.

**Type consistency:** the interfaces named in the Global Constraints match their producers:
- Task 1's components
- Task 5's `LocalTime`, `formatDateTime`, `formatDay`, `outcomeSeries`, `OutcomeRow` and `BetList`, and `getMarket`'s `creatorName` / `resolvedAt`
- Task 2's action states
- Task 9's `PERIOD_LABEL`
- the reader columns added in Tasks 6, 9, 11 and 12
