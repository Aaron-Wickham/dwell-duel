// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import type { ComponentType } from 'react'
import { render, screen } from '@testing-library/react'

vi.mock('react', async (importOriginal) =>
  (await import('@/tests/components/view-transition-mock')).withViewTransition(await importOriginal()),
)

import HomeLoading from '@/app/(app)/(home)/loading'
import MarketsLoading from '@/app/(app)/markets/(list)/loading'
import CreateMarketLoading from '@/app/(app)/markets/new/loading'
import BetsLoading from '@/app/(app)/bets/loading'
import TasksLoading from '@/app/(app)/tasks/loading'
import ProfileLoading from '@/app/(app)/profile/loading'
import SettingsLoading from '@/app/(app)/settings/loading'
import HowItWorksLoading from '@/app/(app)/how-it-works/loading'
import FeedLoading from '@/app/(app)/feed/loading'
import LeaderboardLoading from '@/app/(app)/leaderboard/loading'
import AdminInvitesLoading from '@/app/(app)/admin/invites/loading'
import AdminTasksLoading from '@/app/(app)/admin/tasks/loading'
import AdminMembersLoading from '@/app/(app)/admin/members/loading'
import AdminLedgerLoading from '@/app/(app)/admin/ledger/loading'

const SKELETONS: [string, ComponentType][] = [
  ['home', HomeLoading],
  ['markets', MarketsLoading],
  ['create-market', CreateMarketLoading],
  ['bets', BetsLoading],
  ['tasks', TasksLoading],
  ['profile', ProfileLoading],
  ['settings', SettingsLoading],
  ['how-it-works', HowItWorksLoading],
  ['feed', FeedLoading],
  ['leaderboard', LeaderboardLoading],
  ['admin-invites', AdminInvitesLoading],
  ['admin-tasks', AdminTasksLoading],
  ['admin-members', AdminMembersLoading],
  ['admin-ledger', AdminLedgerLoading],
]

describe.each(SKELETONS)('the %s skeleton', (name, Loading) => {
  it('is named, announces loading, and shows nothing but hidden blocks', () => {
    const { container } = render(<Loading />)

    expect(container.querySelector(`[data-skeleton="${name}"]`)).not.toBeNull()
    expect(screen.getByRole('status')).toHaveTextContent('Loading…')
    expect(container.querySelectorAll('.skeleton').length).toBeGreaterThan(3)
    for (const block of container.querySelectorAll('.skeleton')) {
      expect(block).toHaveAttribute('aria-hidden', 'true')
    }
    // Page e2e specs count headings, list items, links and buttons; a skeleton must add none.
    for (const role of ['heading', 'listitem', 'link', 'button', 'region'] as const) {
      expect(screen.queryAllByRole(role)).toHaveLength(0)
    }
    expect(container).toHaveTextContent(/^Loading…$/)
  })

  it('fills its page column, with no left-pinned width cap', () => {
    const { container } = render(<Loading />)
    expect(container.innerHTML).not.toMatch(/max-w-\[(720|820)px\]/)
  })
})

describe('skeletons of reading-width pages', () => {
  it.each([
    ['feed', FeedLoading],
    ['how-it-works', HowItWorksLoading],
  ] as const)('the %s skeleton is centred at the reading width, like its page', (name, Loading) => {
    const { container } = render(<Loading />)
    expect(container.querySelector(`[data-skeleton="${name}"]`)).toHaveClass('max-w-[980px]', 'mx-auto')
  })
})
