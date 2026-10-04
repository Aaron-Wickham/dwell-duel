# Security policy

DwellDuel is an invite-only app for a church friend group. It uses play
money, but it holds members' names, Google email addresses, photos and
activity, so security reports are welcome and taken seriously.

## Supported versions

Only what is running now: production at
[www.dwellduel.com](https://www.dwellduel.com) and the `main` branch, which
deploys to it on every merge. Older tags and releases aren't patched;
a fix lands on `main` and deploys from there.

## Reporting a vulnerability

**Please don't open a public issue, discussion or pull request for a
vulnerability.** Report it privately through GitHub: this repository's
**Security** tab → **Report a vulnerability** (private vulnerability
reporting is on). Only the maintainer sees it.

Include what you can of:

- what the problem is and what an attacker could do with it;
- the steps to reproduce it, against a local copy (see below);
- the files, routes, functions or migrations involved;
- whether you think anyone has used it.

### What to expect

- An acknowledgement within **3 days**.
- A fix, or a plan with a timeline, within **14 days** of confirming it.
- Updates in the advisory as it moves, and credit in the advisory and the
  changelog if you'd like it.

DwellDuel is maintained by one person in their spare time, so these are
targets, not guarantees; a serious issue gets dropped-everything attention.

## Scope

**In scope:**

- the app in this repository: its pages, server actions and API routes
  (`app/`, `lib/`, `proxy.ts`);
- the database: row-level security policies, the Postgres functions
  (RPCs) and grants in `supabase/migrations/`, and the Storage bucket
  policies;
- authentication and the invite gate;
- the GitHub Actions workflows in `.github/workflows/` and anything that
  could expose their secrets;
- the service worker and push notifications (`public/sw.js`, `lib/push/`);
- secrets committed to the repository.

**Out of scope:**

- Supabase, Vercel, Google, GitHub, Sentry, UptimeRobot, healthchecks.io and
  the browsers' push services themselves; report those to their owners;
- denial of service, load testing, and anything that relies on
  overwhelming the free-tier limits;
- social engineering of members or the maintainer, and physical attacks;
- findings that need a compromised device, browser or Google account;
- missing hardening with no demonstrable impact (for example a header
  that isn't set but whose absence can't be exploited);
- the play-money economy's balance, unless a bug lets someone move coins
  outside the rules.

## Rules for testing

- **Test against your own local copy.** Local Supabase runs in Docker and
  is a complete copy of the backend with none of the real data:
  [docs/GETTING-STARTED.md](docs/GETTING-STARTED.md) sets it up in about
  half an hour.
- **Never test against production** (www.dwellduel.com or its Supabase
  project): don't use or create real members' accounts, don't read, change
  or delete their data, and don't run automated scanners against it.
- If you come across real members' data by accident, stop, don't keep or
  share it, and say so in your report.

## Safe harbour

If you act in good faith under these rules (test locally, report
privately, give a reasonable time to fix before telling anyone else, and
don't access or keep members' data), the maintainer won't pursue or
support any action against you for your research, and will work with you
to understand and fix the problem.

## The security model

### Members and roles

- **Sign-in** is Google only, and only for an email on the invite list.
  Supabase Auth has every other provider and email sign-up turned off.
  Sessions are signed with an ES256 key and verified locally; the legacy
  shared-secret keys are disabled.
- **Roles** are owner › admin › reviewer › member (`profiles.role`), and a
  role counts only while its account is invited, so removing someone's
  invite removes their powers at once. What each role can do is in
  [docs/HOW-IT-WORKS.md](docs/HOW-IT-WORKS.md#roles) and
  [docs/ADMIN-GUIDE.md](docs/ADMIN-GUIDE.md). Balances, roles, removing
  members and deleting are the single owner's alone.
- **Every table has row-level security.** Members read what the app shows
  them; other members' email addresses are readable by admins only.
- **Everything that moves coins** (bets, results, voids, task rewards,
  balance adjustments) is one permission-checked `security definer`
  Postgres function, which checks its caller, locks what it changes and
  writes the ledger in one transaction. The app never updates a balance
  itself. A schema test fails on any new definer function a signed-in
  account can call that hasn't been reviewed.
- **The service-role (secret) key** exists only on the server, in
  Vercel's Production environment, and is used only by the cron routes,
  the health check and push sending. Nothing in the browser holds it.
  Production's default privileges gave that role no table rights; 0109
  grants it read and write on every `public` table and makes that the
  default for new ones.

### What a collaborator with write access can and can't do

- **Can:** push branches, open and review pull requests, and run
  workflows. CI on a pull request uses no secrets.
- **Can't merge alone.** `main` takes changes only through a pull request
  with the code owner's approval (a new push dismisses it), every
  conversation resolved, the branch up to date with `main`, and the
  `ci-ok` check green. `ci-ok` has no bypass for anyone.
- **Can't deploy or reach production's secrets.** Deploy Production and
  the Backups workflow run only from `main`, and their secrets (Supabase
  access token and database URL, the Vercel deploy hook and token, the
  backup encryption recipient and backup-repository token) live in the
  GitHub `Production` environment, which only `main` can deploy to. A
  workflow on another branch can't read them.
- **Branch workflows and the one repository-level secret.** A write
  collaborator can run workflows from their own branch, which can read
  repository-level secrets. There is one, `CRON_SECRET`, kept there by
  design so the Closing alerts backup can run on its schedule. It only
  authorizes the two cron endpoints, which are idempotent: calling them
  sends nothing that wasn't already due and reads no member data back.
  It's rotated whenever the set of people with write access changes.
- **No production data access.** Collaborators don't get the Supabase or
  Vercel dashboards, the production database or members' data. AI agents
  the owner runs are the exception: see below.

### AI agents

Claude Code sessions the owner runs act with his logins: the Supabase CLI
linked to production, the `supabase-prod-readonly` MCP server (`.mcp.json`:
read-only, scoped to the production project), and his account-wide
Supabase, Vercel, Sentry and UptimeRobot connectors. The checked-in
`.claude/settings.json` refuses `supabase db push`, `git push origin main`,
the Supabase connector's write tools, the Vercel connector's irreversible
ones (deleting or pausing the project, environment variables, domains,
firewall and protection settings, API keys, purchases) and the UptimeRobot
connector's deletes, and
`.claude/hooks/protect-migrations.sh` refuses an edit to a migration already
on `origin/main`.

These are guard rails against mistakes, not a security boundary. They match
command prefixes and tool names; the connector rules name the owner's own
connector, so they mean nothing in anyone else's session; and they don't
cover `supabase db query --linked`, which can write. Vercel deploys,
rollbacks and promotions stay allowed, since they ask first and a rollback
is how an incident is undone. Read-only access still reads members'
data, emails included. What protects production is the same as for a
collaborator: the `main` rulesets, the `Production` environment, and
migrations reaching production only through Deploy Production.

### Data

What the app stores about members, who can see it and how long it's kept
is in [docs/HOW-IT-WORKS.md](docs/HOW-IT-WORKS.md#your-data), which the app
shows under Settings → Your data. It lives in Supabase (us-east-2) and
Vercel (Cleveland), with nightly age-encrypted backups in a private
repository, kept about 60 days. Error reports go to Sentry, stripped of
who the member is and what they typed (below).

## Controls in place

- Google-only, invite-gated sign-in; ES256-signed sessions; legacy JWT API
  keys disabled.
- Row-level security on every table, `anon` granted nothing in `public`,
  definer functions reviewed through a checked-in list, and DB tests for
  the policies, privileges and refusals.
- Per-member write limits and Storage upload quotas in the database.
- A Content Security Policy, `X-Frame-Options: DENY`, `nosniff`, a referrer
  policy and a `Permissions-Policy` (`next.config.ts`); nothing of Google's
  loads on the sign-in page (#366).
- Push endpoints allowlisted to known push services, in SQL and in the
  sender.
- Error reports scrubbed of users, cookies, request bodies, headers and
  query strings. Source maps go to Sentry from the Vercel build and are
  deleted from the output, so production never serves them.
- Monitoring that emails the owner: Sentry's high-priority-issue alert,
  UptimeRobot on `/api/health` every 5 minutes, healthchecks.io heartbeats
  for the crons, and GitHub's failed-workflow email.
- Claude Code guard rails, checked in: `supabase db push` and pushes to
  `main` refused, a hook refusing edits to applied migrations, and a
  read-only production MCP server ([AI agents](#ai-agents)).
- GitHub secret scanning with push protection, Dependabot security and
  version updates, and every Action pinned to a commit SHA.
- Branch rulesets on `main` (review, `ci-ok`, up to date) and the
  `Production` environment limited to `main`.
- Encrypted backups, with secrets masked out of the public Actions logs.

## After a report

The maintainer confirms the issue, fixes it on `main` (a migration for a
database issue), rotates any secret that may have been exposed, and checks
the logs and data for misuse, following the incident and key-rotation
steps in [docs/OPERATIONS.md](docs/OPERATIONS.md#incidents). The advisory
is published once the fix is live.
