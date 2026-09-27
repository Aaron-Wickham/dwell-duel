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
import ParlaysLoading from '@/app/(app)/parlays/loading'
import TasksLoading from '@/app/(app)/tasks/loading'
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
  ['parlays', ParlaysLoading],
  ['tasks', TasksLoading],
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
})
