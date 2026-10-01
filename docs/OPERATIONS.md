# Operations

How production runs: what it's made of, how it's deployed, rolled back,
backed up and restored, how each secret is rotated, what each alarm means,
and the free-tier limits to watch. The owner (Aaron) holds every secret and
key named here, and is the only person who can carry out these steps.

- [Systems map](#systems-map)
- [Deploys](#deploys)
- [Rolling back](#rolling-back)
- [Backups and restore](#backups-and-restore)
- [Rotating secrets](#rotating-secrets)
- [Incidents](#incidents), including [owner recovery](#owner-recovery) and [deleting a member's data](#deleting-a-members-data-on-request)
- [Free-tier limits](#free-tier-limits)
- [Scheduled jobs](#scheduled-jobs)

## Systems map

| System | What | Where it's configured |
|---|---|---|
| **Vercel** project `dwell-duel` (Hobby) | The app, its functions in `cle1` (Cleveland, `vercel.json`), the daily keep-alive cron | Vercel → Settings (environment variables, deploy hook, domains); `vercel.json` |
| **Supabase** project `lymrpiivqvdnfcjmxksx` (Free, us-east-2) | Postgres, Auth (Google only), Realtime, Storage (`avatars`, `proof`), `pg_cron` and `pg_net` | Supabase dashboard; schema only through `supabase/migrations/` |
| **Supabase Vault** | `app_url` and `cron_secret`, for `pg_cron`'s closing-alerts call | SQL editor (README, One-time setup) |
| **GitHub** `Aaron-Wickham/dwell-duel` (public) | Code, CI, Deploy Production, Backups, the Closing alerts backup | Rulesets "CI" (`ci-ok` required, up to date, no bypass) and "Protect main" (code-owner review); the `Production` environment (secrets, `main` only); repository secret `CRON_SECRET`; variables `APP_URL` and `VERCEL_TEAM_ID` |
| **GitHub** `Aaron-Wickham/dwell-duel-backups` (private) | The encrypted backups | Written with `BACKUP_REPO_TOKEN` |
| **Google Cloud** OAuth client | Google sign-in | Its client ID and secret are in Supabase → Auth → Providers → Google |
| **Domains** | `www.dwellduel.com` serves the app; `dwellduel.com` 308-redirects to it; `dwelldule.com` and `www.dwelldule.com` 301 to it | Vercel → Settings → Domains |
| **Monitoring** | Sentry (errors), healthchecks.io (two heartbeats), UptimeRobot (`/api/health`) | Each service's dashboard; the app's side is ARCHITECTURE.md's Observability |

## Deploys

Every merge to `main` runs **Deploy Production**
(`.github/workflows/deploy-production.yml`). Vercel's own Git deploys are off
for `main`, so this workflow is the only way code reaches production.

1. **Plan.** A dry run of `supabase db push` against the production project
   lists the migrations production hasn't applied yet. That is decided from
   production's own migration history, not from what the merge changed, so a
   migration an earlier run failed to apply is picked up by the next run. A
   migration that can't apply fails here, before anything is pushed.
2. **Back up, then migrate** (only when something is pending). An encrypted
   dump of the database goes to the backups repo (below), then
   `supabase db push` applies the pending migrations. If the dump fails,
   nothing is migrated.
3. **Deploy the app.** If this run's commit is still `main`'s head, the
   Vercel deploy hook builds it and the run waits until Vercel reports it
   live (with `VERCEL_TOKEN`). If `main` has moved on, the newer push's run,
   queued behind this one, deploys instead.

Guardrails:

- Deploy Production runs only from `main`, and every job uses the GitHub
  `Production` environment, which only `main` may deploy to. Its secrets
  (`SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_URL`, `VERCEL_DEPLOY_HOOK_URL`,
  `VERCEL_TOKEN`, `BACKUP_AGE_RECIPIENT`, `BACKUP_REPO_TOKEN`) live in that
  environment, not at repository level.
- Runs never overlap, and waiting runs queue in order instead of replacing
  each other (`concurrency: prod-db`, `queue: max`). The nightly database
  backup queues in the same group, so no migration lands mid-dump.
- A dry run whose list of pending migrations can't be read fails the run
  rather than counting as "nothing pending".
- A failed backup, migration or build fails the run and leaves the old app
  live. Turn on GitHub's "failed workflows only" notification so it's an email.
- Merging needs the `ci-ok` check green, with no bypass. CI also fails a PR
  whose new migration is numbered at or below `main`'s newest
  (`scripts/check-migration-order.sh`), since `db push` refuses one that
  sorts before production's latest.

Redeploy by hand with "Run workflow" on Deploy Production, from `main`. It
pushes any migrations production is missing, then deploys `main`'s head.

**"main has moved on"** in a run's log isn't an error: a newer merge landed
while this run was migrating, so this run skips its deploy and the newer
run, queued behind it, deploys both.

**Vercel's limits on deploys.** Hobby allows 100 deployments a day, far
more than merges need. Deploy hooks have rate limits of their own; check
vercel.com/docs/limits before scripting anything that calls the hook in a
loop.

## Rolling back

### The app

Vercel keeps every production deployment. **Instant Rollback** (Vercel →
Deployments → the deployment to go back to → Instant Rollback) puts it back
live in seconds, without a build. It doesn't touch the database, so it's
safe whenever the schema still serves the older code, which keeping
migrations additive guarantees.

Know what it does on Hobby:

- **Only the previous production deployment.** Hobby rolls back one step,
  not to any earlier one. To go further back, revert the bad commit in a
  PR and let it deploy.
- **New deploys stop going live.** After a rollback Vercel turns off
  automatic assignment of the production domains. Deploy Production keeps
  building every merge, and its "Wait for the Vercel build" step still
  reports the build READY and prints "Live:", but **the domains stay on the
  rolled-back deployment.** Once the fix is merged and built, undo it:
  Vercel → Deployments → **Undo Rollback**, or promote the new deployment
  (`vercel promote <deployment url>`, or Promote in its menu). Check
  www.dwellduel.com is serving the new build before you call it done.
- **Crons go back too.** The rolled-back deployment's `vercel.json` decides
  the cron schedule until you undo it.

### A migration

There is no down migration and no undo: production only moves forward.

- **To undo a migration's effect,** write a new migration
  (`00NN_revert_<what>.sql`) that puts the old behaviour back, for example
  `create or replace` with the function's previous body. Keep anything the
  running app still calls; a destructive change ships in its own PR once
  nothing uses it.
- **To fix data a migration got wrong,** see
  [Restore into production](#restore-into-production): restore a backup
  locally, work out the rows, and write them back with a forward migration.
  Every run that migrated took a `pre-migration-<sha>` backup first.
- **To stop a bad migration before it's pushed,** cancel the Deploy
  Production run in the Actions tab while it's still in `plan` or the
  backup step. Runs share the `prod-db` concurrency group and queue rather
  than cancel each other, so cancel any queued run that would push the same
  migration, and merge the fix (or a PR that removes the migration file)
  before running it again. A migration that fails partway rolls itself
  back; any before it in the same push stay applied.
- **App and schema together:** if the new code is what's failing, roll the
  app back first (above), then fix forward.

## Backups and restore

Supabase's Free plan keeps no backups and has no point-in-time recovery, so
the repo makes its own.

### What's backed up, where and when

| What | When | Label |
|---|---|---|
| Database: roles, schema, and data in every non-platform schema, which includes `auth` (users, identities, sessions) and `storage` (bucket and object rows) | Nightly at 03:17 UTC (`.github/workflows/backups.yml`) | `nightly` |
| The same dump, moments before any migration | Each Deploy Production run with pending migrations | `pre-migration-<sha>` |
| The `proof` and `avatars` Storage buckets (the files themselves) | Sundays at 03:47 UTC, or by hand with "Run workflow" and **Also copy the Storage buckets** | `weekly` |

Each backup is one file, `<UTC time>-<label>.tar.gz.age`: a tar of the dump
files (`roles.sql`, `schema.sql`, `data.sql`) or the bucket folders, gzipped
and encrypted with [age](https://age-encryption.org) to the public key in
`BACKUP_AGE_RECIPIENT`. A file over 95 MB is split into `.part-aa`,
`.part-ab`… because GitHub refuses files over 100 MB. The logic is
`scripts/backup/backup.sh`, shared by both workflows.

They're committed to the **private** repo
[`Aaron-Wickham/dwell-duel-backups`](https://github.com/Aaron-Wickham/dwell-duel-backups),
database dumps under `db/` and Storage copies under `storage/`. Nothing is
uploaded as an Actions artifact and nothing from a dump is printed, because
this repo is public. The backups repo keeps a **single commit** holding the
last 60 days of files: each push rebuilds that commit and force-pushes it with
a lease, so expired files really go (encrypted files don't compress between
versions, so history would only grow). A push prunes only the folder it
writes to, and always keeps that folder's newest 14 backups, so if the
nightly job stops running, the last good dumps don't age away.

**Not in the backups**, so a restore into a new project redoes them by hand:
Supabase Vault secrets (`app_url`, `cron_secret`), the pg_cron jobs, the
migration history table, Auth settings (the Google provider, site and
redirect URLs), API keys, and Vercel's environment variables.

### Keeping secrets out of the logs

This repo is public, and so are its Actions logs. The runner masks a
secret's whole value, but not the password inside `SUPABASE_DB_URL`, which a
tool can print on its own, percent-decoded or re-encoded, nor the base64
header `git` authenticates to the backups repo with. So:

- **Every job that uses `SUPABASE_DB_URL` or `BACKUP_REPO_TOKEN` runs
  `scripts/backup/mask-secrets.sh` as its own step first**, with those
  secrets in its `env`. It registers an `::add-mask::` for every form of
  them and records what it masked in `BACKUP_MASKED`; `backup.sh db` and
  `backup.sh push` refuse to run in Actions without it. A mask must be
  printed on a step's own stdout: one printed inside `$(...)` is captured
  instead and never registered, which is why it can't live in `backup.sh`.
- **`backup.sh` prints only sealed file paths on stdout.** Everything else
  goes to stderr, and the Supabase CLI's and `git`'s output passes through
  `redact` (`scripts/backup/secrets.sh`) even if a mask is missing. It
  blanks the URL, the password (as written, decoded and re-encoded), the
  token and its header, then hides any whole line that still holds the first
  or last 8 characters of the decoded password, token or header, as printed
  or once percent-decoded. That catches the password in any percent-encoding
  spelling, and the longer half of one a tool wraps across lines (always at
  least 8 characters when the password has 16 or more, as Supabase's
  generated ones do; a shorter one can slip through in two short halves).
  `restore.sh` does the same for `psql`.
- **The workflow checks what it captured** with
  `scripts/backup/check-sealed.sh` before using it: every line must be a
  sealed file in the output folder, and a line that isn't fails the step
  without being printed.
- `tests/lib/deploy/` guards all three: the workflows' step order, and the
  scripts run with stub tools that echo a fake password.

Never add `set -x` to these scripts or echo a variable that holds a secret.
A secret that does reach a log must be rotated (see
[Rotating secrets](#rotating-secrets)): deleting the run's log isn't enough,
since anyone may have read it.

### The key

The private key is kept offline, never in GitHub. Aaron made it once with
`age-keygen -o dwellduel-backup.key`, put the printed public key
(`age1…`) in the `BACKUP_AGE_RECIPIENT` secret, and stored the file in his
password manager with an offline copy. **Without it no backup can be read.**
To rotate it, make a new pair, update the secret, and keep the old private key
until its last backup has expired (60 days).

### Decrypt a backup

```bash
gh repo clone Aaron-Wickham/dwell-duel-backups
mkdir restore
age -d -i dwellduel-backup.key dwell-duel-backups/db/<file>.tar.gz.age | tar -xz -C restore
# A split backup: cat its parts in order first.
cat dwell-duel-backups/db/<file>.tar.gz.age.part-* | age -d -i dwellduel-backup.key | tar -xz -C restore
```

`restore/` then holds `roles.sql`, `schema.sql` and `data.sql` (or
`proof/` and `avatars/` for a Storage copy). They hold members' emails and the
whole ledger: keep them off shared disks and delete them when done.

### Restore into the local stack

To inspect a backup, or rehearse. `scripts/backup/restore.sh` loads a dump
into an **empty** Supabase database: the roles first (the platform grants in
it may fail, which is expected), then the schema and data in one
transaction with triggers off, so a failure leaves the database as it was.
It takes the database URL from `RESTORE_DB_URL`, or asks for it without
echoing it when that's unset, never as an argument, and hands `psql` the URL
without its password (the password goes through `PGPASSWORD`), so the
password stays out of shell history and the process list.

```bash
# An empty Supabase database: reset from a folder with no migrations and no seed.
mkdir -p /tmp/blank/supabase/migrations /tmp/blank/supabase/.temp
cp supabase/config.toml /tmp/blank/supabase/ && : > /tmp/blank/supabase/seed.sql
cp supabase/.temp/*-version supabase/.temp/storage-migration /tmp/blank/supabase/.temp/ 2>/dev/null
(cd /tmp/blank && supabase db reset)

RESTORE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres scripts/backup/restore.sh restore

# Files from a Storage copy go back through the Storage API:
supabase storage cp -r restore/avatars ss:/// --local --experimental

npm run db:reset   # back to the normal local database afterwards
```

The local Auth and Storage services must be at least as new as production's,
or the data load fails on a table they don't have yet
(`relation "auth.…" does not exist`). `supabase link` records production's
versions in `supabase/.temp/`, which the `cp` above carries over; a checkout
that has never been linked runs the CLI's defaults.

### Restore into production

Take a fresh dump first (Backups → Run workflow) so the restore itself can
be undone.

**Some data is wrong** (a bad migration rewrote rows, an accidental delete)
and the project is fine: restore the last good backup into the local stack
as above, work out the rows that differ, and fix production with a new
forward migration (or, for a one-off, SQL run through `psql
"$SUPABASE_DB_URL"`), copying the good values across. Don't load a whole
`data.sql` over a live database: it would collide with every row that's
still there.

**The project is lost:**

1. Create a new Supabase project in the same region (us-east-2) and Postgres
   major version (17).
2. `scripts/backup/restore.sh restore`, and paste its session pooler URL
   at the prompt (it isn't echoed).
3. Record the migrations as applied, so Deploy Production doesn't run them
   again: `supabase migration repair --project-ref <new ref> --status applied $(ls supabase/migrations | cut -d_ -f1)`.
4. Recreate the Vault secrets and cron jobs: the two `vault.create_secret`
   calls in the README's Production section, and the `cron.schedule` calls
   in migrations 0064 and 0065.
5. Upload the latest Storage copy:
   `supabase storage cp -r restore/proof ss:/// --project-ref <new ref> --experimental`,
   and the same for `avatars`.
6. Set up Auth (Google provider, site URL, redirect URLs) and new API keys as
   in the README, then point Vercel's variables, the `lymrpiivqvdnfcjmxksx`
   project ref in the two workflows, and the `SUPABASE_DB_URL` secret at the
   new project, and redeploy. Every member signs in again, since the new
   project signs sessions with a new key.

### Restore rehearsal

Rehearsed on 2026-09-30 against the local stack seeded by
`scripts/seed-scale.mjs` (500 members, 200 markets, 20,000 bets, 30,903
ledger rows, 400 parlays, one avatar): `backup.sh db` and `backup.sh storage`
with a throwaway key, decrypted, restored with `restore.sh` into an empty
database. Row counts, balance and ledger totals, and an md5 over every row of
`profiles`, `coin_transactions`, `bets`, `auth.users` and `storage.objects`
matched the source; the functions, policies, triggers and realtime
publication matched a freshly migrated database; the avatar came back
byte for byte. Repeat it after a change to the backup scripts.

## Rotating secrets

Rotate a secret when it may have leaked (printed in a public log, pasted
somewhere, on a lost laptop), when someone who held it leaves, and before
a fine-grained token expires. The pattern is always: make the new one,
put it everywhere it's used, check it works, and only then revoke the old
one.

A change to a Vercel environment variable takes effect on the **next
deployment**, and a `NEXT_PUBLIC_` one is baked into the build, so redeploy
after changing one: Deploy Production → Run workflow, from `main`.

### Vercel environment variables (Production)

| Variable | Missing means | To rotate |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | The server refuses to boot | Not a secret; changes only with a new Supabase project |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | The server refuses to boot | Supabase → Settings → API Keys → create a publishable key; set it in Vercel; redeploy; wait a day for open tabs to reload, then delete the old key |
| `SUPABASE_SECRET_KEY` | The server refuses to boot | Supabase → Settings → API Keys → create a secret key; set it in Vercel; redeploy; run the keep-alive cron (Vercel → Settings → Cron Jobs → Run) and check it answers 200; then delete the old key |
| `CRON_SECRET` | The server refuses to boot | **Three places must match** (below) |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | The app boots, logs "Push notifications are off until they are set", and sends nothing; Settings says notifications aren't available | Below |
| `NEXT_PUBLIC_SENTRY_DSN` | Errors aren't captured | Public by design; replace it only if it's being spammed: Sentry → the project → Client Keys → new key, set it, redeploy, disable the old key |
| `HEALTHCHECKS_KEEP_ALIVE_URL`, `HEALTHCHECKS_CLOSING_ALERTS_URL` | No heartbeat pings, so each check goes late and emails | healthchecks.io → the check → its ping URL; set it, redeploy, then confirm the next ping arrives |

**`CRON_SECRET`.** Vercel's cron, `pg_cron` and the Closing alerts
workflow all send it, and the app compares it with its own copy:

1. Make one: `openssl rand -hex 32`.
2. Set `CRON_SECRET` in Vercel (Production) and redeploy.
3. Straight away, in the Supabase SQL editor:
   `select vault.update_secret((select id from vault.secrets where name = 'cron_secret'), '<new secret>');`
4. Update the `CRON_SECRET` **repository** secret in GitHub (Settings →
   Secrets and variables → Actions).
5. Check: Closing alerts → Run workflow should pass, and the Admin
   closing-alerts warning should stay away. Between steps 2 and 3,
   `pg_cron`'s calls get a 401, so the warning may show for a few minutes.

**The VAPID pair.** Rotating it stops every device's existing
subscription. `npx web-push generate-vapid-keys`, set both variables in
Vercel, redeploy. A device that had notifications on re-subscribes with the
new key the next time its member opens the app (`PushResync`), as long as
the browser still grants permission; anyone else turns them on again in
Settings. After the deploy, check the function logs for "Push
notifications are off", which means one of the two is missing.

### GitHub `Production` environment secrets

Only Deploy Production and Backups can read these, and only from `main`.
Update them under Settings → Environments → Production.

| Secret | Used for | To rotate | Check |
|---|---|---|---|
| `SUPABASE_ACCESS_TOKEN` | `supabase db push` and the dry run; the Storage backup | Supabase → Account → Access Tokens → new token (CLI 2.117.0 takes the fine-grained `sbp_v0_` kind); update; revoke the old one | Deploy Production → Run workflow passes its dry run |
| `SUPABASE_DB_URL` | The database dump (session pooler URL, with the database password) | Supabase → Database → reset the database password, then copy the session pooler URL; update. The app doesn't use this password, only the backups do | Backups → Run workflow |
| `VERCEL_DEPLOY_HOOK_URL` | Triggering the production build | Vercel → Settings → Git → Deploy Hooks → a new hook for `main`; update; delete the old hook | Deploy Production → Run workflow reaches "Live:" |
| `VERCEL_TOKEN` | Watching the build until it's live | Vercel → Account settings → Tokens → a new token (it only reads deployments); update; delete the old one | The next run prints "Live:" rather than "can't watch the Vercel build" |
| `BACKUP_AGE_RECIPIENT` | Encrypting backups | See [The key](#the-key): a new pair, keeping the old private key until its last backup expires | Decrypt the next backup with the new key |
| `BACKUP_REPO_TOKEN` | Pushing to `dwell-duel-backups` | GitHub → Settings → Developer settings → fine-grained token with Contents read and write on `dwell-duel-backups` only; update; delete the old one. Note its expiry date | Backups → Run workflow |

### Elsewhere

- **`CRON_SECRET` repository secret:** as above, with the other two copies.
- **`DOCKERHUB_TOKEN` repository secret:** unused since #238 (CI caches
  Supabase's images itself). Delete it.
- **Google OAuth client secret:** Google Cloud → Credentials → the client →
  add a secret; paste it into Supabase → Auth → Providers → Google; sign
  in once to check; then disable and delete the old secret.
- **The backup key:** [The key](#the-key).

## Incidents

### What each alarm means

| Alarm | Means | First look |
|---|---|---|
| healthchecks.io: **keep-alive** late | The daily cron (05:15 UTC) didn't run, or couldn't reach healthchecks | Vercel → Settings → Cron Jobs: run it by hand and read the response. A rollback can change the cron (see [Rolling back](#the-app)) |
| healthchecks.io: **keep-alive** failed | The cron ran but a step failed: its 502 response names the steps (`database`, `proof cleanup`, `proof retention`, `avatar cleanup`, `storage usage`, `key cleanup`, `uninvited sign-in cleanup`, `season settle`, `resolve reminders`) | Sentry for the error. `storage usage` failing means Storage is past 800 MB: see [Free-tier limits](#free-tier-limits) |
| healthchecks.io: **closing-alerts** late | Nothing has called `/api/cron/closing-alerts` successfully: `pg_cron`'s job stopped, its Vault secrets are wrong or missing, or the app answers 401 (a `CRON_SECRET` mismatch) | Supabase → Integrations → Cron → `closing-alerts` and its run history; the Vault secrets; Closing alerts → Run workflow |
| healthchecks.io: **closing-alerts** failed, or the route's **502** | A run read its queue but delivered nothing and at least one failure was ours or the push service's (wrong VAPID keys answer 401/403 everywhere, our network, 429, 5xx), or it couldn't read the queue at all | Sentry ("Closing alerts failed"); the VAPID variables; the push services' status. One member's dead device never causes this |
| **Admin warning**: "Closing alerts last ran …" | The same as closing-alerts late, seen in the app: no run has stamped the heartbeat for 30 minutes. Until one does, only the daily cron sends closing alerts | As above |
| **Admin warning**: "Couldn't check whether closing alerts are running" | Reading `cron_heartbeats` failed; Admin still works | Usually transient; if it stays, check Supabase's health |
| **UptimeRobot**: `/api/health` down | 503: the app can't read Supabase (an outage, a paused project, a bad `SUPABASE_SECRET_KEY`). No answer at all: Vercel or DNS | status.supabase.com, Supabase → the project's status, vercel-status.com; Vercel → Deployments for a failed or rolled-back deploy |
| **Sentry**: a new issue | An uncaught error, or one `reportError` captured. A member's "Error code" on the error page is the event's digest | The event's stack and route; the PR that last touched it |
| **GitHub email**: a failed workflow | Deploy Production (the backup, migration, hook or build; the old app stays live), Backups, or the Closing alerts backup | The run's log; re-run from `main` once fixed |

### Checklist

1. **Look quickly.** Vercel's runtime logs are kept for only an hour on
   Hobby, and Supabase's API and database logs for a day (its Auth audit
   log for an hour), so read them before anything else. Sentry keeps the
   errors longer.
2. **Is it the app or the data?** If a deploy broke it, roll the app back
   ([Rolling back](#the-app)) and fix forward. If data is wrong, stop
   whatever is writing it, then restore what's needed
   ([Restore into production](#restore-into-production)).
3. **Stop the bleeding before the cleanup.** A leaked secret is rotated
   first ([Rotating secrets](#rotating-secrets)); a bad migration is fixed
   with a new one; a bad actor is removed from Admin → Members.
4. **Tell members** in the group's usual chat what happened and whether
   anything of theirs is affected. The app has no broadcast message.
5. **Afterwards,** open an issue for the cause, and add a line under
   `## Unreleased` → Fixes in `CHANGELOG.md` with the fix.

### Owner recovery

There is exactly one owner (a unique index on `profiles` allows no
second), and only the owner can change roles, adjust balances or remove
members. If the owner loses access, nobody can do those from the app, so
recovery is SQL in the Supabase dashboard's SQL editor, which runs as
`postgres` and bypasses RLS. Only the person holding the Supabase account
can do it.

**The owner's invite was deleted** (they land on "not invited", or the app
treats them as a member: `my_role()` only counts a role while its email is
invited). Put it back, claimed by their profile:

```sql
insert into public.allowed_emails (email, claimed_by)
select lower(email), id from public.profiles where role = 'owner'
on conflict (email) do update set claimed_by = excluded.claimed_by;
```

**The owner's Google account is lost**, so a new account must become the
owner:

1. Invite the new account, sign in with it once, so it has a profile:
   `insert into public.allowed_emails (email) values ('new@gmail.com');`
2. Move the ownership, demoting the old owner first (the unique index
   allows only one at a time). Put the new email in the first line. The
   block is one statement, so it either does everything or nothing, and it
   refuses unless exactly one invited account with a profile has signed in
   with that email:

   ```sql
   -- Move ownership to the account that signed in as new@gmail.com. Aborts, changing nothing, unless
   -- exactly one invited account with a profile and a sign-in matches.
   do $$
   declare
     v_email constant text := lower('new@gmail.com');
     v_matches integer;
     v_new uuid;
   begin
     select count(*), (array_agg(u.id))[1] into v_matches, v_new
     from auth.users u
     join public.profiles p on p.id = u.id
     where lower(u.email) = v_email and u.last_sign_in_at is not null;

     if v_matches <> 1 then
       raise exception 'expected exactly one signed-in account with a profile for %, found %', v_email, v_matches;
     end if;
     if not exists (select 1 from public.allowed_emails where email = v_email) then
       raise exception '% is not invited: insert it into allowed_emails first', v_email;
     end if;

     update public.profiles set role = 'member' where role = 'owner' and id <> v_new;
     update public.profiles set role = 'owner' where id = v_new;
     raise notice 'owner is now % (%)', v_email, v_new;
   end
   $$;
   ```

3. Sign in as the new owner and, from Admin → Members, remove the old
   account (Remove from DwellDuel), which revokes its invite and signs out
   its devices. Its coins and history stay.
4. Check: the new owner sees the Adjust balance and Role cards on a
   member's Admin page.

**The owner has been demoted or removed by SQL by mistake:** put their
invite back as in the first case, then run the block above with their
email.

If the Supabase account itself is lost, recover it through Supabase's own
support; nothing in the app can.

### Deleting a member's data on request

When a member asks for their data to be deleted (How it works → Your data
says the owner does it by hand). Removing them from Admin → Members only
ends their access; this goes further. Their **profile row stays**, renamed
"Former member": the ledger, their bets, parlays, markets and results all
point at it, and other members' payouts and every balance must still add
up, so ledger rows are kept, not deleted. Everything that identifies them
goes.

1. Take a fresh backup first (Backups → Run workflow), and make sure they
   aren't the owner (move ownership first).
2. Find their profile id: Admin → Members → their page (it's in the URL),
   or `select id, display_name from public.profiles where email = lower('them@gmail.com');`
3. In the SQL editor, replace `<member id>` (four places) and run both
   parts. The first lists their files; keep the list. The second is one
   statement, so a failure changes nothing.

   ```sql
   -- 1. The member's files, to delete through Storage afterwards (SQL can't delete Storage objects).
   select bucket_id, name from storage.objects
   where (bucket_id = 'avatars' and name like '<member id>/%')
      or (bucket_id = 'proof' and name in (
           select storage_path from public.proof_attachments
           where created_by = '<member id>'::uuid and storage_path is not null and expired_at is null));

   -- 2. Remove or anonymise everything else, in one statement.
   do $$
   declare
     v_id constant uuid := '<member id>';
     v_role text;
     v_email text;
   begin
     select role, lower(email) into v_role, v_email from public.profiles where id = v_id for update;
     if not found then
       raise exception 'no profile %', v_id;
     end if;
     if v_role = 'owner' then
       raise exception 'that is the owner: move ownership first (Owner recovery)';
     end if;

     -- Access: invite, devices, sessions and the Google link, so they can't sign back in as this account.
     delete from public.allowed_emails where email = v_email or claimed_by = v_id;
     delete from public.push_subscriptions where profile_id = v_id;
     delete from public.notification_prefs where profile_id = v_id;
     delete from public.idempotency_keys where profile_id = v_id;
     delete from public.write_rate_counters where profile_id = v_id;
     delete from auth.sessions where user_id = v_id;
     delete from auth.identities where user_id = v_id;

     -- What they wrote.
     delete from public.feed_reactions where profile_id = v_id;
     update public.market_comments
        set body = '', deleted_at = coalesce(deleted_at, now()), deleted_by = coalesce(deleted_by, v_id)
      where profile_id = v_id;
     update public.task_completions set note = null where profile_id = v_id;
     delete from public.proof_attachments where created_by = v_id and kind = 'link';
     update public.proof_attachments set expired_at = now()
      where created_by = v_id and storage_path is not null and expired_at is null;

     -- Who they were. The row stays: the ledger, bets, parlays, markets and results point at it.
     update public.profiles
        set display_name = 'Former member', email = 'removed-' || v_id || '@invalid',
            bio = null, avatar_url = null, avatar_path = null, role = 'member'
      where id = v_id;
     update auth.users
        set email = null, phone = null, raw_user_meta_data = '{}'::jsonb
      where id = v_id;
   end
   $$;
   ```

4. Delete the listed files through Storage (SQL can't): Supabase →
   Storage → each bucket, or
   `supabase storage rm ss:///avatars/<member id>/<file> --project-ref lymrpiivqvdnfcjmxksx --experimental`
   for each path (`ss:///proof/<path>` for proof).
5. Check: their profile page shows "Former member" with no photo or bio,
   their email is gone from Admin → Members, and the owner's Economy card
   still says the ledger adds up.

What stays: their bets, parlays, markets, results and ledger rows, under
"Former member", and feed events, which show that name. Their deleted
data leaves the backups as those age out, within about 60 days.

## Free-tier limits

Everything runs on free plans, so a limit is the likeliest outage at scale.
The numbers below were the plans' published limits at the time of
writing; check the providers' pricing pages for the current ones.
ARCHITECTURE.md's "Free-tier budget at 1,000 members" models how close the
app runs to each at 1,000 members.

| Limit | Where to watch | Near it |
|---|---|---|
| Supabase: **200 concurrent Realtime connections** (one per visible tab) | Supabase → Usage and Reports (Realtime) | Likeliest to bite first. Past it, new tabs poll every 60 s instead of going live, so nothing breaks; the levers are in ARCHITECTURE's Live updates |
| Supabase: **2M Realtime messages a month**, 100 a second | Supabase → Usage | One ping per topic per transaction already; raise `live_ping_interval_ms()` in a migration |
| Supabase: **5 GB egress a month** (plus 5 GB cached) | Supabase → Usage → Egress | The open markets list's sparklines are the biggest term; fewer cards per list |
| Supabase: **500 MB database** | Supabase → Usage → Database size | `cron.job_run_details` is pruned daily of rows older than 7 days (`cron-history-cleanup`, 0065); look for the largest tables before deleting anything |
| Supabase: **1 GB Storage** | The keep-alive's `storageMb` and its `storage usage` step, which fails past 800 MB | Shorten the proof windows: `expired_proof_attachments`' 30 and 90 days in `app/api/cron/keep-alive/route.ts` (and How it works says them) |
| Supabase: **50,000 monthly active users** | Supabase → Usage | Far off for an invite-only group |
| Supabase: **pauses after 7 days idle** | The keep-alive heartbeat | The daily cron touches the database so it never idles |
| Vercel Hobby: **1M function invocations, 4 h Active CPU a month** | Vercel → Usage | Going over can pause the project; the levers are in ARCHITECTURE's budget. The tightest of the Vercel limits |
| Vercel Hobby: **Data Cache reads and writes, Fast Data Transfer** | Vercel → Usage | The sparkline cache is the main reader |
| Vercel Hobby: **one cron a day**, 100 deployments a day, runtime logs kept 1 hour | — | Why `pg_cron` sends the closing alerts and Sentry keeps the errors |
| Vercel Analytics and Speed Insights quotas | Vercel → Usage | Already sampled to 10% and 5% (`lib/app-shell/analytics-sampling.ts`) |
| GitHub Actions: free minutes on a public repo; **10 GB cache**; scheduled workflows **disabled after 60 days** without repository activity | Settings → Actions → Caches; the Actions tab | `cleanup-caches.yml` deletes a closed PR's caches; re-enable a disabled schedule (Backups, Closing alerts, Warm caches) in the Actions tab |

Read Supabase → Usage and Vercel → Usage once a month, and replace
ARCHITECTURE's guesses with what they show.

## Scheduled jobs

| Job | When (UTC) | Runs on | What |
|---|---|---|---|
| `closing-alerts` | Every minute | Supabase `pg_cron` (0064) | `ping_closing_alerts()` calls `/api/cron/closing-alerts` through `pg_net` when a market has just closed or the heartbeat is over nine minutes old |
| Closing alerts (backup) | Every 10 minutes, best effort | GitHub, `.github/workflows/closing-alerts.yml` | Calls the same route with the `CRON_SECRET` repository secret and the `APP_URL` variable |
| `cron-history-cleanup` | 04:17 daily | Supabase `pg_cron` (0065) | Deletes `cron.job_run_details` older than a week |
| Keep-alive | 05:15 daily | Vercel cron (`vercel.json`) | `/api/cron/keep-alive`: touches the database, proof and avatar cleanup, proof expiry, Storage usage, key and uninvited-sign-in cleanup, the month's champion, and the closing alerts' daily backstop; then the heartbeat |
| Backups: database | 03:17 daily | GitHub, `.github/workflows/backups.yml` | The encrypted dump ([Backups and restore](#backups-and-restore)) |
| Backups: Storage | 03:47 Sundays | GitHub, the same workflow | The `proof` and `avatars` buckets |
| Warm caches | 06:17 Mondays, and when the setup or lockfile changes | GitHub, `.github/workflows/warm-caches.yml` | Saves CI's Supabase image, npm, Next and Playwright caches on `main` |
