import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '../../..')
const vercel = JSON.parse(readFileSync(path.join(root, 'vercel.json'), 'utf8'))
const read = (file: string) => readFileSync(path.join(root, '.github/workflows', file), 'utf8')
const workflow = read('deploy-production.yml')
const backups = read('backups.yml')

// Each job's block under `jobs:` (two-space indented keys), with runs of whitespace collapsed so a
// folded `if: >-` reads as one line.
function jobs(source: string): Record<string, string> {
  const body = source.slice(source.indexOf('\njobs:\n'))
  const blocks: Record<string, string> = {}
  for (const match of body.matchAll(/^ {2}([\w-]+):\n([\s\S]*?)(?=^ {2}[\w-]+:\n|(?![\s\S]))/gm)) {
    blocks[match[1]] = match[2].replace(/\s+/g, ' ')
  }
  return blocks
}

const deployJobs = jobs(workflow)
const backupJobs = jobs(backups)
const mainGuard = "- name: Only from main if: github.ref != 'refs/heads/main' run: |"

// Production deploys go through the Deploy Production workflow so the app never goes live before
// its migrations (#148). If Vercel's Git deploys came back on for main, every merge would deploy
// twice and the app would race its migrations again; if the hook step went, nothing would deploy.
describe('deploy order', () => {
  it("keeps Vercel's Git deploys off for main", () => {
    expect(vercel.git?.deploymentEnabled?.main).toBe(false)
  })

  it('runs on every push to main, not only migration changes', () => {
    expect(workflow).toMatch(/push:\s*\n\s*branches: \[main\]\s*\n/)
    expect(workflow).not.toMatch(/paths:/)
  })

  it('has exactly the plan, migration push and app deploy jobs', () => {
    expect(Object.keys(deployJobs)).toEqual(['plan', 'push-migrations', 'deploy-app'])
  })

  // What's pending comes from production, not the push's diff (#249), and output the plan can't
  // read fails the run rather than counting as nothing pending.
  it('always plans against production and fails on a plan it cannot read', () => {
    const plan = deployJobs.plan
    expect(plan).not.toMatch(/needs:|if: needs\./)
    expect(plan).toContain('supabase db push --project-ref lymrpiivqvdnfcjmxksx --dry-run --output-format json')
    expect(plan).toContain(`jq -e '.migrations | if type == "array" then length else error`)
    expect(plan).toContain('pending=true')
    expect(plan).toContain('pending=false')
  })

  // Every migration has a restore point (#248): the backup runs, and must succeed, before the push.
  it('backs up the database before pushing migrations, whenever any are pending', () => {
    const push = deployJobs['push-migrations']
    expect(push).toContain('needs: plan')
    expect(push).toContain("if: needs.plan.outputs.pending == 'true'")
    const backup = push.indexOf('scripts/backup/backup.sh db "pre-migration-')
    const upload = push.indexOf('scripts/backup/backup.sh push db')
    const migrate = push.indexOf('run: supabase db push --project-ref lymrpiivqvdnfcjmxksx')
    expect(backup).toBeGreaterThan(-1)
    expect(upload).toBeGreaterThan(backup)
    expect(migrate).toBeGreaterThan(upload)
    expect(push).not.toContain('continue-on-error')
  })

  it('deploys the app only after the migration push, or when nothing was pending, through the deploy hook', () => {
    const deploy = deployJobs['deploy-app']
    expect(deploy).toContain('needs: [plan, push-migrations]')
    expect(deploy).toContain(
      "if: >- !cancelled() && needs.plan.result == 'success' && (needs.push-migrations.result == 'success' || (needs.plan.outputs.pending == 'false' && needs.push-migrations.result == 'skipped'))",
    )
    expect(deploy).not.toMatch(/always\(\)/)
    expect(deploy).toContain('secrets.VERCEL_DEPLOY_HOOK_URL')
    expect(deploy).toContain("if: steps.hook.outcome == 'success' && steps.hook.outputs.since != ''")
  })

  // Runs queue in order instead of replacing each other, and never cancel one mid-migration.
  it('never overlaps or drops a queued run', () => {
    expect(workflow).toMatch(/\nconcurrency:\n {2}group: prod-db\n {2}cancel-in-progress: false\n {2}queue: max\n/)
  })

  // Only main deploys, and prod secrets live in the Production environment, which only main may use (#291).
  it.each([
    ['deploy-production.yml', deployJobs],
    ['backups.yml', backupJobs],
  ])('%s: every job runs only from main, in the Production environment', (_, blocks) => {
    expect(Object.keys(blocks).length).toBeGreaterThan(0)
    for (const [name, block] of Object.entries(blocks)) {
      expect(block, name).toContain('environment: Production')
      expect(block, name).toMatch(/steps: - name: Only from main if: github\.ref != 'refs\/heads\/main' run: \| .*? exit 1/)
      expect(block.indexOf('steps:'), name).toBe(block.indexOf(`steps: ${mainGuard}`))
    }
  })

  it('reads no secret outside a job', () => {
    for (const source of [workflow, backups]) {
      expect(source.slice(0, source.indexOf('\njobs:\n'))).not.toContain('secrets.')
    }
  })

  // A ::add-mask:: line printed inside $(...) is captured, never registered, so the masks come
  // from a step of their own, given every backup secret the job uses, before backup.sh runs.
  it.each([
    ['deploy-production.yml', deployJobs],
    ['backups.yml', backupJobs],
  ])('%s: every job with a backup secret masks it in its own step first', (_, blocks) => {
    const maskStep = /- name: Mask secrets env: ((?:[A-Z_]+: \$\{\{ secrets\.[A-Z_]+ \}\} )+)run: scripts\/backup\/mask-secrets\.sh(?: |$)/
    let guarded = 0
    for (const [name, block] of Object.entries(blocks)) {
      const secrets = ['SUPABASE_DB_URL', 'BACKUP_REPO_TOKEN'].filter((s) => block.includes(`${s}: \${{ secrets.${s} }}`))
      if (secrets.length === 0) continue
      guarded++
      const mask = block.match(maskStep)
      expect(mask, name).not.toBeNull()
      const [start, end] = [mask!.index!, mask!.index! + mask![0].length]
      for (const secret of secrets) {
        const first = block.indexOf(`${secret}: \${{ secrets.${secret} }}`)
        expect(first > start && first < end, `${name}: ${secret} is first given to the mask step`).toBe(true)
      }
      expect(block.indexOf('$(scripts/backup/backup.sh'), name).toBeGreaterThan(end)
      for (const capture of block.matchAll(/SEALED=\$\(scripts\/backup\/backup\.sh [^)]*"\$OUT"[^)]*\) (.*?) mapfile -t FILES <<<"\$SEALED"/g)) {
        expect(capture[1], name).toBe('scripts/backup/check-sealed.sh "$OUT" <<<"$SEALED"')
      }
      expect(block.match(/SEALED=\$\(/g)?.length, name).toBe(block.match(/check-sealed\.sh "\$OUT" <<<"\$SEALED"/g)?.length)
    }
    expect(guarded).toBeGreaterThan(0)
  })

  it('leaves masking to mask-secrets.sh: backup.sh prints no ::add-mask::', () => {
    expect(readFileSync(path.join(root, 'scripts/backup/backup.sh'), 'utf8')).not.toContain('::add-mask::')
  })

  // A migration can't land between the nightly dump's schema and data files.
  it('queues the nightly database backup behind deploys', () => {
    expect(backupJobs.database).toContain('concurrency: group: prod-db cancel-in-progress: false queue: max')
  })
})
