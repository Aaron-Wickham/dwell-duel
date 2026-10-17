# DwellDuel: product context

For design tools and skills (Impeccable reads this file). The rules members see are in
`docs/HOW-IT-WORKS.md`; how the app is built is in `docs/ARCHITECTURE.md`.

## What it is

An invite-only prediction market for a church friend group. Members bet play-money Dwell Coin
(DC) on friendly markets ("Will the youth group win the softball final?") and earn DC through
Bible-study tasks a reviewer approves. DC has no cash value.

## Who uses it

About 50 to a few hundred members of one church community, most on an iPhone, many with the app
installed to the Home Screen. A handful of admins and reviewers resolve markets and approve
tasks. Members range from keen bettors to people who only do the study tasks, and some are not
technical.

## What it must feel like

- Friendly, not a casino: no urgency, no flashing money, nothing that reads as real gambling.
- Native and quick on a phone first, then good on a computer.
- Calm and readable: a member should see their balance, what needs them and their bets at a
  glance, and add a pick in one or two taps.
- Trustworthy: results, payouts and who resolved what are always visible and plain.

## Constraints

- Phone first (390px), desktop second (1280px); both themes, light and dark.
- WCAG AA contrast, 44px controls, VoiceOver-usable.
- Free tiers (Vercel, Supabase, GitHub), so no heavy client libraries or per-view server cost.
- The conventions in `AGENTS.md` win over any generic design advice.
