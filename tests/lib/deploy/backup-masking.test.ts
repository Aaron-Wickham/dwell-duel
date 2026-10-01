import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

// The backup scripts run the way the workflows run them: mask-secrets.sh as its own step, whose
// stdout reaches the runner, then backup.sh inside $(...), whose stdout is captured. A fake
// password must reach the log only as an ::add-mask:: line from the first step (#248 follow-up).
const root = path.resolve(import.meta.dirname, '../../..')
const script = (name: string) => path.join(root, 'scripts/backup', name)

const ENCODED = 'Fake%40SentinelPw%2Fq9'
const DECODED = 'Fake@SentinelPw/q9'
const TOKEN = 'ghp_FakeSentinelToken123'
const AUTH = Buffer.from(`x-access-token:${TOKEN}`).toString('base64')
const DB_URL = `postgresql://postgres.fakeref:${ENCODED}@db.example.invalid:5432/postgres`
const SECRETS = [ENCODED, DECODED, TOKEN, AUTH, DB_URL]

type Run = { status: number | null; stdout: string; stderr: string; masking?: boolean }

let dir: string
let env: Record<string, string>
let log: Run[]

function run(args: string[], input?: string, extraEnv: Record<string, string> = {}): Run {
  const result = spawnSync('bash', args, { cwd: root, env: { ...env, ...extraEnv } as NodeJS.ProcessEnv, input, encoding: 'utf8' })
  const out = { status: result.status, stdout: result.stdout, stderr: result.stderr }
  log.push(out)
  return out
}

function stub(name: string, body: string) {
  const file = path.join(dir, 'bin', name)
  writeFileSync(file, `#!/usr/bin/env bash\n${body}\n`)
  chmodSync(file, 0o755)
}

// The runner applies what a step appends to $GITHUB_ENV to the steps after it.
function maskStep(): Run {
  const result = run([script('mask-secrets.sh')])
  result.masking = true
  for (const line of readFileSync(env.GITHUB_ENV, 'utf8').split('\n')) {
    const at = line.indexOf('=')
    if (at > 0) env[line.slice(0, at)] = line.slice(at + 1)
  }
  return result
}

// Everything the test's runs printed, except the mask step's ::add-mask:: lines on its stdout.
function printed(): string {
  return log
    .flatMap((r) => [
      r.masking ? r.stdout.split('\n').filter((line) => !line.startsWith('::add-mask::')).join('\n') : r.stdout,
      r.stderr,
    ])
    .join('\n')
}

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'backup-masking-'))
  mkdirSync(path.join(dir, 'bin'))
  writeFileSync(path.join(dir, 'github_env'), '')
  log = []
  env = {
    PATH: `${path.join(dir, 'bin')}:${process.env.PATH}`,
    HOME: dir,
    TMPDIR: dir,
    RUNNER_TEMP: dir,
    GITHUB_ACTIONS: 'true',
    GITHUB_ENV: path.join(dir, 'github_env'),
    GIT_CONFIG_GLOBAL: '/dev/null',
    SUPABASE_DB_URL: DB_URL,
    BACKUP_REPO_TOKEN: TOKEN,
    BACKUP_AGE_RECIPIENT: 'age1fakerecipientforthetestonly',
    STUB_DECODED: DECODED,
  }
  // Tools that fail the way a real one might: every argument, the URL included, and the
  // decoded password on stderr.
  stub('pg_dump', 'echo "pg_dump: error: connection to $* failed for password $STUB_DECODED" >&2; exit 1')
  stub('age', 'while [ "$#" -gt 0 ]; do if [ "$1" = -o ]; then out="$2"; fi; shift; done; cat >"$out"')
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('backup secret masking', () => {
  it('prints no ::add-mask:: from the scripts the workflows capture', () => {
    for (const name of ['backup.sh', 'restore.sh', 'secrets.sh', 'check-sealed.sh']) {
      expect(readFileSync(script(name), 'utf8'), name).not.toContain('::add-mask::')
    }
  })

  it('masks every form of the password and the token, on the step’s own stdout', () => {
    const mask = maskStep()
    expect(mask.status).toBe(0)
    const lines = mask.stdout.trim().split('\n')
    expect(lines.every((line) => line.startsWith('::add-mask::'))).toBe(true)
    for (const secret of SECRETS) expect(lines).toContain(`::add-mask::${secret}`)
    expect(env.BACKUP_MASKED).toBe('db-url,repo-token')
  })

  it('refuses to dump or push in Actions before the mask step has run', () => {
    stub('supabase', 'echo "supabase $*" >&2; exit 1')
    const dump = run([script('backup.sh'), 'db', 'nightly', path.join(dir, 'backup')])
    const push = run([script('backup.sh'), 'push', 'db', script('backup.sh')])
    for (const result of [dump, push]) {
      expect(result.status).not.toBe(0)
      expect(result.stdout).toBe('')
      expect(result.stderr).toContain('mask-secrets.sh')
    }
    for (const secret of SECRETS) expect(printed()).not.toContain(secret)
  })

  it('keeps a failing dump’s output, with its arguments, off stdout and free of the password', () => {
    stub('supabase', 'echo "supabase $* failed for password $STUB_DECODED" >&2; pg_dump --dbname "$4"; exit 1')
    maskStep()
    const out = path.join(dir, 'backup')
    const dump = run([script('backup.sh'), 'db', 'nightly', out])
    expect(dump.status).not.toBe(0)
    expect(dump.stdout).toBe('')
    expect(dump.stderr).toContain('supabase db dump --db-url ***')
    expect(dump.stderr).toContain('pg_dump: error')

    const check = run([script('check-sealed.sh'), out], dump.stdout)
    expect(check.status).not.toBe(0)

    for (const secret of SECRETS) expect(printed()).not.toContain(secret)
  })

  it('captures only sealed file paths from a good dump, and pushes them without printing a secret', () => {
    stub(
      'supabase',
      [
        'echo "supabase $*" >&2',
        'while [ "$#" -gt 0 ]; do if [ "$1" = -f ]; then file="$2"; fi; shift; done',
        `printf 'COPY "auth"."users" FROM stdin;\\nCOPY "public"."coin_transactions" FROM stdin;\\n' >"$file"`,
      ].join('\n'),
    )
    const remote = path.join(dir, 'remote.git')
    expect(spawnSync('git', ['init', '-q', '--bare', '-b', 'main', remote]).status).toBe(0)

    maskStep()
    const out = path.join(dir, 'backup')
    const dump = run([script('backup.sh'), 'db', 'nightly', out])
    expect(dump.status).toBe(0)
    const files = dump.stdout.trimEnd().split('\n')
    expect(files).toHaveLength(1)
    for (const file of files) {
      expect(path.dirname(file)).toBe(out)
      expect(path.basename(file)).toMatch(/^\d{4}-\d{2}-\d{2}T\d{6}Z-nightly\.tar\.gz\.age$/)
      expect(existsSync(file)).toBe(true)
    }

    expect(run([script('check-sealed.sh'), out], dump.stdout).status).toBe(0)
    const push = run([script('backup.sh'), 'push', 'db', ...files], undefined, { BACKUP_REMOTE: remote })
    expect(push.status).toBe(0)
    expect(push.stdout).toBe('')
    expect(push.stderr).toContain('Pushed 1 file(s)')

    for (const secret of SECRETS) expect(printed()).not.toContain(secret)
  })

  it('rejects captured output that is not a sealed file, without printing it', () => {
    const out = path.join(dir, 'backup')
    mkdirSync(out)
    const sealed = path.join(out, '2026-10-01T031700Z-nightly.tar.gz.age')
    writeFileSync(sealed, 'x')
    for (const captured of [
      `::add-mask::${ENCODED}`,
      `${sealed}\n${DECODED}`,
      `${out}/../${path.basename(sealed)}`,
      path.join(out, '2026-10-01T031700Z-missing.tar.gz.age'),
      '',
    ]) {
      const check = run([script('check-sealed.sh'), out], captured)
      expect(check.status, captured).toBe(1)
      expect(check.stdout + check.stderr).toContain('::error::')
    }
    expect(run([script('check-sealed.sh'), out], `${sealed}\n`).status).toBe(0)
    for (const secret of SECRETS) expect(printed()).not.toContain(secret)
  })

  // A tool may spell the password in its own percent-encoding, or wrap it across lines.
  it('hides a line holding the password in another spelling, or the longer half of a wrapped one', () => {
    const spellings = ['Fake%40SentinelPw/q9', 'Fake%40SentinelPw%2fq9', 'Fake@SentinelPw%2Fq9', '%46ake@SentinelPw/q9']
    const wrapped = ['connecting with Fake@Sentin', 'elPw/q9 failed']
    stub('supabase', [...spellings.map((s) => `echo "error: password ${s}" >&2`), ...wrapped.map((s) => `echo "${s}" >&2`), 'exit 1'].join('\n'))
    maskStep()
    const dump = run([script('backup.sh'), 'db', 'nightly', path.join(dir, 'backup')])
    expect(dump.status).not.toBe(0)
    expect(dump.stdout).toBe('')
    const notices = dump.stderr.split('\n').filter((line) => line === '(a line was hidden here: it held part of a secret)')
    expect(notices).toHaveLength(spellings.length + 1)
    for (const s of [...spellings, wrapped[0], 'SentinelPw']) expect(printed()).not.toContain(s)
    expect(dump.stderr).toContain('elPw/q9 failed')
  })

  it('takes the password from the URL’s authority, not from an @ in its query', () => {
    const forms = (url: string) =>
      run(['-c', `source ${JSON.stringify(script('secrets.sh'))}; db_password_forms "$1"`, '_', url]).stdout.split('\n')[0]
    expect(forms('postgresql://u:pw0rd-long@h:5432/db?options=a@b')).toBe('pw0rd-long')
    expect(forms('postgresql://u:p@ss@h/db')).toBe('p@ss')
    expect(forms('postgresql://u:p/w?x@h/db')).toBe('p/w?x')
    expect(forms('postgresql://u@h/db?x=a:b@c')).toBe('')
  })

  it('restores with the URL from the environment, never on a command line', () => {
    const backup = path.join(dir, 'restore')
    mkdirSync(backup)
    for (const file of ['roles', 'schema', 'data']) writeFileSync(path.join(backup, `${file}.sql`), 'select 1;\n')
    const calls = path.join(dir, 'psql-calls')
    stub('psql', `echo "psql $* password=$PGPASSWORD" >>"${calls}"; echo "psql: error: $* ${DECODED}" >&2`)
    const ok = run([script('restore.sh'), backup], '', { RESTORE_DB_URL: DB_URL })
    expect(ok.status).toBe(0)
    const argv = readFileSync(calls, 'utf8')
    expect(argv).toContain('--dbname postgresql://postgres.fakeref@db.example.invalid:5432/postgres ')
    expect(argv).toContain(`password=${DECODED}`)
    expect(argv.replaceAll(`password=${DECODED}`, '')).not.toContain('SentinelPw')
    expect(ok.stdout + ok.stderr).not.toContain('SentinelPw')

    const asArgument = run([script('restore.sh'), backup, DB_URL], '')
    expect(asArgument.status).not.toBe(0)
    const noUrl = run([script('restore.sh'), backup], '')
    expect(noUrl.status).not.toBe(0)
    expect(noUrl.stderr).toContain('RESTORE_DB_URL')
  })
})
