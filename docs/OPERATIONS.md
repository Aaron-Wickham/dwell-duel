# Operations

How production is deployed, backed up and restored. The owner (Aaron) holds
every secret and key named here.

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

Redeploy by hand with "Run workflow" on Deploy Production, from `main`.

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
A secret that does reach a log must be rotated: deleting the run's log isn't
enough, since anyone may have read it.

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

### Roll back the app

Vercel keeps every production deploy. **Instant Rollback** (Vercel →
Deployments → an earlier production deploy → Instant Rollback) puts the
previous build back in seconds. It doesn't touch the database, so it's safe
only while the schema still serves the old code, which keeping migrations
additive guarantees. A migration is never rolled back: fix forward with a new
one. While rolled back, Vercel stops promoting new deploys until you undo the
rollback in the same place, so do that once the fix is merged.

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
