// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import Link from 'next/link'
import { render, screen } from '@testing-library/react'

vi.mock('@/lib/tasks/review-task-completion', () => ({
  approveTaskCompletionAction: vi.fn(),
  rejectTaskCompletionAction: vi.fn(),
  bulkApproveTaskCompletionsAction: vi.fn(),
  bulkRejectTaskCompletionsAction: vi.fn(),
}))
vi.mock('@/lib/tasks/update-task', () => ({ updateTaskAction: vi.fn() }))
vi.mock('@/lib/admin/owner-actions', () => ({ deleteTaskAction: vi.fn() }))

import { ListCard } from '@/components/ui/list-card'
import { TaskRow } from '@/components/tasks/task-row'
import { AwaitingMarketRow } from '@/components/admin/awaiting-market-row'
import { LeaderboardRow } from '@/components/leaderboard/leaderboard-row'
import { MemberRow } from '@/app/(app)/admin/members/member-row'
import { PendingApprovals } from '@/app/(app)/admin/(sections)/tasks/pending-approvals'
import { TaskCatalogItem } from '@/app/(app)/admin/(sections)/tasks/task-catalog-item'
import { CancelledBetRows } from '@/app/(app)/bets/bet-rows'

const root = path.resolve(import.meta.dirname, '../..')
const source = (file: string) => readFileSync(path.join(root, file), 'utf8')

// The card's look, from the My bets parlay card (#328).
function expectListCard(el: Element | null) {
  expect(el).not.toBeNull()
  expect(el).toHaveClass('rounded-tile', 'border', 'border-line', 'p-3.5', 'md:p-4')
  expect(el).not.toHaveClass('shadow-card')
}

describe('ListCard', () => {
  it('is a bordered 14px tile that tints flush under a mouse and never lifts', () => {
    render(
      <ul>
        <ListCard>
          <Link href="/markets/k1" className="stretched-link">
            Will it rain?
          </Link>
        </ListCard>
      </ul>,
    )
    const card = screen.getByRole('listitem')
    expectListCard(card)
    expect(card).toHaveClass('pressable', 'hover-tint', 'relative', '[--tint-inset:0]')
    expect(card).not.toHaveClass('hover-lift')
  })

  it('doesn’t press when nothing opens it', () => {
    render(
      <ul>
        <ListCard tappable={false}>Read Genesis 1-3</ListCard>
      </ul>,
    )
    const card = screen.getByRole('listitem')
    expectListCard(card)
    expect(card).not.toHaveClass('pressable')
    expect(card).not.toHaveClass('hover-tint')
  })

  it('takes its radius from the --radius-tile token', () => {
    expect(source('app/globals.css')).toMatch(/--radius-tile:\s*14px;/)
  })
})

describe('lists that open one thing are ListCards (#328)', () => {
  it('cancelled bets', () => {
    const { container } = render(
      <CancelledBetRows
        rowIdPrefix="cancelled"
        bets={[{ id: 2, marketId: 'k1', marketTitle: 'Will it rain?', outcomeLabel: 'No', amount: 5, cancelledAt: '2026-09-25T12:00:00Z' }]}
      />,
    )
    expectListCard(container.querySelector('li'))
    expect(container.querySelector('ul')).not.toHaveClass('divide-y')
  })

  it('tasks, with the action beside the text', () => {
    const { container } = render(
      <ul>
        <TaskRow title="Read Genesis 1-3" rewardAmount={10} description={null} state={{ kind: 'available' }} action={<button type="button">I did this</button>} />
      </ul>,
    )
    const card = container.querySelector('li')
    expectListCard(card)
    expect(card).not.toHaveClass('pressable')
  })

  it('markets waiting to be resolved, opened by their title, with the creator and Resolve above the cover', () => {
    render(
      <ul>
        <AwaitingMarketRow
          market={{ id: 'k1', title: 'Will it rain?', closeAt: '2026-09-25T12:00:00Z', creatorId: 'm1', creatorName: 'Grace', pooled: 30 }}
          now={Date.parse('2026-09-26T12:00:00Z')}
        />
      </ul>,
    )
    const card = screen.getByRole('listitem')
    expectListCard(card)
    expect(card).toHaveClass('pressable', 'hover-tint')
    expect(screen.getByRole('link', { name: 'Will it rain?' })).toHaveClass('stretched-link')
    for (const name of ['Grace', 'Resolve Will it rain?']) {
      expect(screen.getByRole('link', { name }).closest('.z-\\[1\\]'), name).not.toBeNull()
    }
  })

  it('the task catalog', () => {
    const { container } = render(
      <ul>
        <TaskCatalogItem
          task={{ id: 't1', title: 'Read Genesis 1-3', description: null, rewardAmount: 10, isRepeatable: false, period: null, isActive: true, proofRequired: false }}
        />
      </ul>,
    )
    expectListCard(container.querySelector('li'))
  })

  it('pending approvals, with a row’s Approve still the first one', () => {
    const { container } = render(
      <PendingApprovals
        viewerId="p-me"
        pending={[
          {
            id: 'c1',
            taskTitle: 'Read Genesis 1-3',
            submitterId: 'p-alice',
            submitterName: 'Alice',
            rewardAmount: 10,
            submittedAt: '2026-09-25T09:00:00Z',
            submittedAge: '1h ago',
            note: null,
            proof: [],
          },
        ]}
      />,
    )
    expectListCard(container.querySelector('li'))
    expect(container.querySelector('ul')).not.toHaveClass('divide-y')
    expect(screen.getAllByRole('button', { name: /^Approve/ })[0]).toHaveAccessibleName('Approve Alice’s Read Genesis 1-3')
  })

  it('the leaderboard, with your own card tinted', () => {
    const { container } = render(
      <ol>
        <LeaderboardRow rank={2} name="Grace" score={120} isMe href="/members/m1" />
      </ol>,
    )
    const card = container.querySelector('li')
    expectListCard(card)
    expect(card).toHaveClass('bg-acc-soft', 'pressable', 'hover-tint')
  })

  it('admin members gain the border below lg, and stay lifted cards from lg', () => {
    const { container: members } = render(
      <ul>
        <MemberRow
          domId="member-m1"
          now={Date.parse('2026-09-28T12:00:00Z')}
          member={{ id: 'm1', displayName: 'Grace', avatarSrc: null, email: 'g@example.com', balance: 90, role: 'member', joinedAt: null, lastSignInAt: null, removed: false }}
        />
      </ul>,
    )
    const card = members.querySelector('li')
    expectListCard(card)
    expect(card).toHaveClass('lg:rounded-card', 'lg:shadow-card', 'lg:hover-lift')
  })

  it('lay out per the approved grid, with no dividers', () => {
    const lists: [string, RegExp][] = [
      ['app/(app)/bets/bet-rows.tsx', /lg:grid-cols-3/],
      ['app/(app)/admin/(sections)/markets/page.tsx', /lg:grid-cols-3/],
      ['app/(app)/tasks/page.tsx', /lg:grid-cols-2/],
      ['app/(app)/admin/(sections)/tasks/page.tsx', /lg:grid-cols-2/],
      ['app/(app)/admin/(sections)/tasks/pending-approvals.tsx', /lg:grid-cols-2/],
    ]
    for (const [file, grid] of lists) {
      const text = source(file)
      expect(text, file).toMatch(grid)
      expect(text, file).toMatch(/listCardsClass/)
      expect(text, file).not.toMatch(/divide-y/)
    }
    expect(source('app/(app)/leaderboard/page.tsx')).toMatch(/<ol className=\{listCardsClass\}>/)
  })
})
