# Design Pass — PR A: Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lay DwellDuel's design foundation. That means:
- the light and dark design tokens, with a system-following theme and a
  remembered toggle
- the Manrope font
- the DwellDuel wordmark and favicons
- one shared responsive navigation (a desktop top bar, and a phone top bar
  plus bottom tab bar) replacing each page's own link rows
- the Button, Field, Card, StatusChip and Message primitives that PR B
  restyles every screen with

**Architecture:**
- **Tokens:** CSS variables in `app/globals.css`, exposed to Tailwind v4
  through `@theme inline`, so every utility such as `bg-surface` or
  `text-ink` follows the active theme.
- **Theme choice:** a `theme` cookie that the root layout reads on the
  server and writes as `data-theme` on `<html>`, so there's no flash on
  load. With no cookie, a `prefers-color-scheme` block applies the dark
  tokens.
- **Navigation:** signed-in pages move into an `app/(app)/` route group.
  Its layout renders a client `AppNav` from server-fetched balance,
  admin flag and slip count.
- **Keeping the nav current:** money- and slip-changing actions revalidate
  that layout, so the nav stays current.

**Tech Stack:**
- Next.js 16 (App Router) and TypeScript
- Tailwind CSS v4.3
- `class-variance-authority` 0.7, `lucide-react` 1.47 and `motion` 13, all
  already installed
- Vitest 4 with React Testing Library and jsdom (already installed)
- Playwright

**Spec:** [`docs/superpowers/specs/2026-09-25-design-pass-design.md`](../specs/2026-09-25-design-pass-design.md).
Its visual source of truth is [`docs/design/app-redesign-handoff.md`](../../design/app-redesign-handoff.md)
and the Claude Design canvas <https://claude.ai/artifact/DkowpVq9ZMm7Gn9rL4cTqw>
(artboards `project/TopBar.dc.html`, `project/TabBar.dc.html`,
`project/<Screen>--<phone|desktop>-<light|dark>.dc.html`). Read them alongside
this plan. Where they differ, the spec's "Decisions that amend the
handoff" win.

## Global Constraints

- **Scope:** PR A only. Don't restyle page bodies (that's PR B), and don't
  add charts, NumberFlow, toasts or a drawer (that's PR C).
- **No database changes:** no migration, no access-policy change, no change
  to any coin-moving function.
- **Native form controls:** `<select>` and `<input type="checkbox">` stay
  native HTML elements. No Base UI in this PR.
- **E2E strings:** every string and role the existing e2e tests assert on
  keeps working. In particular:
  - the home page keeps "Balance: {n} DC" and the "Sign out" button
  - no nav text may contain "Balance:" with a colon, because
    `e2e/foundation.spec.ts` matches `/Balance: \d+ DC/`
- **Tokens:** exactly the values in Task 1, which are the handoff's tokens
  plus the mockup's `--on-lime`, `--win-soft`, `--on-hero`, `--hero-2`,
  `--wm-a`, `--wm-b`, `--sym-d`, `--shadow`, plus the spec's `--s5`/`--s6`.
- **Sizing:**
  - every interactive control is at least 44px tall
  - primary buttons are 48px (`md`); compact buttons are 44px (`sm`)
  - every control gets a visible focus ring:
    `outline: 3px solid var(--focus); outline-offset: 2px`
- **Corner radii:** cards 18px, buttons and inputs 12px, chips fully
  rounded.
- **Real elements only:** `<button>`, `<a>`, and `<label>` tied to its
  input. No clickable `div`s. Icon-only controls get an `aria-label`.
- **Wordmark:** the symbol plus "DWELL" and "DUEL" in Manrope ExtraBold,
  uppercase, `-0.03em` tracking.
  - D fill: `--sym-d` (`#03272D` light, `#FFFFFF` dark)
  - leaves: always `#72DB2B`
  - "DWELL": `--wm-a`
  - "DUEL": `--wm-b` (`#3FAE14` light, `#72DB2B` dark)
- **Parlays nav link:** it shows the slip count as a visible badge (hidden
  from assistive tech) plus a visually hidden `" (n)"`, so its accessible
  name is exactly "Parlays (n)". It's just "Parlays" when the slip is
  empty.
- **Leaderboard tab:** the phone tab reads "Leaders" but has
  `aria-label="Leaderboard"`.
- **Code style:** comments explain why, not what; default to no comments.
  The repo style is single quotes and no semicolons.
- **Paths:** zsh treats unquoted `[id]` and `(app)` as globs, so quote any
  bracketed or parenthesized path in shell commands.
- **Next.js 16:** read the relevant guide in `node_modules/next/dist/docs/`
  before writing Next-specific code (AGENTS.md). Cookies can only be set in
  Server Functions.

**Before Task 1:** `npm run db:start` (or confirm it's already running),
with `.env.local` pointed at the **local** Supabase instance.

**Before the final task's verification pass:** re-run the whole chain
against the exact Supabase CLI version CI pins (`npx -y supabase@2.115.0`).

---

## Task 1: Tokens, Manrope and the theme cookie

**Files:**
- Replace: `app/globals.css`
- Modify: `app/layout.tsx`
- Create: `lib/theme/theme.ts`
- Create: `lib/theme/set-theme.ts`
- Test: `tests/lib/theme/theme.test.ts`

**Interfaces:**
- Produces:
  - `THEME_COOKIE = 'theme'`, `type Theme = 'light' | 'dark'` and
    `resolveTheme(value: string | undefined): Theme | null`, all in
    `lib/theme/theme.ts`
  - `setThemeAction(value: string): Promise<void>` in
    `lib/theme/set-theme.ts`, a `'use server'` action
  - Tailwind color utilities for every token: `bg-bg`, `bg-surface`,
    `bg-sunk`, `text-ink`, `text-ink2`, `border-line`, `border-line-s`,
    `bg-primary`, `text-on-primary`, `bg-lime`, `text-on-lime`,
    `text-link`, `bg-acc-soft`, `text-acc-text`, `text-gold`,
    `bg-gold-soft`, `text-win`, `bg-win-soft`, `text-loss`,
    `bg-loss-soft`, `bg-hero`, `text-on-hero`, `text-hero-2`,
    `text-wm-a`, `text-wm-b`, `fill-sym-d`, and `s1`–`s6`
  - `rounded-control` (12px), `rounded-card` (18px) and `shadow-card`
  - a `dark:` variant that applies for `data-theme="dark"`, or for the
    system's dark preference when no theme is saved

The existing pages still use `text-foreground/70` and `bg-background` until
PR B restyles them. Those aliases stay defined, mapped to the new tokens.

- [ ] **Step 1: Write `tests/lib/theme/theme.test.ts` (will fail — the module doesn't exist yet)**

```typescript
import { describe, it, expect } from 'vitest'
import { resolveTheme, THEME_COOKIE } from '@/lib/theme/theme'

describe('resolveTheme', () => {
  it('accepts the two saved themes', () => {
    expect(resolveTheme('light')).toBe('light')
    expect(resolveTheme('dark')).toBe('dark')
  })

  it('treats a missing or unknown cookie as no choice', () => {
    expect(resolveTheme(undefined)).toBeNull()
    expect(resolveTheme('')).toBeNull()
    expect(resolveTheme('purple')).toBeNull()
  })

  it('uses a stable cookie name', () => {
    expect(THEME_COOKIE).toBe('theme')
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/lib/theme/theme.test.ts`
Expected: FAIL with `Failed to resolve import "@/lib/theme/theme"`

- [ ] **Step 3: Write `lib/theme/theme.ts`**

```typescript
export const THEME_COOKIE = 'theme'

export type Theme = 'light' | 'dark'

export function resolveTheme(value: string | undefined): Theme | null {
  return value === 'light' || value === 'dark' ? value : null
}
```

- [ ] **Step 4: Write `lib/theme/set-theme.ts`**

```typescript
'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { resolveTheme, THEME_COOKIE } from './theme'

export async function setThemeAction(value: string): Promise<void> {
  const theme = resolveTheme(value)
  if (!theme) return

  ;(await cookies()).set(THEME_COOKIE, theme, {
    path: '/',
    sameSite: 'lax',
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 365,
  })
  revalidatePath('/', 'layout')
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run tests/lib/theme/theme.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 6: Replace `app/globals.css`**

```css
@import "tailwindcss";

/* Dark applies for an explicit choice, or for the system preference when no choice is saved. */
@custom-variant dark {
  &:where([data-theme="dark"], [data-theme="dark"] *) {
    @slot;
  }
  @media (prefers-color-scheme: dark) {
    &:where(:root:not([data-theme="light"]), :root:not([data-theme="light"]) *) {
      @slot;
    }
  }
}

:root {
  color-scheme: light;
  --bg: #F3F6F1;
  --surface: #FCFDFB;
  --sunk: #E6EDE6;
  --ink: #03272D;
  --ink2: #46605E;
  --line: #D5DFD8;
  --line-s: #7A8F8B;
  --primary: #03272D;
  --on-primary: #FFFFFF;
  --lime: #72DB2B;
  --on-lime: #03272D;
  --link: #03272D;
  --acc-soft: #E3F4D5;
  --acc-text: #2A6E0B;
  --gold: #855600;
  --gold-soft: #F6E7C4;
  --win: #2A6E0B;
  --win-soft: #E3F4D5;
  --loss: #A8281C;
  --loss-soft: #FAE1DD;
  --focus: #03272D;
  --hero: #03272D;
  --on-hero: #FFFFFF;
  --hero-2: #B9D3CE;
  --wm-a: #03272D;
  --wm-b: #3FAE14;
  --sym-d: #03272D;
  --shadow: 0 1px 2px rgba(3, 39, 45, 0.05), 0 6px 20px rgba(3, 39, 45, 0.05);
  --s1: #03272D;
  --s2: #2A6E0B;
  --s3: #855600;
  --s4: #3155B8;
  --s5: #7B3FA8;
  --s6: #B0306F;
}

/* The same dark values appear twice: once for an explicit choice, once for the system fallback. */
[data-theme="dark"] {
  color-scheme: dark;
  --bg: #021B1F;
  --surface: #07282E;
  --sunk: #0D343B;
  --ink: #EAF4EE;
  --ink2: #A3BDB8;
  --line: #17434A;
  --line-s: #5E8883;
  --primary: #72DB2B;
  --on-primary: #03272D;
  --link: #8BE651;
  --acc-soft: #143A1E;
  --acc-text: #8BE651;
  --gold: #F0C15A;
  --gold-soft: #3A2E14;
  --win: #8BE651;
  --win-soft: #143A1E;
  --loss: #FF9585;
  --loss-soft: #3D1C17;
  --focus: #72DB2B;
  --hero: #0D3A41;
  --wm-a: #FFFFFF;
  --wm-b: #72DB2B;
  --sym-d: #FFFFFF;
  --shadow: none;
  --s1: #EAF4EE;
  --s2: #8BE651;
  --s3: #F0C15A;
  --s4: #9DB0FF;
  --s5: #D2A8FF;
  --s6: #FF8FC4;
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    color-scheme: dark;
    --bg: #021B1F;
    --surface: #07282E;
    --sunk: #0D343B;
    --ink: #EAF4EE;
    --ink2: #A3BDB8;
    --line: #17434A;
    --line-s: #5E8883;
    --primary: #72DB2B;
    --on-primary: #03272D;
    --link: #8BE651;
    --acc-soft: #143A1E;
    --acc-text: #8BE651;
    --gold: #F0C15A;
    --gold-soft: #3A2E14;
    --win: #8BE651;
    --win-soft: #143A1E;
    --loss: #FF9585;
    --loss-soft: #3D1C17;
    --focus: #72DB2B;
    --hero: #0D3A41;
    --wm-a: #FFFFFF;
    --wm-b: #72DB2B;
    --sym-d: #FFFFFF;
    --shadow: none;
    --s1: #EAF4EE;
    --s2: #8BE651;
    --s3: #F0C15A;
    --s4: #9DB0FF;
    --s5: #D2A8FF;
    --s6: #FF8FC4;
  }
}

@theme inline {
  --color-bg: var(--bg);
  --color-surface: var(--surface);
  --color-sunk: var(--sunk);
  --color-ink: var(--ink);
  --color-ink2: var(--ink2);
  --color-line: var(--line);
  --color-line-s: var(--line-s);
  --color-primary: var(--primary);
  --color-on-primary: var(--on-primary);
  --color-lime: var(--lime);
  --color-on-lime: var(--on-lime);
  --color-link: var(--link);
  --color-acc-soft: var(--acc-soft);
  --color-acc-text: var(--acc-text);
  --color-gold: var(--gold);
  --color-gold-soft: var(--gold-soft);
  --color-win: var(--win);
  --color-win-soft: var(--win-soft);
  --color-loss: var(--loss);
  --color-loss-soft: var(--loss-soft);
  --color-focus: var(--focus);
  --color-hero: var(--hero);
  --color-on-hero: var(--on-hero);
  --color-hero-2: var(--hero-2);
  --color-wm-a: var(--wm-a);
  --color-wm-b: var(--wm-b);
  --color-sym-d: var(--sym-d);
  --color-s1: var(--s1);
  --color-s2: var(--s2);
  --color-s3: var(--s3);
  --color-s4: var(--s4);
  --color-s5: var(--s5);
  --color-s6: var(--s6);
  /* Existing pages keep these until PR B restyles them. */
  --color-background: var(--bg);
  --color-foreground: var(--ink);
  --font-sans: var(--font-manrope), ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  --radius-control: 12px;
  --radius-card: 18px;
  --shadow-card: var(--shadow);
}

@layer base {
  body {
    background: var(--bg);
    color: var(--ink);
    font-family: var(--font-sans);
    -webkit-font-smoothing: antialiased;
  }

  a {
    color: var(--link);
    text-decoration-thickness: 1.5px;
    text-underline-offset: 3px;
  }

  :focus-visible {
    outline: 3px solid var(--focus);
    outline-offset: 2px;
  }
}
```

If Tailwind rejects the block form of `@custom-variant` with a nested
`@media`, split it into two variants: `dark` for the selector form and
`dark-system` for the media form. Use both wherever `dark:` is needed
(only the theme toggle in this PR), and record the split in your report.

- [ ] **Step 7: Rewrite `app/layout.tsx`**

Replace the whole file with the following. It switches to repo style,
swaps Geist for Manrope, and reads the theme cookie:

```typescript
import type { Metadata } from 'next'
import { Manrope } from 'next/font/google'
import { cookies } from 'next/headers'
import { Analytics } from '@vercel/analytics/next'
import { SpeedInsights } from '@vercel/speed-insights/next'
import { resolveTheme, THEME_COOKIE } from '@/lib/theme/theme'
import './globals.css'

const manrope = Manrope({
  variable: '--font-manrope',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: 'DwellDuel',
  description: 'DwellDuel',
}

export default async function RootLayout({ children }: LayoutProps<'/'>) {
  const theme = resolveTheme((await cookies()).get(THEME_COOKIE)?.value)

  return (
    <html lang="en" data-theme={theme ?? undefined} className={`${manrope.variable} h-full`}>
      <body className="flex min-h-full flex-col">
        {children}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  )
}
```

- [ ] **Step 8: Verify**

Run: `npm run lint && npx vitest run && npm run build`
Expected: all PASS. The build compiles `globals.css` without error.

- [ ] **Step 9: Commit**

```bash
git add app/globals.css app/layout.tsx lib/theme tests/lib/theme
git commit -m "Add design tokens, Manrope, and a cookie-backed theme"
```

---

## Task 2: Wordmark, favicons and site metadata

**Files:**
- Create: `components/brand/wordmark.tsx`
- Create (copied): `public/favicon.svg`, `public/favicon-16.png`,
  `public/favicon-32.png`, `public/apple-touch-icon-180.png`,
  `public/android-chrome-192.png`, `public/android-chrome-512.png`,
  `public/maskable-512.png`, `public/og-image-1200x630.png`,
  `public/site.webmanifest`
- Delete: `app/favicon.ico`
- Modify: `app/layout.tsx` (the `metadata` export, plus a new `viewport` export)
- Test: `tests/components/wordmark.test.tsx`

**Interfaces:**
- Consumes: the `text-wm-a`, `text-wm-b` and `fill-sym-d` utilities
  (Task 1)
- Produces: `DwellDuelSymbol({ size }: { size: number })` and
  `Wordmark({ size, href }: { size?: 'sm' | 'md'; href?: string })`,
  both from `components/brand/wordmark.tsx`. `Wordmark` renders a link
  named "DwellDuel home".

`app/favicon.ico` is Next's starter icon. Next turns a file-based
`favicon.ico` in `app/` into its own `<link rel="icon">`, which would
compete with the brand icons, so it's removed.

- [ ] **Step 1: Write `tests/components/wordmark.test.tsx` (will fail — the component doesn't exist yet)**

```typescript
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Wordmark } from '@/components/brand/wordmark'

describe('Wordmark', () => {
  it('is a home link named for the app, with the two-colour word', () => {
    render(<Wordmark />)
    const link = screen.getByRole('link', { name: 'DwellDuel home' })
    expect(link).toHaveAttribute('href', '/')
    expect(link).toHaveTextContent('DwellDuel')
    expect(screen.getByText('Dwell')).toHaveClass('text-wm-a')
    expect(screen.getByText('Duel')).toHaveClass('text-wm-b')
  })

  it('hides the symbol from assistive tech', () => {
    const { container } = render(<Wordmark size="sm" />)
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/components/wordmark.test.tsx`
Expected: FAIL with `Failed to resolve import "@/components/brand/wordmark"`

If a later run fails with `React is not defined`, the JSX transform isn't
automatic. `tsconfig.json` already sets `"jsx": "react-jsx"`, which Vite 8
should honour. If it doesn't, set the equivalent automatic-JSX option in
`vitest.config.mts` for this Vite version, and record exactly what you
changed.

- [ ] **Step 3: Write `components/brand/wordmark.tsx`**

```typescript
import Link from 'next/link'
import { cn } from '@/lib/utils'

const LEAF = 'M50 3 C60 11 57 24 48 27 C41 20 43 10 50 3 Z'

export function DwellDuelSymbol({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
      <g transform="translate(50 50) translate(-55.5 -41.5)">
        <g fill="#72DB2B">
          {[30, 50, 70, 90].map((angle) => (
            <path key={angle} d={LEAF} transform={`rotate(${angle} 50 50)`} />
          ))}
        </g>
        <path
          className="fill-sym-d"
          fillRule="evenodd"
          d="M14 26 H42 A24 24 0 0 1 42 74 H14 Z M28 40 H42 A10 10 0 0 1 42 60 H28 Z"
        />
      </g>
    </svg>
  )
}

export function Wordmark({ size = 'md', href = '/' }: { size?: 'sm' | 'md'; href?: string }) {
  return (
    <Link
      href={href}
      aria-label="DwellDuel home"
      className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-[10px] pr-1 no-underline"
    >
      <DwellDuelSymbol size={size === 'sm' ? 28 : 32} />
      <span
        className={cn(
          'whitespace-nowrap font-extrabold uppercase leading-none tracking-[-0.03em]',
          size === 'sm' ? 'text-[18px]' : 'text-[21px]',
        )}
      >
        <span className="text-wm-a">Dwell</span>
        <span className="text-wm-b">Duel</span>
      </span>
    </Link>
  )
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run tests/components/wordmark.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 5: Copy the favicons and manifest from the logo pack, and remove the starter icon**

```bash
P="/Users/aaronwickham/Documents/DwellDuel Logo Pack"
cp "$P/svg/favicon.svg" public/favicon.svg
for f in favicon-16.png favicon-32.png apple-touch-icon-180.png android-chrome-192.png android-chrome-512.png maskable-512.png og-image-1200x630.png site.webmanifest; do
  cp "$P/web/$f" "public/$f"
done
git rm app/favicon.ico
ls public
```

Expected: all nine files are listed in `public/`.

- [ ] **Step 6: Replace the `metadata` export in `app/layout.tsx`, and add a `viewport` export**

Change the import line `import type { Metadata } from 'next'` to
`import type { Metadata, Viewport } from 'next'`, then replace the existing
`metadata` export with:

```typescript
export const metadata: Metadata = {
  metadataBase: new URL('https://www.dwellduel.com'),
  title: 'DwellDuel',
  description: 'Friendly bets. Faithful study.',
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon-16.png', sizes: '16x16', type: 'image/png' },
    ],
    apple: '/apple-touch-icon-180.png',
  },
  manifest: '/site.webmanifest',
  openGraph: { images: ['/og-image-1200x630.png'] },
}

export const viewport: Viewport = {
  themeColor: '#03272d',
}
```

- [ ] **Step 7: Verify**

Run: `npm run lint && npx vitest run && npm run build`
Expected: all PASS, with no metadata warnings in the build output.

- [ ] **Step 8: Commit**

```bash
git add components/brand tests/components/wordmark.test.tsx public app/layout.tsx
git commit -m "Add the DwellDuel wordmark, favicons, and site metadata"
```

(`git rm` in Step 5 already staged the favicon deletion.)

---

## Task 3: Primitives — Button, Field, Card, StatusChip, Message

**Files:**
- Create: `components/ui/button.tsx`
- Create: `components/ui/field.tsx`
- Create: `components/ui/card.tsx`
- Create: `components/ui/status-chip.tsx`
- Create: `components/ui/message.tsx`
- Test: `tests/components/ui.test.tsx`

**Interfaces:**
- Consumes: Task 1's token utilities; `cn` from `lib/utils.ts` (already in
  the repo)
- Produces:
  - `buttonVariants(opts)` and `Button(props)` in
    `components/ui/button.tsx`
    - variants: `primary`, `secondary`, `danger`, `quiet`
    - sizes: `md`, `sm`
    - `block?: boolean`
    - `type` defaults to `'button'`
  - `Field`, `Input`, `Textarea` and `Select` in `components/ui/field.tsx`
    - `Field` props: `{ label, htmlFor, hint?, error?, children, className? }`
    - it renders the hint with id `${htmlFor}-hint` and the error with id
      `${htmlFor}-error`
  - `Card` and `cardClass` in `components/ui/card.tsx`; props:
    `padded?: boolean` (default `true`)
  - `StatusChip` in `components/ui/status-chip.tsx`; props:
    `tone: 'open' | 'wait' | 'done' | 'lost' | 'void'`
  - `Message` in `components/ui/message.tsx`
    - props: `tone: 'error' | 'ok' | 'gold'`
    - error uses `role="alert"`; ok and gold use `role="status"`

Every class below comes from the mockup's `.btn`, `.field`, `.input`,
`.select`, `.card`, `.chip-*` and `.msg-*` rules.

- [ ] **Step 1: Write `tests/components/ui.test.tsx` (will fail — the modules don't exist yet)**

```typescript
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Button, buttonVariants } from '@/components/ui/button'
import { Field, Input, Select, Textarea } from '@/components/ui/field'
import { Card } from '@/components/ui/card'
import { StatusChip } from '@/components/ui/status-chip'
import { Message } from '@/components/ui/message'

describe('Button', () => {
  it('is a plain button by default, so it never submits a form by accident', () => {
    render(<Button>Save</Button>)
    expect(screen.getByRole('button', { name: 'Save' })).toHaveAttribute('type', 'button')
  })

  it('submits when asked to', () => {
    render(<Button type="submit">Place bet</Button>)
    expect(screen.getByRole('button', { name: 'Place bet' })).toHaveAttribute('type', 'submit')
  })

  it('applies the variant and size', () => {
    render(
      <Button variant="danger" size="sm">
        Void
      </Button>,
    )
    const button = screen.getByRole('button', { name: 'Void' })
    expect(button).toHaveClass('text-loss', 'border-loss', 'min-h-11')
  })

  it('gives the quiet variant its own tighter padding', () => {
    const classes = buttonVariants({ variant: 'quiet' }).split(' ')
    expect(classes).toContain('px-2.5')
    expect(classes).not.toContain('px-5')
  })

  it('keeps every size at least 44px tall', () => {
    expect(buttonVariants({ size: 'md' })).toContain('min-h-12')
    expect(buttonVariants({ size: 'sm' })).toContain('min-h-11')
  })
})

describe('Field', () => {
  it('ties its label to the control', () => {
    render(
      <Field label="Title" htmlFor="title">
        <Input id="title" name="title" />
      </Field>,
    )
    expect(screen.getByLabelText('Title')).toHaveAttribute('name', 'title')
  })

  it('shows a hint and an error with predictable ids', () => {
    render(
      <Field label="Amount (DC)" htmlFor="amount" hint="Whole numbers only" error="Enter a positive amount">
        <Input id="amount" aria-invalid aria-describedby="amount-hint amount-error" />
      </Field>,
    )
    expect(screen.getByText('Whole numbers only')).toHaveAttribute('id', 'amount-hint')
    const error = screen.getByRole('alert')
    expect(error).toHaveTextContent('Enter a positive amount')
    expect(error).toHaveAttribute('id', 'amount-error')
    expect(screen.getByLabelText('Amount (DC)')).toHaveAccessibleDescription('Whole numbers only Enter a positive amount')
  })

  it('keeps Select a native select', () => {
    render(
      <Field label="Outcome" htmlFor="outcome">
        <Select id="outcome" name="outcome_id" defaultValue="b">
          <option value="a">Yes</option>
          <option value="b">No</option>
        </Select>
      </Field>,
    )
    const select = screen.getByRole('combobox', { name: 'Outcome' })
    expect(select.tagName).toBe('SELECT')
    expect(select).toHaveValue('b')
  })

  it('renders a textarea control', () => {
    render(
      <Field label="Description" htmlFor="desc">
        <Textarea id="desc" />
      </Field>,
    )
    expect(screen.getByLabelText('Description').tagName).toBe('TEXTAREA')
  })
})

describe('Card', () => {
  it('is padded by default and can opt out', () => {
    const { rerender, container } = render(<Card>Body</Card>)
    expect(container.firstChild).toHaveClass('rounded-card', 'p-[18px]')
    rerender(<Card padded={false}>Body</Card>)
    expect(container.firstChild).not.toHaveClass('p-[18px]')
  })
})

describe('StatusChip', () => {
  it('colours itself by tone', () => {
    render(<StatusChip tone="lost">Lost</StatusChip>)
    expect(screen.getByText('Lost')).toHaveClass('bg-loss-soft', 'text-loss')
  })
})

describe('Message', () => {
  it('announces errors as alerts', () => {
    render(<Message tone="error">Insufficient balance</Message>)
    expect(screen.getByRole('alert')).toHaveTextContent('Insufficient balance')
  })

  it('announces ok and gold messages politely', () => {
    render(
      <>
        <Message tone="ok">2 approved.</Message>
        <Message tone="gold">Awaiting resolution</Message>
      </>,
    )
    expect(screen.getAllByRole('status').map((el) => el.textContent)).toEqual(['2 approved.', 'Awaiting resolution'])
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/components/ui.test.tsx`
Expected: FAIL with `Failed to resolve import "@/components/ui/button"`

- [ ] **Step 3: Write `components/ui/button.tsx`**

```typescript
import type { ButtonHTMLAttributes } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

export const buttonVariants = cva(
  'inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-control border-[1.5px] border-transparent font-extrabold leading-[1.2] no-underline disabled:cursor-not-allowed disabled:border-transparent disabled:bg-sunk disabled:text-ink2',
  {
    variants: {
      variant: {
        primary: 'bg-primary text-on-primary',
        secondary: 'border-line-s bg-surface text-ink',
        danger: 'border-loss bg-transparent text-loss',
        quiet: 'bg-transparent text-ink underline decoration-[1.5px] underline-offset-[3px]',
      },
      size: {
        md: 'min-h-12 px-5 text-base',
        sm: 'min-h-11 px-3.5 text-[15px]',
      },
      block: {
        true: 'w-full',
      },
    },
    compoundVariants: [{ variant: 'quiet', class: 'px-2.5' }],
    defaultVariants: { variant: 'primary', size: 'md' },
  },
)

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}

export function Button({ className, variant, size, block, type = 'button', ...props }: ButtonProps) {
  return <button type={type} className={cn(buttonVariants({ variant, size, block }), className)} {...props} />
}
```

`buttonVariants` is exported so that PR B can style a `next/link` `<Link>` as
a button without nesting a `<button>` inside an `<a>`.

- [ ] **Step 4: Write `components/ui/field.tsx`**

```typescript
import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

const control =
  'w-full min-h-12 rounded-control border-[1.5px] border-line-s bg-surface px-3.5 text-base text-ink aria-[invalid=true]:border-2 aria-[invalid=true]:border-loss'

export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
  className,
}: {
  label: string
  htmlFor: string
  hint?: string
  error?: string
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      <label htmlFor={htmlFor} className="text-[15px] font-bold">
        {label}
      </label>
      {hint && (
        <span id={`${htmlFor}-hint`} className="text-sm text-ink2">
          {hint}
        </span>
      )}
      {children}
      {error && (
        <p id={`${htmlFor}-error`} role="alert" className="text-sm font-bold text-loss">
          {error}
        </p>
      )}
    </div>
  )
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(control, className)} {...props} />
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(control, 'min-h-[100px] resize-y py-3 leading-normal', className)} {...props} />
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <span className="relative block">
      <select className={cn(control, 'appearance-none pr-11', className)} {...props}>
        {children}
      </select>
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 right-3.5 size-[18px] -translate-y-1/2 text-ink2"
      />
    </span>
  )
}
```

- [ ] **Step 5: Write `components/ui/card.tsx`**

```typescript
import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export const cardClass = 'rounded-card border border-line bg-surface shadow-card'

export function Card({ className, padded = true, ...props }: HTMLAttributes<HTMLDivElement> & { padded?: boolean }) {
  return <div className={cn(cardClass, padded && 'p-[18px] md:p-6', className)} {...props} />
}
```

`cardClass` is exported for places where the card is a `<form>`, a
`<section>` or an `<li>`, not a `<div>`. The mockup does this often.

- [ ] **Step 6: Write `components/ui/status-chip.tsx`**

```typescript
import type { ReactNode } from 'react'
import { cva } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const chipVariants = cva(
  'inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-[13px] font-extrabold',
  {
    variants: {
      tone: {
        open: 'bg-acc-soft text-acc-text',
        wait: 'bg-gold-soft text-gold',
        done: 'bg-primary text-on-primary',
        lost: 'bg-loss-soft text-loss',
        void: 'bg-sunk text-ink2',
      },
    },
  },
)

export function StatusChip({
  tone,
  className,
  children,
}: {
  tone: 'open' | 'wait' | 'done' | 'lost' | 'void'
  className?: string
  children: ReactNode
}) {
  return <span className={cn(chipVariants({ tone }), className)}>{children}</span>
}
```

- [ ] **Step 7: Write `components/ui/message.tsx`**

```typescript
import type { ReactNode } from 'react'
import { CircleAlert, CircleCheck, Info } from 'lucide-react'
import { cn } from '@/lib/utils'

const TONES = {
  error: { className: 'bg-loss-soft text-loss', Icon: CircleAlert },
  ok: { className: 'bg-acc-soft text-acc-text', Icon: CircleCheck },
  gold: { className: 'bg-gold-soft text-gold', Icon: Info },
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
  const { className: toneClass, Icon } = TONES[tone]
  return (
    <p
      id={id}
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn('flex items-start gap-2.5 rounded-control px-3.5 py-3 text-[15px] font-bold leading-[1.4]', toneClass, className)}
    >
      <Icon aria-hidden="true" className="mt-px size-5 shrink-0" />
      <span>{children}</span>
    </p>
  )
}
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `npx vitest run tests/components/ui.test.tsx`
Expected: PASS (13 tests)

- [ ] **Step 9: Verify**

Run: `npm run lint && npx vitest run && npm run build`
Expected: all PASS

- [ ] **Step 10: Commit**

```bash
git add components/ui tests/components/ui.test.tsx
git commit -m "Add Button, Field, Card, StatusChip, and Message primitives"
```

---

## Task 4: Move signed-in pages into the `app/(app)/` route group

**Files:**
- Move: `app/page.tsx`, `app/markets/`, `app/parlays/`, `app/tasks/`,
  `app/feed/`, `app/leaderboard/`, `app/members/`, `app/admin/`, all into
  `app/(app)/`
- Modify: `app/(app)/members/[id]/page.tsx` (one import path)

**Interfaces:**
- Produces: every signed-in route now lives under `app/(app)/`. URLs are
  unchanged: a route group adds nothing to the path. `app/(auth)/` and
  `app/api/` stay where they are.

This is a pure move, so Task 5 can add the group's layout on its own. The
only code change is the one import that hard-codes the old location.
`revalidatePath` calls and `PageProps<'/…'>` types use URLs, not folders,
so they don't change.

- [ ] **Step 1: Move the folders**

```bash
mkdir -p 'app/(app)'
git mv app/page.tsx 'app/(app)/page.tsx'
for d in markets parlays tasks feed leaderboard members admin; do
  git mv "app/$d" "app/(app)/$d"
done
ls app 'app/(app)'
```

Expected: `app/` holds `(app)`, `(auth)`, `api`, `globals.css` and
`layout.tsx`. `app/(app)/` holds `page.tsx` plus the seven folders.

- [ ] **Step 2: Fix the one import that names the old folder**

In `app/(app)/members/[id]/page.tsx`, change:

```typescript
import { FeedList } from '@/app/feed/feed-list'
```

to:

```typescript
import { FeedList } from '@/app/(app)/feed/feed-list'
```

Then confirm nothing else imports from a moved folder:

```bash
grep -rn "from '@/app/" app lib components tests e2e
```

Expected: only the line you just changed.

- [ ] **Step 3: Verify every route still works**

Run: `npm run lint && npx vitest run && npm run build`
Expected: all PASS. The route table is unchanged: `/`, `/markets`,
`/markets/[id]`, `/markets/new`, `/parlays`, `/tasks`, `/feed`,
`/leaderboard`, `/members/[id]`, `/admin/*`, `/sign-in`, `/not-invited`
and `/api/cron/keep-alive`.

Then run the browser suite, which exercises the real URLs:

Run: `lsof -ti:3000 | xargs -r kill 2>/dev/null; npx playwright test`
Expected: 9/9 PASS

- [ ] **Step 4: Commit**

```bash
git add -A app
git commit -m "Move signed-in pages into an (app) route group"
```

---

## Task 5: `AppNav`, the `(app)` layout and the theme toggle

**Files:**
- Create: `components/app-nav/nav-items.ts`
- Create: `components/app-nav/theme-toggle.tsx`
- Create: `components/app-nav/app-nav.tsx`
- Create: `app/(app)/layout.tsx`
- Modify, removing each page's own app-level link row:
  - `app/(app)/feed/page.tsx`
  - `app/(app)/leaderboard/page.tsx`
  - `app/(app)/members/[id]/page.tsx`
  - `app/(app)/parlays/page.tsx`
- Modify, so the nav's balance and slip count refresh:
  - `lib/markets/place-bet.ts`
  - `lib/markets/resolve-market.ts`
  - `lib/markets/void-market.ts`
  - `lib/parlays/place-parlay.ts`
  - `lib/parlays/slip-actions.ts`
  - `lib/tasks/review-task-completion.ts`
  - `lib/members/adjust-balance.ts`
- Test:
  - `tests/components/nav-items.test.ts`
  - `tests/components/app-nav.test.tsx`
  - `tests/components/theme-toggle.test.tsx`

**Interfaces:**
- Consumes:
  - `Wordmark` (Task 2)
  - `setThemeAction(value: string)` (Task 1)
  - the `dark:` variant and token utilities (Task 1)
  - `requireUser()` (`lib/auth/require-user`) and
    `isAdmin(supabase)` (`lib/auth/is-admin`)
  - `readSlip(): Promise<string[]>` (`lib/parlays/slip`)
- Produces:
  - from `components/app-nav/nav-items.ts`:
    - `type NavId = 'home' | 'markets' | 'parlays' | 'tasks' | 'feed' | 'leaderboard' | 'admin'`
    - `NAV_ITEMS: { id: NavId; href: string; label: string; shortLabel: string }[]`
    - `ADMIN_HREF = '/admin/invites'`
    - `activeNavId(pathname: string): NavId | null`
  - `ThemeToggle()` from `components/app-nav/theme-toggle.tsx`
  - `AppNav({ balance, slipCount, isAdmin }: { balance: number; slipCount: number; isAdmin: boolean })`
    from `components/app-nav/app-nav.tsx`

**How it fits together:**
- The layout is a Server Component. `AppNav` is a Client Component, because
  it needs `usePathname()` for the active item.
- Both navs are in the DOM, and CSS shows one per breakpoint (`md` =
  768px). Hidden elements drop out of accessibility queries, so tests at
  either width see exactly one "Primary" navigation.
- Layouts persist across client navigations, so the nav's balance and slip
  count would go stale after a bet or a slip change.
  `revalidatePath('/', 'layout')` purges the client cache, including
  layouts (`node_modules/next/dist/docs/01-app/03-api-reference/04-functions/revalidatePath.md`,
  "Revalidating all data"). Every action that can change a balance or the
  slip therefore calls it in place of its narrower paths.
- The home page's links stay: in the mockup they're content tiles, which
  PR B restyles. The admin pages' section links (Invites / Tasks / Members
  / Ledger) and the markets page's "New market" link also stay; they're
  page content, not app navigation.

- [ ] **Step 1: Write `tests/components/nav-items.test.ts` (will fail — the module doesn't exist yet)**

```typescript
import { describe, it, expect } from 'vitest'
import { activeNavId, NAV_ITEMS } from '@/components/app-nav/nav-items'

describe('activeNavId', () => {
  it('matches home exactly', () => {
    expect(activeNavId('/')).toBe('home')
  })

  it('matches each section and anything beneath it', () => {
    expect(activeNavId('/markets')).toBe('markets')
    expect(activeNavId('/markets/new')).toBe('markets')
    expect(activeNavId('/markets/3f2a')).toBe('markets')
    expect(activeNavId('/parlays')).toBe('parlays')
    expect(activeNavId('/tasks')).toBe('tasks')
    expect(activeNavId('/feed')).toBe('feed')
    expect(activeNavId('/leaderboard')).toBe('leaderboard')
    expect(activeNavId('/admin/ledger')).toBe('admin')
  })

  it('treats a member profile as part of the leaderboard', () => {
    expect(activeNavId('/members/3f2a')).toBe('leaderboard')
  })

  it('matches nothing for other paths', () => {
    expect(activeNavId('/sign-in')).toBeNull()
    expect(activeNavId('/marketsx')).toBeNull()
  })
})

describe('NAV_ITEMS', () => {
  it('lists the six destinations in order, with the short Leaderboard label', () => {
    expect(NAV_ITEMS.map((i) => [i.label, i.shortLabel, i.href])).toEqual([
      ['Home', 'Home', '/'],
      ['Markets', 'Markets', '/markets'],
      ['Parlays', 'Parlays', '/parlays'],
      ['Tasks', 'Tasks', '/tasks'],
      ['Feed', 'Feed', '/feed'],
      ['Leaderboard', 'Leaders', '/leaderboard'],
    ])
  })
})
```

- [ ] **Step 2: Write `tests/components/theme-toggle.test.tsx` (will fail — the module doesn't exist yet)**

```typescript
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const setThemeAction = vi.fn(async (_value: string) => {})
vi.mock('@/lib/theme/set-theme', () => ({ setThemeAction: (value: string) => setThemeAction(value) }))

import { ThemeToggle } from '@/components/app-nav/theme-toggle'

function stubSystemDark(dark: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: dark && query === '(prefers-color-scheme: dark)',
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    onchange: null,
    dispatchEvent: vi.fn(),
  }))
}

beforeEach(() => {
  setThemeAction.mockClear()
  delete document.documentElement.dataset.theme
})

describe('ThemeToggle', () => {
  it('switches from the light system theme to dark, and saves it', async () => {
    stubSystemDark(false)
    render(<ThemeToggle />)
    await userEvent.click(screen.getByRole('button'))
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(setThemeAction).toHaveBeenCalledWith('dark')
  })

  it('switches from the dark system theme to light', async () => {
    stubSystemDark(true)
    render(<ThemeToggle />)
    await userEvent.click(screen.getByRole('button'))
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(setThemeAction).toHaveBeenCalledWith('light')
  })

  it('switches away from a saved choice, whatever the system says', async () => {
    stubSystemDark(false)
    document.documentElement.dataset.theme = 'dark'
    render(<ThemeToggle />)
    await userEvent.click(screen.getByRole('button'))
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(setThemeAction).toHaveBeenCalledWith('light')
  })
})
```

- [ ] **Step 3: Write `tests/components/app-nav.test.tsx` (will fail — the module doesn't exist yet)**

```typescript
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'

let pathname = '/'
vi.mock('next/navigation', () => ({ usePathname: () => pathname }))
vi.mock('@/lib/theme/set-theme', () => ({ setThemeAction: vi.fn() }))

import { AppNav } from '@/components/app-nav/app-nav'

beforeEach(() => {
  pathname = '/'
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    onchange: null,
    dispatchEvent: vi.fn(),
  }))
})

// jsdom applies no CSS, so both the desktop and the phone navs are visible to these queries.
describe('AppNav', () => {
  it('links every destination in both navs', () => {
    render(<AppNav balance={120} slipCount={0} isAdmin={false} />)
    const [desktop, phone] = screen.getAllByRole('navigation', { name: 'Primary' })
    for (const name of ['Home', 'Markets', 'Parlays', 'Tasks', 'Feed', 'Leaderboard']) {
      expect(within(desktop).getByRole('link', { name })).toBeInTheDocument()
      expect(within(phone).getByRole('link', { name })).toBeInTheDocument()
    }
  })

  it('shows the short Leaders label on the phone tab but names it Leaderboard', () => {
    render(<AppNav balance={120} slipCount={0} isAdmin={false} />)
    const phone = screen.getAllByRole('navigation', { name: 'Primary' })[1]
    const tab = within(phone).getByRole('link', { name: 'Leaderboard' })
    expect(tab).toHaveTextContent('Leaders')
  })

  it('names the Parlays link with the slip count, and drops it when the slip is empty', () => {
    const { rerender } = render(<AppNav balance={120} slipCount={2} isAdmin={false} />)
    expect(screen.getAllByRole('link', { name: 'Parlays (2)' })).toHaveLength(2)
    rerender(<AppNav balance={120} slipCount={0} isAdmin={false} />)
    expect(screen.getAllByRole('link', { name: 'Parlays' })).toHaveLength(2)
  })

  it('marks the current section in both navs', () => {
    pathname = '/markets/3f2a'
    render(<AppNav balance={120} slipCount={0} isAdmin={false} />)
    for (const link of screen.getAllByRole('link', { name: 'Markets' })) {
      expect(link).toHaveAttribute('aria-current', 'page')
    }
    for (const link of screen.getAllByRole('link', { name: 'Home' })) {
      expect(link).not.toHaveAttribute('aria-current')
    }
  })

  it('shows Admin only to admins', () => {
    const { rerender } = render(<AppNav balance={120} slipCount={0} isAdmin={false} />)
    expect(screen.queryByRole('link', { name: 'Admin' })).toBeNull()
    rerender(<AppNav balance={120} slipCount={0} isAdmin />)
    const adminLinks = screen.getAllByRole('link', { name: 'Admin' })
    expect(adminLinks.length).toBeGreaterThanOrEqual(2)
    for (const link of adminLinks) expect(link).toHaveAttribute('href', '/admin/invites')
  })

  it('shows the balance without the home page\'s "Balance:" wording', () => {
    render(<AppNav balance={120} slipCount={0} isAdmin={false} />)
    const chips = screen.getAllByText('Balance 120 DC')
    expect(chips.length).toBeGreaterThanOrEqual(2)
    expect(screen.queryByText(/Balance: \d+ DC/)).toBeNull()
  })

  it('offers the wordmark and the theme toggle', () => {
    render(<AppNav balance={120} slipCount={0} isAdmin={false} />)
    expect(screen.getAllByRole('link', { name: 'DwellDuel home' }).length).toBeGreaterThanOrEqual(2)
    expect(screen.getAllByRole('button', { name: /Switch to (dark|light) theme/ }).length).toBeGreaterThanOrEqual(2)
  })
})
```

- [ ] **Step 4: Run the three tests to verify they fail**

Run: `npx vitest run tests/components/nav-items.test.ts tests/components/theme-toggle.test.tsx tests/components/app-nav.test.tsx`
Expected: FAIL with unresolved imports for `@/components/app-nav/...`

- [ ] **Step 5: Write `components/app-nav/nav-items.ts`**

```typescript
export type NavId = 'home' | 'markets' | 'parlays' | 'tasks' | 'feed' | 'leaderboard' | 'admin'

export interface NavItem {
  id: NavId
  href: string
  label: string
  shortLabel: string
}

export const NAV_ITEMS: NavItem[] = [
  { id: 'home', href: '/', label: 'Home', shortLabel: 'Home' },
  { id: 'markets', href: '/markets', label: 'Markets', shortLabel: 'Markets' },
  { id: 'parlays', href: '/parlays', label: 'Parlays', shortLabel: 'Parlays' },
  { id: 'tasks', href: '/tasks', label: 'Tasks', shortLabel: 'Tasks' },
  { id: 'feed', href: '/feed', label: 'Feed', shortLabel: 'Feed' },
  { id: 'leaderboard', href: '/leaderboard', label: 'Leaderboard', shortLabel: 'Leaders' },
]

export const ADMIN_HREF = '/admin/invites'

export function activeNavId(pathname: string): NavId | null {
  if (pathname === '/') return 'home'
  switch (pathname.split('/')[1]) {
    case 'markets':
      return 'markets'
    case 'parlays':
      return 'parlays'
    case 'tasks':
      return 'tasks'
    case 'feed':
      return 'feed'
    case 'leaderboard':
    case 'members':
      return 'leaderboard'
    case 'admin':
      return 'admin'
    default:
      return null
  }
}
```

- [ ] **Step 6: Write `components/app-nav/theme-toggle.tsx`**

Which icon and label show is decided by CSS (the `dark:` variant), not by
state. That way the first server render is already right for both a saved
choice and the system fallback, and it can't flash or mismatch on
hydration.

```typescript
'use client'

import { Moon, Sun } from 'lucide-react'
import { setThemeAction } from '@/lib/theme/set-theme'

function currentTheme(): 'light' | 'dark' {
  const saved = document.documentElement.dataset.theme
  if (saved === 'light' || saved === 'dark') return saved
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function ThemeToggle() {
  function toggle() {
    const next = currentTheme() === 'dark' ? 'light' : 'dark'
    document.documentElement.dataset.theme = next
    void setThemeAction(next)
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className="inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-control text-ink hover:bg-sunk"
    >
      <Moon aria-hidden="true" className="size-[22px] dark:hidden" />
      <Sun aria-hidden="true" className="hidden size-[22px] dark:block" />
      <span className="sr-only dark:hidden">Switch to dark theme</span>
      <span className="sr-only hidden dark:inline">Switch to light theme</span>
    </button>
  )
}
```

In jsdom no CSS applies, so both labels are present and the button's name
is their concatenation. That's why the `AppNav` test matches the toggle
with a regex. In a real browser exactly one label is displayed.

- [ ] **Step 7: Write `components/app-nav/app-nav.tsx`**

```typescript
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { MotionConfig, motion } from 'motion/react'
import { BookOpen, ChartColumn, CircleDot, House, Layers, MessageSquareText, ShieldCheck, Trophy, type LucideIcon } from 'lucide-react'
import { Wordmark } from '@/components/brand/wordmark'
import { cn } from '@/lib/utils'
import { ADMIN_HREF, NAV_ITEMS, activeNavId, type NavId } from './nav-items'
import { ThemeToggle } from './theme-toggle'

const ICONS: Record<NavId, LucideIcon> = {
  home: House,
  markets: ChartColumn,
  parlays: Layers,
  tasks: BookOpen,
  feed: MessageSquareText,
  leaderboard: Trophy,
  admin: ShieldCheck,
}

function SlipCount({ count }: { count: number }) {
  return <span className="sr-only">{` (${count})`}</span>
}

function BalanceChip({ balance }: { balance: number }) {
  return (
    <span className="inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-full bg-gold-soft pr-3 pl-2 text-[15px] font-extrabold tabular-nums text-gold">
      <CircleDot aria-hidden="true" className="size-[18px]" />
      <span className="sr-only">Balance </span>
      {balance} DC
    </span>
  )
}

function DesktopLink({
  href,
  label,
  active,
  count = 0,
  icon: Icon,
}: {
  href: string
  label: string
  active: boolean
  count?: number
  icon?: LucideIcon
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'relative isolate inline-flex min-h-11 items-center gap-2 whitespace-nowrap rounded-full px-3.5 text-[15px] font-bold no-underline',
        active ? 'text-on-primary' : 'text-ink2 hover:bg-sunk hover:text-ink',
      )}
    >
      {active && (
        <motion.span
          layoutId="nav-pill"
          aria-hidden="true"
          className="absolute inset-0 -z-10 rounded-full bg-primary"
          transition={{ type: 'spring', bounce: 0.2, duration: 0.35 }}
        />
      )}
      {Icon && <Icon aria-hidden="true" className="size-[18px]" />}
      {label}
      {count > 0 && (
        <>
          <SlipCount count={count} />
          <span
            aria-hidden="true"
            className="inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-full bg-lime px-1.5 text-xs font-extrabold text-on-lime"
          >
            {count}
          </span>
        </>
      )}
    </Link>
  )
}

export function AppNav({ balance, slipCount, isAdmin }: { balance: number; slipCount: number; isAdmin: boolean }) {
  const active = activeNavId(usePathname())

  return (
    <MotionConfig reducedMotion="user">
      <header className="sticky top-0 z-30 hidden h-[72px] shrink-0 items-center gap-5 border-b border-line bg-surface px-10 md:flex">
        <Wordmark />
        <nav aria-label="Primary" className="flex items-center gap-0.5">
          {NAV_ITEMS.map((item) => (
            <DesktopLink
              key={item.id}
              href={item.href}
              label={item.label}
              active={active === item.id}
              count={item.id === 'parlays' ? slipCount : 0}
            />
          ))}
          {isAdmin && (
            <>
              <span aria-hidden="true" className="mx-1.5 h-6 w-px bg-line" />
              <DesktopLink href={ADMIN_HREF} label="Admin" active={active === 'admin'} icon={ShieldCheck} />
            </>
          )}
        </nav>
        <span className="grow" />
        <BalanceChip balance={balance} />
        <ThemeToggle />
      </header>

      <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-1.5 border-b border-line bg-surface pr-2 pl-3 md:hidden">
        <Wordmark size="sm" />
        <span className="grow" />
        <BalanceChip balance={balance} />
        {isAdmin && (
          <Link
            href={ADMIN_HREF}
            aria-label="Admin"
            aria-current={active === 'admin' ? 'page' : undefined}
            className={cn(
              'inline-flex size-11 shrink-0 items-center justify-center rounded-control no-underline',
              active === 'admin' ? 'bg-lime text-on-lime' : 'text-ink hover:bg-sunk',
            )}
          >
            <ShieldCheck aria-hidden="true" className="size-[22px]" />
          </Link>
        )}
        <ThemeToggle />
      </header>

      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-6 gap-0.5 border-t border-line bg-surface px-1 pt-1.5 pb-[max(12px,env(safe-area-inset-bottom))] md:hidden"
      >
        {NAV_ITEMS.map((item) => {
          const Icon = ICONS[item.id]
          const isActive = active === item.id
          const count = item.id === 'parlays' ? slipCount : 0
          return (
            <Link
              key={item.id}
              href={item.href}
              aria-current={isActive ? 'page' : undefined}
              aria-label={item.shortLabel === item.label ? undefined : item.label}
              className={cn(
                'flex min-h-14 flex-col items-center justify-center gap-[3px] rounded-[14px] text-xs leading-[1.1] no-underline',
                isActive ? 'font-extrabold text-ink' : 'font-bold text-ink2',
              )}
            >
              <span
                className={cn(
                  'relative flex h-[30px] w-[52px] items-center justify-center rounded-full',
                  isActive && 'bg-lime text-on-lime',
                )}
              >
                <Icon aria-hidden="true" className="size-[22px]" />
                {count > 0 && (
                  <span
                    aria-hidden="true"
                    className="absolute -top-1.5 right-0.5 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-surface bg-primary px-[5px] text-[11px] font-extrabold text-on-primary"
                  >
                    {count}
                  </span>
                )}
              </span>
              <span>
                {item.shortLabel}
                {count > 0 && <SlipCount count={count} />}
              </span>
            </Link>
          )
        })}
      </nav>
    </MotionConfig>
  )
}
```

- [ ] **Step 8: Run the three tests to verify they pass**

Run: `npx vitest run tests/components/nav-items.test.ts tests/components/theme-toggle.test.tsx tests/components/app-nav.test.tsx`
Expected: PASS (5 + 3 + 7 = 15 tests)

- [ ] **Step 9: Write `app/(app)/layout.tsx`**

```typescript
import type { ReactNode } from 'react'
import { requireUser } from '@/lib/auth/require-user'
import { isAdmin } from '@/lib/auth/is-admin'
import { readSlip } from '@/lib/parlays/slip'
import { AppNav } from '@/components/app-nav/app-nav'

export default async function SignedInLayout({ children }: { children: ReactNode }) {
  const { supabase, user } = await requireUser()
  if (!user) return children

  const { data: profile, error } = await supabase.from('profiles').select('balance').eq('id', user.id).maybeSingle()
  if (error) throw error
  if (!profile) return children

  const [admin, slip] = await Promise.all([isAdmin(supabase), readSlip()])

  return (
    <>
      <AppNav balance={profile.balance} slipCount={slip.length} isAdmin={admin} />
      <div className="flex flex-1 flex-col pb-[calc(82px+env(safe-area-inset-bottom))] md:pb-0">{children}</div>
    </>
  )
}
```

A signed-out or uninvited visitor gets the page without the nav. Each page
already redirects those visitors itself, which is unchanged. The bottom
padding keeps page content clear of the fixed phone tab bar.

- [ ] **Step 10: Remove each page's own app-level link row**

- **`app/(app)/feed/page.tsx`:** delete the whole
  `<div className="mt-2 flex gap-4">…</div>` holding the Home and
  Leaderboard links. Then delete the now-unused `import Link from 'next/link'`.
- **`app/(app)/leaderboard/page.tsx`:** delete the
  `<div className="mt-2 flex gap-4">…</div>` holding the Home and Feed links.
  Keep `Link`, which still renders each member's name.
- **`app/(app)/members/[id]/page.tsx`:** delete the
  `<div className="mt-2 flex gap-4">…</div>` holding the Leaderboard and Feed
  links, then delete the now-unused `import Link from 'next/link'`.
- **`app/(app)/parlays/page.tsx`:** delete the
  `<Link href="/markets" className="text-sm underline">Markets</Link>`
  directly under the `<h1>`. Keep `Link`, which still links each slip pick
  to its market.

Leave the home page's links, the admin pages' section links and the
markets page's "New market" link as they are.

- [ ] **Step 11: Revalidate the layout in every action that can change a balance or the slip**

In each place below, replace the listed `revalidatePath(...)` calls with
the single line shown, keeping it at the same point in the function. Leave
every other action alone: `submit`, `reject`, bulk reject, create/update
task, the invites actions and `createMarket`.

```typescript
  // Refreshes the shared layout too, so the nav's balance and slip count stay current.
  revalidatePath('/', 'layout')
```

| File | Function | Calls replaced |
|---|---|---|
| `lib/markets/place-bet.ts` | `placeBetAction` | `revalidatePath(\`/markets/${marketId}\`)` |
| `lib/markets/resolve-market.ts` | `resolveMarketAction` | both calls (`/markets/${marketId}` and `/parlays`) |
| `lib/markets/void-market.ts` | `voidMarketAction` | both calls (`/markets/${marketId}` and `/parlays`) |
| `lib/parlays/place-parlay.ts` | `placeParlayAction` | both calls (`/parlays` and `/`) |
| `lib/parlays/slip-actions.ts` | `addToSlipAction` | both calls (`/markets/${newMarketId}` and `/parlays`) |
| `lib/parlays/slip-actions.ts` | `removeFromSlipAction` | both calls (`/markets/[id]`, `'page'` and `/parlays`) |
| `lib/tasks/review-task-completion.ts` | `approveTaskCompletionAction` | its `revalidatePath('/admin/tasks')` |
| `lib/tasks/review-task-completion.ts` | `bulkApproveTaskCompletionsAction` | its `revalidatePath('/admin/tasks')` |
| `lib/members/adjust-balance.ts` | `adjustBalanceAction` | `revalidatePath('/admin/members')` |

In `lib/parlays/place-parlay.ts` both calls sit together directly after
`await writeSlip([])`, and the replacement stays right there. That ordering
is the earlier Task 6 fix. In `slip-actions.ts` the comment goes once per
function.

- [ ] **Step 12: Verify**

Run: `npm run lint && npx vitest run && npm run build`
Expected: all PASS

Run: `lsof -ti:3000 | xargs -r kill 2>/dev/null; npx playwright test`
Expected: 9/9 PASS. Every existing e2e test runs at Playwright's desktop
viewport, so they see the top bar, and none of them relied on a removed
link.

- [ ] **Step 13: Commit**

```bash
git add components/app-nav 'app/(app)/layout.tsx' 'app/(app)/feed/page.tsx' 'app/(app)/leaderboard/page.tsx' 'app/(app)/members/[id]/page.tsx' 'app/(app)/parlays/page.tsx' lib/markets lib/parlays lib/tasks/review-task-completion.ts lib/members/adjust-balance.ts tests/components/nav-items.test.ts tests/components/theme-toggle.test.tsx tests/components/app-nav.test.tsx
git commit -m "Add the shared AppNav: desktop top bar, phone tab bar, theme toggle"
```

---

## Task 6: End-to-end tests and CI-version verification

**Files:**
- Create: `e2e/app-nav.spec.ts`

**Interfaces:**
- Consumes:
  - the seeded, admin-promoted session from `e2e/global-setup.ts`
  - Task 5's navs: "Primary" navigations; links named Home, Markets,
    Parlays, Tasks, Feed, Leaderboard and Admin; `aria-current="page"`;
    the phone "Admin" icon link
  - the balance chip reading "Balance {n} DC"
  - the "Switch to dark theme" / "Switch to light theme" toggle
- Uses: the root layout's `data-theme` attribute and the `theme` cookie
  (Task 1)

This spec changes no data, so its position in the serial suite doesn't
matter. It's named `app-nav.spec.ts`, so it runs first. Each test gets a
fresh browser context, so the theme cookie can't leak into other specs.

- [ ] **Step 1: Write `e2e/app-nav.spec.ts`**

```typescript
import { test, expect } from '@playwright/test'

test.describe('desktop', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('the top bar reaches every destination and marks the current one', async ({ page }) => {
    await page.goto('/')
    const nav = page.getByRole('navigation', { name: 'Primary' })
    for (const name of ['Home', 'Markets', 'Parlays', 'Tasks', 'Feed', 'Leaderboard', 'Admin']) {
      await expect(nav.getByRole('link', { name, exact: true })).toBeVisible()
    }
    await expect(page.getByRole('banner').getByText(/^Balance \d+ DC$/)).toBeVisible()

    await nav.getByRole('link', { name: 'Markets', exact: true }).click()
    await expect(page).toHaveURL(/\/markets$/)
    await expect(nav.getByRole('link', { name: 'Markets', exact: true })).toHaveAttribute('aria-current', 'page')
  })
})

test.describe('phone', () => {
  test.use({ viewport: { width: 375, height: 812 } })

  test('the tab bar and top bar reach every destination', async ({ page }) => {
    await page.goto('/')
    const tabs = page.getByRole('navigation', { name: 'Primary' })
    for (const name of ['Home', 'Markets', 'Parlays', 'Tasks', 'Feed', 'Leaderboard']) {
      await expect(tabs.getByRole('link', { name, exact: true })).toBeVisible()
    }
    await expect(page.getByRole('banner').getByRole('link', { name: 'Admin', exact: true })).toBeVisible()

    await tabs.getByRole('link', { name: 'Leaderboard', exact: true }).click()
    await expect(page).toHaveURL(/\/leaderboard$/)
    await expect(tabs.getByRole('link', { name: 'Leaderboard', exact: true })).toHaveAttribute('aria-current', 'page')
  })
})

test('the theme toggle switches the theme and remembers it after a reload', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await page.goto('/')
  const html = page.locator('html')
  await expect(html).not.toHaveAttribute('data-theme', /./)

  await page.getByRole('banner').getByRole('button', { name: 'Switch to dark theme' }).click()
  await expect(html).toHaveAttribute('data-theme', 'dark')
  await expect
    .poll(async () => (await page.context().cookies()).find((c) => c.name === 'theme')?.value)
    .toBe('dark')

  await page.reload()
  await expect(html).toHaveAttribute('data-theme', 'dark')
  await expect(page.getByRole('banner').getByRole('button', { name: 'Switch to light theme' })).toBeVisible()
})
```

- [ ] **Step 2: Run the e2e suite**

Run: `npm run db:reset && (lsof -ti:3000 | xargs -r kill 2>/dev/null); npx playwright test`
Expected: PASS. That's these 3 new tests plus the 9 existing ones, 12 total.

- [ ] **Step 3: Verify the full chain against the exact Supabase CLI version CI pins**

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

- [ ] **Step 4: Commit**

```bash
git add e2e/app-nav.spec.ts
git commit -m "Add e2e tests: responsive nav and a persistent theme toggle"
```

---

## Self-Review

**Spec coverage (PR A section of the spec):**
- Tokens: the handoff's set plus the mockup extras, with `--s5`/`--s6` → Task 1 ✓
- System-dark fallback, the `dark` variant covering both cases, and the focus ring → Task 1 ✓
- Manrope replacing Geist, with the forced Arial removed → Task 1 ✓
- The theme cookie read on the server, with no flash, written by a server action → Tasks 1 and 5 ✓
- Wordmark with the brand colours; favicons, manifest and OG image copied into `public/`; `<head>` metadata → Task 2 ✓
- The `app/(app)/` route group, with URLs unchanged → Task 4 ✓
- `AppNav`, meaning:
  - desktop top bar, phone top bar and bottom tab bar
  - active pill using motion `layoutId`
  - balance chip, admins-only entry, slip count with the "Parlays (n)" name, and the "Leaders"/Leaderboard label

  → Task 5 ✓
- Per-page link rows replaced → Task 5 Step 10 ✓. The home tiles, admin section links and "New market" stay as content, per the mockup.
- Button, Field (with Input/Textarea/native Select), Card, StatusChip and Message → Task 3 ✓
- Native controls kept native → Task 3 `Select` test ✓
- Page bodies not restyled, and no charts, NumberFlow, toasts or drawer → nothing in any task ✓
- E2E coverage, as the spec's Testing section requires: the nav reachable at phone and desktop widths, and the theme toggle persisting across a reload → Task 6 ✓
- Unit coverage: the theme-cookie resolution → Task 1 ✓. Nav matching and the components → Tasks 3 and 5 ✓.

**Placeholder scan:** none; every code step has its full code.

**Type consistency:**
- `resolveTheme` and `THEME_COOKIE` (Task 1) are used in the root layout (Task 1) and `setThemeAction` (Task 1).
- `setThemeAction(value: string)` is called by `ThemeToggle` (Task 5).
- `Wordmark` (Task 2) is used by `AppNav` (Task 5).
- `NAV_ITEMS`, `ADMIN_HREF`, `activeNavId` and `NavId` (Task 5) line up across `nav-items.ts`, `app-nav.tsx` and the tests.
- Every token utility used in Tasks 2, 3 and 5 is defined in Task 1's `@theme inline` block.
- `AppNav`'s props (`balance`, `slipCount`, `isAdmin`) match what `app/(app)/layout.tsx` passes.
