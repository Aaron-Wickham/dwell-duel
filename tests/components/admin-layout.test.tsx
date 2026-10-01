// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { render, screen } from '@testing-library/react'

vi.mock('react', async (importOriginal) =>
  (await import('@/tests/components/view-transition-mock')).withViewTransition(await importOriginal()),
)

vi.mock('next/navigation', () => ({
  usePathname: () => '/admin/tasks',
  useSearchParams: () => new URLSearchParams(''),
  useRouter: () => ({ back: vi.fn(), push: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  redirect: vi.fn(),
}))

vi.mock('@/lib/auth/require-user', () => ({
  requireUser: async () => ({ supabase: {}, user: { id: 'reviewer1' } }),
}))

vi.mock('@/lib/auth/roles', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/auth/roles')>()),
  getRole: async () => 'reviewer',
}))

vi.mock('@/lib/admin/cron-health', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/admin/cron-health')>()),
  readClosingAlertsHealth: async () => ({ stale: false }),
}))

vi.mock('@/lib/admin/review-counts', () => ({
  getReviewCounts: async () => ({ tasks: 0, markets: 0 }),
}))

import AdminLayout from '@/app/(app)/admin/(sections)/layout'

describe('the Admin layout', () => {
  it('links every reviewer and above to the Admin guide, docs/ADMIN-GUIDE.md on GitHub (#283)', async () => {
    render(await AdminLayout({ children: null }))

    const link = screen.getByRole('link', { name: 'the Admin guide' })
    const href = link.getAttribute('href')!
    expect(href).toBe('https://github.com/Aaron-Wickham/dwell-duel/blob/main/docs/ADMIN-GUIDE.md')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noreferrer')
    // The link names a path in this repo, so moving or renaming the guide fails here.
    const repoPath = href.replace('https://github.com/Aaron-Wickham/dwell-duel/blob/main/', '')
    expect(existsSync(path.resolve(import.meta.dirname, '../..', repoPath))).toBe(true)
  })
})
