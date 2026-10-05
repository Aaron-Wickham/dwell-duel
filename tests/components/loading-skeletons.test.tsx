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
import AdminInvitesLoading from '@/app/(app)/admin/(sections)/invites/loading'
import AdminTasksLoading from '@/app/(app)/admin/(sections)/tasks/loading'
import AdminMembersLoading from '@/app/(app)/admin/(sections)/members/loading'
import AdminLedgerLoading from '@/app/(app)/admin/(sections)/ledger/loading'
import AdminMarketsLoading from '@/app/(app)/admin/(sections)/markets/loading'

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
  ['admin-markets', AdminMarketsLoading],
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

// Each skeleton draws the same rows and columns as its loaded page, so nothing jumps when the
// content lands (#218).
describe('skeletons match their pages', () => {
  const withClass = (container: HTMLElement, cls: string) =>
    [...container.querySelectorAll<HTMLElement>('.skeleton')].filter((b) => b.classList.contains(cls))

  it('the markets skeleton stands in for the filter tabs above the cards', () => {
    const { container } = render(<MarketsLoading />)
    const bar = withClass(container, 'h-[52px]')
    expect(bar).toHaveLength(1)
    expect(bar[0]).toHaveClass('rounded-tile', 'md:w-80')
    expect(container.querySelector('.lg\\:grid-cols-3')).not.toBeNull()
  })

  it('the leaderboard skeleton stands a three-place podium above the rankings', () => {
    const { container } = render(<LeaderboardLoading />)
    const podium = container.querySelector('.items-end.justify-center')!
    expect(podium.children).toHaveLength(3)
    // Drawn in DOM order first, second, third and placed second, first, third, as the podium is.
    expect([...podium.children].map((place) => place.className)).toEqual([
      expect.stringContaining('order-2'),
      expect.stringContaining('order-1'),
      expect.stringContaining('order-3'),
    ])
    expect(withClass(container, 'h-[72px]')).toHaveLength(1)
    expect(container.querySelectorAll('.rounded-tile.border-line')).toHaveLength(6)
  })

  it('the leaderboard skeleton puts a side card beside the rankings at lg', () => {
    const { container } = render(<LeaderboardLoading />)
    const grid = container.querySelector('[class*="lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]"]')!
    expect(grid.children).toHaveLength(2)
    expect(grid.children[1]).toHaveClass('hidden', 'lg:flex')
  })

  // #388: only what every member sees, so nothing conditional: Your bets' and Activity's three
  // rows each, and the Balance card, shown from lg.
  it('the home skeleton draws Your bets and Activity with three rows each, and the desktop Balance card', () => {
    const { container } = render(<HomeLoading />)
    const lists = container.querySelectorAll('.divide-y')
    expect(lists).toHaveLength(2)
    for (const list of lists) expect(list.children).toHaveLength(3)
    expect(container.querySelector('.bg-acc-soft')).toHaveClass('hidden', 'lg:flex')
  })

  it('the feed skeleton draws four reaction pills under every row', () => {
    const { container } = render(<FeedLoading />)
    const rows = container.querySelectorAll('[data-skeleton-reactions]')
    expect(rows).toHaveLength(6)
    for (const row of rows) expect(row.querySelectorAll('.skeleton.rounded-full.h-11')).toHaveLength(4)
  })

  it('the settings skeleton draws the theme legend and hint, and every notification kind', () => {
    const { container } = render(<SettingsLoading />)
    const cards = container.querySelectorAll('.rounded-card')
    const segmented = cards[0].querySelector('.h-\\[52px\\]')!
    expect(segmented.previousElementSibling).toHaveClass('mb-1.5')
    expect(segmented.nextElementSibling).toHaveClass('h-5')
    const notifications = cards[3]
    expect(notifications.querySelectorAll('.size-\\[22px\\]')).toHaveLength(4)
    // The device status button and the save button.
    expect(notifications.querySelectorAll('.skeleton.h-11')).toHaveLength(2)
  })

  it('the edit-profile skeleton previews a heading, its description and a name as wide as a name', () => {
    const { container } = render(<ProfileLoading />)
    const preview = container.querySelectorAll('.rounded-card')[1]
    expect(preview.querySelector('.h-6')).not.toBeNull()
    expect(preview.querySelector('.h-5.w-72')).not.toBeNull()
    expect(preview.querySelector('.size-20 + .h-11.w-56')).not.toBeNull()
  })
})
