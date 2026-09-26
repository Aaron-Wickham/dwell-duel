import { describe, it, expect } from 'vitest'
import { readdirSync } from 'node:fs'
import path from 'node:path'
import { isAppPath } from '@/lib/auth/app-paths'

describe('isAppPath', () => {
  it('covers Home and every signed-in section, at any depth', () => {
    for (const p of [
      '/',
      '/markets',
      '/markets/new',
      '/markets/3f2b8c1e-9d4a-4e6b-8a7c-1b2d3e4f5a6b',
      '/parlays',
      '/tasks',
      '/feed',
      '/leaderboard',
      '/members/3f2b8c1e-9d4a-4e6b-8a7c-1b2d3e4f5a6b',
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
    const sections = readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith('('))
      .map((entry) => entry.name)
    expect(sections.length).toBeGreaterThan(0)
    for (const section of sections) {
      expect(isAppPath(`/${section}`), section).toBe(true)
    }
  })
})
