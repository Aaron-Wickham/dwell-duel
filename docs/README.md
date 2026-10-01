# DwellDuel docs

| Doc | What's in it |
|---|---|
| [GETTING-STARTED.md](GETTING-STARTED.md) | Onboarding: install the tools, run local Supabase and the app, sign in, run the tests, ship a PR |
| [HOW-IT-WORKS.md](HOW-IT-WORKS.md) | The rules members play by: odds and payouts (with worked examples), the slip and parlays, results, tasks, roles |
| [OPERATIONS.md](OPERATIONS.md) | Running production: how deploys work, the nightly encrypted backups, restoring the database or Storage, rolling back the app |
| [ARCHITECTURE.md](ARCHITECTURE.md) | How the app fits together: routes, code layout, data model, the functions that move coins, migrations, key flows, environments |
| [design/app-redesign-handoff.md](design/app-redesign-handoff.md) | The visual source of truth: the design canvas, tokens, brand, navigation and components |
| [../AGENTS.md](../AGENTS.md) | Conventions every change follows (UI, speed, data, testing, migrations) |
| [../CHANGELOG.md](../CHANGELOG.md) | What shipped in each release |
| [images/](images/) | README screenshots, taken locally with demo data |

## Specs and plans (`superpowers/`)

Each larger piece of work was designed before it was built:

- **`superpowers/specs/`** holds the approved design for a piece of work:
  the problem, the options weighed and the decision.
- **`superpowers/plans/`** holds the step-by-step implementation plan that
  followed from it.

Both are dated and are **historical records**: they describe the app as it
was when the work was planned, and they aren't updated afterwards. For how
things work now, read ARCHITECTURE.md and the code. The work tracked as
GitHub issues (#19–#51) was designed in its issue and pull request instead.

| Date | Work | Spec | Plan |
|---|---|---|---|
| 2026-09-22 | Foundation: sign-in, invites, the coin ledger | [spec](superpowers/specs/2026-09-22-foundation-design.md) | [plan](superpowers/plans/2026-09-22-foundation.md) |
| 2026-09-22 | Market engine | [spec](superpowers/specs/2026-09-22-market-engine-design.md) | [plan](superpowers/plans/2026-09-22-market-engine.md) |
| 2026-09-23 | Coin economy: tasks | [spec](superpowers/specs/2026-09-23-coin-economy-design.md) | [plan](superpowers/plans/2026-09-23-coin-economy.md) |
| 2026-09-24 | Admin controls | [spec](superpowers/specs/2026-09-24-admin-controls-design.md) | [plan](superpowers/plans/2026-09-24-admin-controls.md) |
| 2026-09-25 | Parlays | [spec](superpowers/specs/2026-09-25-parlays-design.md) | [plan](superpowers/plans/2026-09-25-parlays.md) |
| 2026-09-25 | Social layer | [spec](superpowers/specs/2026-09-25-social-layer-design.md) | [plan](superpowers/plans/2026-09-25-social-layer.md) |
| 2026-09-25 | Design pass A–C | [spec](superpowers/specs/2026-09-25-design-pass-design.md) | [A](superpowers/plans/2026-09-25-design-pass-a-foundation.md) · [B](superpowers/plans/2026-09-25-design-pass-b-screens.md) · [C](superpowers/plans/2026-09-25-design-pass-c-charts-polish.md) |
| 2026-09-26 | Native feel | [spec](superpowers/specs/2026-09-26-native-feel-design.md) | [plan](superpowers/plans/2026-09-26-native-feel.md) |
| 2026-09-26 | Data layer and scale | [spec](superpowers/specs/2026-09-26-data-layer-scale-design.md) | [plan](superpowers/plans/2026-09-26-data-layer-scale.md) |
| 2026-09-27 | Activity events and sparklines | [spec](superpowers/specs/2026-09-27-activity-events-and-sparklines-design.md) | [plan](superpowers/plans/2026-09-27-activity-events-and-sparklines.md) |
| 2026-09-27 | Beta readiness | [spec](superpowers/specs/2026-09-27-beta-readiness-design.md) | [plan](superpowers/plans/2026-09-27-beta-readiness.md) |
| 2026-09-27 | Post-beta cleanup | [spec](superpowers/specs/2026-09-27-post-beta-cleanup-design.md) | [plan](superpowers/plans/2026-09-27-post-beta-cleanup.md) |
