# Design System: DwellDuel

Character: a friendly church-group game night, calm and plainly fair, never a casino.

This file is the contract design skills read first (UX Engine's `design-system` skill checks it with
`check-design-md.mjs`; Impeccable reads it too). Every value below is extracted from the code, not
invented: the tokens live in **`app/globals.css`**, the screens and components are described in
**`docs/design/app-redesign-handoff.md`**, and the conventions code must follow are in **`AGENTS.md`**
(UI conventions, Native feel and speed). Where this file and `AGENTS.md` disagree, `AGENTS.md` wins
and this file is fixed in the same PR.

## World

An invite-only prediction market for one church friend group: members bet play-money Dwell Coin on
friendly markets and earn it through Bible-study tasks (`PRODUCT.md`). Most are on an iPhone with the
app on their Home Screen; some are not technical. It should read like a well-made native app a friend
built, not a sportsbook: no urgency, no flashing money.

## Typography

- Family: Manrope 400 to 800 for everything, loaded by `next/font/google` in `app/layout.tsx`
  (`--font-manrope`, falling back to the system UI stack). One geometric-humanist sans keeps a
  money-adjacent app warm rather than financial.
- Scale: the named classes only (`h1Class`, `h2Class`, `rowTitleClass`, body, `uiTextClass`,
  `chipTextClass`, `microTextClass`, caption; figures `figureHeroClass`, `figureClass`,
  `figureInlineClass`). Sizes switch at `md:`. No `text-[Npx]` of your own (the sign-in page and the
  wordmark are the only exceptions).
- Weights: 800 for titles, figures and buttons, 600 to 700 for row titles and labels, 400 to 500 body.
- Numbers: every DC amount goes through `lib/format/dc.ts`; `tabular-nums` only in aligned columns.

## Color

Light and dark are the same markup with different variables. Values are light / dark.

- `--bg` #EBF0E9 / #021B1F, `--surface` #FCFDFB / #07282E, `--sunk` #DFE7DF / #0D343B: a green-tinted
  neutral, so the page and its cards feel like one family with the brand teal. A card is one step
  lighter than the page, with no border and no resting shadow (#441). In light that step is 1.13:1
  (it was 1.07:1, too faint on a phone in sunlight), and `--sunk` sits 1.09:1 below the page and
  1.24:1 below a card, so a hover tint reads on both.
- `--ink` #03272D / #EAF4EE (13.6:1 and 15.8:1 on `--bg`), `--ink2` #46605E / #A3BDB8 (6.65:1 and 7.79:1
  on `--surface`, 5.87:1 on the light `--bg`): deep teal ink instead of black, the brand colour
  carrying all text. A field's placeholder is `--ink2` too.
- `--primary` (the accent for the primary action) #03272D / #72DB2B, with `--on-primary` #FFFFFF /
  #03272D (15.8:1 and 8.9:1). One filled primary per screen.
- `--lime` #72DB2B: the brand. In light it is a fill or the brand mark only (first place, Getting
  started's dots), never text; in dark it is the primary fill and first place.
- `--acc-text` #2A6E0B / #8BE651: positive and open text.
- `--danger` (destructive, lost, No) is `--loss` #A8281C / #FF9585; its hue sits about 177° from the
  light primary and about 90° from lime, so a destructive action never reads as the main one.
- `--gold` #855600 / #F0C15A (waiting, to review) and `--info` #25418C / #B9C8F5 (a result, something
  of yours), each with a `-soft` tint. Counts of what waits on you (the avatar's dot, the admin tab
  badges, the menu's "3 waiting") are gold too, never red: nothing waiting is an error.
- Category chips and avatar initials take a `--tint1` to `--tint6` pair from `tintFor`
  (`lib/ui/tint.ts`), never a status colour (#445). Chart series are `--s1` to `--s6`, a palette
  validated as a set (`tests/lib/ui/contrast.test.ts`).
- `--focus` #03272D / #72DB2B: the focus ring.

## Shape

- Radii: `rounded-segment` 10px (a segment in a segmented control), `rounded-control` 12px (buttons,
  fields, skeleton blocks), `rounded-tile` 14px (list cards, tracks, tiles), `rounded-card` 18px
  (section cards, sheets, dialogs), `rounded-full` (chips, avatars, pills). Never `rounded-[Npx]`.
- Separation language: tone steps, not lines or shadows. Hairlines (`--line` #D5DFD8 / #17434A) stay
  only for dividers inside a card, form fields and tables; only what floats (a sheet, a menu, a
  dialog, a card lifted under the mouse) casts `--overlay-shadow` or `--lift-shadow`. In dark, where
  a soft shadow vanishes, both are a 1px `--line-s` ring plus a deep shadow.

## Spacing

- Base unit: 4px (Tailwind's scale). Common steps: 8px between list cards (`listCardsClass`, `gap-2`),
  14px and 16px inside a list card (`p-3.5`, `md:p-4`), 18px and 24px inside a section card
  (`cardPaddingClass`, `p-[18px] md:p-6`).
- Page widths come from `<Page width>`: `wide` 1120px of content, `reading` about 820px.
- Rhythm: tight inside a group, generous between sections; phone first, multi-column grids at `lg:`.
- Every control is at least 44px tall; an inline title link gets `hit-area` instead of growing.

## States

- Hover: under a mouse only, colour changes and nothing grows. A standalone card lifts onto
  `--lift-shadow` (`hover-lift`); a row inside a card takes `hover-tint`, a flat `--sunk` panel. A
  link underlines on hover.
- Focus: `:focus-visible` draws a 3px `--focus` outline at a 2px offset, everywhere but a menu item
  (`menuItemClass`), whose keyboard highlight is the `--tab-active` tint with an inset 2px `--focus`
  ring; under the mouse it is the tint alone.
- Pressed: `pressable` scales to 0.97 on touch over `--duration-press` (120ms); a pending link dims its card
  (`pendingMarker`).
- Disabled: `bg-sunk` with `text-ink2` and `cursor-not-allowed` (`components/ui/button.tsx`), the
  same for `aria-disabled`.
- Busy: a submit button given a `pendingLabel` shows `LeafLoader` and the words ("Placing…") while its
  action runs, at its settled width, so busy never looks only unavailable.
- Selection: a tappable card's text can't be selected by a long press on touch, and stays selectable
  under a mouse; a button's label never is.

## Status and badges

`StatusChip` tones come only from these pairs (text on tint), light / dark, computed with
`contrast.mjs`:

- open, won: `--acc-text` / `--win` on `--acc-soft` / `--win-soft`, 5.45:1 / 8.18:1
- lost: `--loss` on `--loss-soft`, 5.65:1 / 7.18:1
- waiting, to review (`wait`): `--gold` on `--gold-soft`, 5.15:1 / 7.90:1
- a result, something of yours (`info`): `--info` on `--info-soft`, 8.00:1 / 8.48:1
- done: `--ink` on `--sunk`, 12.49:1 / 11.88:1
- called off (`void`): `--ink2` on `--sunk`, 5.37:1 / 6.70:1
- a count badge (`AttentionBadge`, `AttentionCount`): `--gold-soft` on a solid `--gold`, 5.15:1 / 7.90:1

Never `primary` as a chip tone, and never a state shown by colour alone: every chip carries its word.
A chip appears only when it adds information the context doesn't (#387).

## Motion

- Curves, durations and delays are the `--ease-*`, `--duration-*` and `--delay-*` tokens in
  `app/globals.css`, mirrored by `lib/ui/motion.ts`: press 120ms, fast 150ms, hover 180ms, enter
  210ms, slide 280ms (every sliding pill), page 360ms, sheet 450ms, on `--ease-ios`.
- Reduced motion (the device setting or Settings' choice) turns page transitions into a
  `--duration-fast` cross-fade; animated numbers count only on a change after mount.

## Components

The building blocks are in `components/ui/`; `AGENTS.md` says when each is used.

- Button: `components/ui/button.tsx`, `primary` (filled `--primary`, hover at 88%), `secondary`
  (`--surface` with a `--line-s` border, hover `--sunk`), `danger` (`--loss` outline, hover
  `--loss-soft`) and `quiet` (an underlined text button); sizes `md` 48px and `sm` 44px. A single
  confirming action is `ConfirmActionButton`, a form that asks first uses `ConfirmSubmitDialog`.
- Surfaces: `Page`, `PageHeader`, `SectionCard`, `ListSection`, `ListCard`, divided rows
  (`dividedRowsClass`), `EmptyState`, `ErrorCard`, `SkeletonScreen`.
- Controls: `SegmentedControl` and `SubNav`, native selects and checkboxes, `Field`, `SearchField`,
  `ShowMore`.
- Status: `StatusChip`, `AttentionBadge`, `Avatar`, `Message`.
- Feedback: `Toaster` (Sonner). An error toast goes through `toastError` (`lib/toast/error-toast.ts`) and
  stays 10 seconds, long enough to read its next step; other toasts keep 4.
- Menus: Base UI `Menu` with `menuItemClass` (`components/ui/menu-classes.ts`).

## Voice

- Plain, warm and short, sentence case, verbs on buttons ("Place your first bet", "Approve selected").
- Words we use: pick, submission, To review, created, called off, waiting for a result; a rank reads
  "218th of 502".
- No em or en dashes in what members see; " · " between parts, the phrase after it capitalised.
- Every error says what to do next.
