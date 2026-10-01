# DwellDuel docs

| Doc | What's in it |
|---|---|
| [../README.md](../README.md) | The project at a glance: features, stack, development commands, production setup |
| [GETTING-STARTED.md](GETTING-STARTED.md) | Onboarding: a first-week path, local Supabase and the app, sign-in, tests (including money paths), the PR flow, working as a collaborator, a glossary |
| [HOW-IT-WORKS.md](HOW-IT-WORKS.md) | The rules members play by: odds and payouts (with worked examples), the slip and parlays, results, tasks, roles, limits, and what data the app keeps (the app renders it as How it works) |
| [ADMIN-GUIDE.md](ADMIN-GUIDE.md) | For reviewers, admins and the owner: roles, inviting, creating, resolving, overriding and voiding markets, reviewing tasks, members, balances and the ledger |
| [ARCHITECTURE.md](ARCHITECTURE.md) | How the app fits together: routes, code layout, data model, the functions that move coins, migrations, key flows, environments |
| [OPERATIONS.md](OPERATIONS.md) | Running production: deploys, rollback, backups and restore, rotating secrets, incidents and owner recovery, free-tier limits, scheduled jobs |
| [RELEASING.md](RELEASING.md) | Cutting a release: the changelog, README, tag, GitHub Release and the note to members |
| [design/app-redesign-handoff.md](design/app-redesign-handoff.md) | The visual source of truth: the design canvas, tokens, brand, layouts, navigation and components |
| [../AGENTS.md](../AGENTS.md) | Conventions every change follows (UI, speed, data, testing, migrations) |
| [../CONTRIBUTING.md](../CONTRIBUTING.md) | How changes get in: branches, pull requests and the merge rules |
| [../SECURITY.md](../SECURITY.md) | The security policy: reporting a vulnerability, scope, testing rules and the trust model |
| [../CHANGELOG.md](../CHANGELOG.md) | What shipped in each release |
| [images/](images/) | README screenshots, taken locally with demo data |

## Archive: specs and plans (`archive/superpowers/`)

The early pieces of work were designed before they were built, each as a
spec (the problem, the options weighed and the decision) and an
implementation plan. They're **historical records**: they describe the app
as it was when the work was planned, aren't updated, and name tables,
functions and keys the code has since dropped. Read them for the *why*
behind a decision; for how things work now, read ARCHITECTURE.md and the
code. A root `.ignore` keeps ripgrep-based search out of them.

Every piece of work since issue #19 has been designed in its issue and pull
request instead.

| Date | Work | Spec | Plan |
|---|---|---|---|
| 2026-09-22 | Foundation: sign-in, invites, the coin ledger | [spec](archive/superpowers/specs/2026-09-22-foundation-design.md) | [plan](archive/superpowers/plans/2026-09-22-foundation.md) |
| 2026-09-22 | Market engine | [spec](archive/superpowers/specs/2026-09-22-market-engine-design.md) | [plan](archive/superpowers/plans/2026-09-22-market-engine.md) |
| 2026-09-23 | Coin economy: tasks | [spec](archive/superpowers/specs/2026-09-23-coin-economy-design.md) | [plan](archive/superpowers/plans/2026-09-23-coin-economy.md) |
| 2026-09-24 | Admin controls | [spec](archive/superpowers/specs/2026-09-24-admin-controls-design.md) | [plan](archive/superpowers/plans/2026-09-24-admin-controls.md) |
| 2026-09-25 | Parlays | [spec](archive/superpowers/specs/2026-09-25-parlays-design.md) | [plan](archive/superpowers/plans/2026-09-25-parlays.md) |
| 2026-09-25 | Social layer | [spec](archive/superpowers/specs/2026-09-25-social-layer-design.md) | [plan](archive/superpowers/plans/2026-09-25-social-layer.md) |
| 2026-09-25 | Design pass A–C | [spec](archive/superpowers/specs/2026-09-25-design-pass-design.md) | [A](archive/superpowers/plans/2026-09-25-design-pass-a-foundation.md) · [B](archive/superpowers/plans/2026-09-25-design-pass-b-screens.md) · [C](archive/superpowers/plans/2026-09-25-design-pass-c-charts-polish.md) |
| 2026-09-26 | Native feel | [spec](archive/superpowers/specs/2026-09-26-native-feel-design.md) | [plan](archive/superpowers/plans/2026-09-26-native-feel.md) |
| 2026-09-26 | Data layer and scale | [spec](archive/superpowers/specs/2026-09-26-data-layer-scale-design.md) | [plan](archive/superpowers/plans/2026-09-26-data-layer-scale.md) |
| 2026-09-27 | Activity events and sparklines | [spec](archive/superpowers/specs/2026-09-27-activity-events-and-sparklines-design.md) | [plan](archive/superpowers/plans/2026-09-27-activity-events-and-sparklines.md) |
| 2026-09-27 | Beta readiness | [spec](archive/superpowers/specs/2026-09-27-beta-readiness-design.md) | [plan](archive/superpowers/plans/2026-09-27-beta-readiness.md) |
| 2026-09-27 | Post-beta cleanup | [spec](archive/superpowers/specs/2026-09-27-post-beta-cleanup-design.md) | [plan](archive/superpowers/plans/2026-09-27-post-beta-cleanup.md) |
