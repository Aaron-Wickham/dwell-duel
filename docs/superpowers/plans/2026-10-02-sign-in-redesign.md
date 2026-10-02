# Sign-in redesign (#329) — implementation plan

Binding design: the "Design approved (2026-10-02)" comment on #329 and the
`P1002-SignIn*` / `P1002-NotInvited*` boards it names.

## Files

- `components/brand/wordmark.tsx`: export `WordmarkName` (the two-colour
  name), shared by the nav's `Wordmark` and the sign-in frame's static mark.
- `components/sign-in/intro-timeline.ts`: the hero's timeline (ms from the
  first frame) and the sample market's data, one source for script and CSS.
- `components/sign-in/sign-in-frame.tsx` (server): the shared frame for
  `/sign-in` and `/not-invited` — the static wordmark top-left, the sample
  card and the page's copy, one column on a phone, split at `lg:`.
- `components/sign-in/sample-market.tsx` (client): the hard-coded sample
  `MarketCard` look (Open + Church chips, "Sample"), a plain-SVG step-line
  chart in `MarketSparkline`'s style with end labels, and Yes/No through
  `AnimatedNumber` (54% → 61% during the intro, 61% otherwise). `dimmed`
  for `/not-invited`.
- `components/sign-in/sign-in-intro.tsx`: the inline pre-paint script that
  sets `data-sign-in-intro` on `<html>` once per session unless motion is
  reduced, the centred symbol overlay (the launch screen's leaves), and a
  client `IntroDirector` that flies the symbol into the wordmark (WAAPI,
  `DURATION`/`cssEase`) and clears the attribute when the intro ends.
- `app/globals.css`: a "Sign-in intro" block of keyframes on the motion
  tokens, scoped to `:root[data-sign-in-intro]`, plus a `short` variant
  (`max-height: 667px` below `lg:`) that drops the chart axes, lede and facts.
- `app/(auth)/sign-in/page.tsx`, `app/(auth)/not-invited/page.tsx`: rebuilt
  on the frame. Google sign-in, errors and `next` untouched.
- Docs: handoff-doc "Sign in" section, CHANGELOG line.

## Tests

- `tests/components/sign-in-page.test.tsx`, `public-pages.test.tsx`: new
  h1, lede, three facts, invite hint, Privacy, sample market labelled as a
  sample, Google button unchanged.
- `tests/components/not-invited-page.test.tsx`: gold notice, new h1,
  "Try another account" keeps `next`.
- `tests/components/sign-in-intro.test.tsx`: the script skips under reduced
  motion and once played; the sample shows 61% on its final frame.
- `e2e/signed-out.spec.ts`: update copy assertions; check the short-phone
  layout keeps the button above the fold at 375×667.
- Motion test already fails on any stray `cubic-bezier`.
