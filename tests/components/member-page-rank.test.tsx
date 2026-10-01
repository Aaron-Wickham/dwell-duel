// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('react', async (importOriginal) =>
  (await import('@/tests/components/view-transition-mock')).withViewTransition(await importOriginal()),
)

vi.mock('next/navigation', () => ({
  usePathname: () => '/members/x',
  useRouter: () => ({ back: vi.fn() }),
  notFound: vi.fn(),
  redirect: vi.fn(),
}))

vi.mock('@/lib/auth/require-user', () => ({
  requireUser: async () => ({ supabase: {}, user: { id: 'viewer' } }),
}))

const { getMemberStanding } = vi.hoisted(() => ({ getMemberStanding: vi.fn() }))
vi.mock('@/lib/social/leaderboard', () => ({ getMemberStanding }))
vi.mock('@/components/live/live-tables', () => ({ LiveTables: () => null }))
vi.mock('@/components/ui/history-back-link', () => ({ HistoryBackLink: () => null }))
vi.mock('@/app/(app)/members/[id]/member-stats', () => ({ MemberStats: () => null }))
vi.mock('@/app/(app)/members/[id]/member-activity', () => ({ MemberActivity: () => null }))

import MemberPage from '@/app/(app)/members/[id]/page'

const ID = '00000000-0000-4000-8000-0000000000b1'
const STANDING = { id: ID, displayName: 'Ben', avatarSrc: null, bio: null, balance: 60, score: 80, rank: 2, memberCount: 9 }

async function renderPage() {
  render(await MemberPage({ params: Promise.resolve({ id: ID }), searchParams: Promise.resolve({}) } as never))
}

describe('a member’s rank on their profile', () => {
  it('shows their place on the net-worth board', async () => {
    getMemberStanding.mockResolvedValue(STANDING)
    await renderPage()
    expect(screen.getByText(/80 DC net worth/)).toHaveTextContent('80 DC net worth · Rank 2 of 9')
  })

  // #265: a removed member keeps their profile and net worth, but isn't ranked.
  it('says a removed member isn’t ranked', async () => {
    getMemberStanding.mockResolvedValue({ ...STANDING, rank: null })
    await renderPage()
    expect(screen.getByText(/80 DC net worth/)).toHaveTextContent('80 DC net worth · Not ranked')
  })
})
