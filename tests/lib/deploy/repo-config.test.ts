import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import nextConfig from '../../../next.config'

const root = path.resolve(import.meta.dirname, '../../..')
const read = (file: string) => readFileSync(path.join(root, file), 'utf8')
const pkg = JSON.parse(read('package.json'))

describe('hardening (#276)', () => {
  it('hides the framework header and denies camera, microphone and location', async () => {
    expect(nextConfig.poweredByHeader).toBe(false)
    const rules = (await nextConfig.headers?.()) ?? []
    const all = rules.find((rule) => rule.source === '/:path*')
    const policy = all?.headers.find((h) => h.key === 'Permissions-Policy')
    expect(policy?.value).toBe('camera=(), microphone=(), geolocation=()')
  })

  it('keeps next and eslint-config-next on one exact version, at least 16.3.8', () => {
    const next = pkg.dependencies.next
    expect(pkg.devDependencies['eslint-config-next']).toBe(next)
    const [major, minor, patch] = next.split('.').map(Number)
    expect(major * 1e6 + minor * 1e3 + patch).toBeGreaterThanOrEqual(16_003_008)
  })
})

describe('Node and CI hygiene (#277)', () => {
  it('pins Vercel to the major CI and .nvmrc use', () => {
    const major = read('.nvmrc').trim()
    expect(pkg.engines.node).toBe(`${major}.x`)
  })

  // Enforced in repo settings too; this fails in the PR that adds an unpinned action.
  it('pins every third-party action to a full commit SHA', () => {
    const files = [
      ...readdirSync(path.join(root, '.github/workflows')).map((f) => `.github/workflows/${f}`),
      '.github/actions/local-supabase/action.yml',
    ]
    const unpinned: string[] = []
    for (const file of files) {
      for (const line of read(file).split('\n')) {
        const uses = line.match(/^\s*(?:-\s*)?uses:\s*(\S+)/)?.[1]
        if (!uses || uses.startsWith('./')) continue
        if (!/@[0-9a-f]{40}$/.test(uses)) unpinned.push(`${file}: ${uses}`)
      }
    }
    expect(unpinned).toEqual([])
  })

  it('keys the Next cache on the lockfile alone and saves it only from warm-caches', () => {
    const ci = read('.github/workflows/ci.yml')
    expect(ci).not.toMatch(/hashFiles\('app/)
    expect(ci).not.toMatch(/uses: actions\/cache@/)
    const warm = read('.github/workflows/warm-caches.yml')
    expect(warm).toMatch(/uses: actions\/cache@/)
    expect(warm).toContain("'package-lock.json'")
  })
})
