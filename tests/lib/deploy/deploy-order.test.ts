import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '../../..')
const vercel = JSON.parse(readFileSync(path.join(root, 'vercel.json'), 'utf8'))
const workflow = readFileSync(path.join(root, '.github/workflows/deploy-production.yml'), 'utf8')

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

  it('deploys the app only after the migration push, through the deploy hook', () => {
    expect(workflow).toMatch(/deploy-app:\s*\n\s*needs: \[changes, push-migrations\]/)
    expect(workflow).toContain("needs.push-migrations.result == 'success'")
    expect(workflow).toContain('secrets.VERCEL_DEPLOY_HOOK_URL')
  })
})
