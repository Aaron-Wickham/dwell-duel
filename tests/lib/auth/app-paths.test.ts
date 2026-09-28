import { describe, it, expect } from 'vitest'
import { readdirSync } from 'node:fs'
import path from 'node:path'
import { isAppPath } from '@/lib/auth/app-paths'

// A route group's own folder never becomes a URL segment, so it's never a section — but a
// section can live inside one (app/(app)/(home)/profile/), so the guard has to look inside.
function collectSections(dir: string): string[] {
  const sections: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    if (entry.name.startsWith('(')) {
      sections.push(...collectSections(path.join(dir, entry.name)))
    } else if (!entry.name.startsWith('_') && !entry.name.startsWith('[')) {
      sections.push(entry.name)
    }
  }
  return sections
}

describe('isAppPath', () => {
  it('covers Home and every signed-in section, at any depth', () => {
    for (const p of [
      '/',
      '/markets',
      '/markets/new',
      '/markets/3f2b8c1e-9d4a-4e6b-8a7c-1b2d3e4f5a6b',
      '/bets',
      '/parlays',
      '/tasks',
      '/feed',
      '/leaderboard',
      '/members/3f2b8c1e-9d4a-4e6b-8a7c-1b2d3e4f5a6b',
      '/profile',
      '/admin/invites',
      '/admin/ledger',
    ]) {
      expect(isAppPath(p), p).toBe(true)
    }
  })

  it('leaves the public routes and look-alike paths alone', () => {
    for (const p of [
      '/sign-in',
      '/callback',
      '/not-invited',
      '/offline',
      '/sw.js',
      '/manifest.webmanifest',
      '/api/cron/keep-alive',
      '/marketsx',
      '/this-page-does-not-exist',
    ]) {
      expect(isAppPath(p), p).toBe(false)
    }
  })

  it('knows every top-level folder in app/(app)', () => {
    const dir = path.resolve(import.meta.dirname, '../../../app/(app)')
    const sections = collectSections(dir)
    expect(sections.length).toBe(9)
    for (const section of sections) {
      expect(isAppPath(`/${section}`), section).toBe(true)
    }
  })
})
