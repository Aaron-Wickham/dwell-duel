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

// A row of a list inside a SectionCard (D2, #386): no border or corners of its own.
function expectDividedRow(el: Element | null) {
  expect(el).not.toBeNull()
  expect(el).toHaveClass('py-3.5')
  expect(el).not.toHaveClass('border', 'rounded-tile')
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

// D2 (#386, superseding #328's nesting): a list that is a page's only content is ListCards on the
// page; a list inside a SectionCard is divided rows.
describe('a page-level list is ListCards', () => {
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

  // #399: admin members are data, so a table (divided rows on a phone), not cards.
  it('admin members are table rows, not cards', () => {
    const { container: members } = render(
      <table>
        <tbody>
          <MemberRow
            domId="member-m1"
            netWorth={120}
            member={{ id: 'm1', displayName: 'Grace', avatarSrc: null, email: 'g@example.com', balance: 90, role: 'member', joinedAt: null, lastSignInAt: null, removed: false }}
          />
        </tbody>
      </table>,
    )
    const row = members.querySelector('tr')!
    expect(row).not.toHaveClass('rounded-tile')
    expect(row).not.toHaveClass('hover-lift')
  })

  it('sit on the page per the approved grid, spaced with no dividers or card around them', () => {
    const lists: [string, RegExp][] = [
      ['app/(app)/bets/bet-rows.tsx', /lg:grid-cols-2/],
    ]
    for (const [file, grid] of lists) {
      const text = source(file)
      expect(text, file).toMatch(grid)
      expect(text, file).toMatch(/listCardsClass/)
      expect(text, file).not.toMatch(/divide-y/)
    }
    for (const page of ['app/(app)/bets/page.tsx', 'app/(app)/admin/(sections)/members/page.tsx']) {
      expect(source(page), page).not.toMatch(/SectionCard/)
    }
  })
})

describe('a list inside a SectionCard is divided rows', () => {
  it('markets waiting to be resolved, opened by their title, with the creator and Resolve above the cover', () => {
    render(
      <ul>
        <AwaitingMarketRow
          market={{ id: 'k1', title: 'Will it rain?', closeAt: '2026-09-25T12:00:00Z', creatorId: 'm1', creatorName: 'Grace', pooled: 30 }}
          now={Date.parse('2026-09-26T12:00:00Z')}
        />
      </ul>,
    )
    const row = screen.getByRole('listitem')
    expectDividedRow(row)
    expect(row).toHaveClass('pressable', 'hover-tint', 'relative')
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
    expectDividedRow(container.querySelector('li'))
  })

  // #399: a table (divided rows on a phone), with the bulk bar above it.
  it('pending approvals, as divided table rows, each with its own Approve', () => {
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
    expect(container.querySelector('tbody')).toHaveClass('divide-y')
    expect(container.querySelector('tbody tr')).not.toHaveClass('rounded-tile')
    expect(screen.getAllByRole('button', { name: /^Approve(?! selected)/ })[0]).toHaveAccessibleName('Approve Alice’s Read Genesis 1-3')
  })


  // #394: grouped under visible headings, a task's row needs no card of its own.
  it('tasks, divided rows on the page under each group’s heading, with the action beside the text', () => {
    const { container } = render(
      <ul>
        <TaskRow title="Read Genesis 1-3" rewardAmount={10} description={null} cadence="once" state={{ kind: 'todo' }} action={<button type="button">I did this</button>} />
      </ul>,
    )
    expectDividedRow(container.querySelector('li'))
    expect(container.querySelector('li')).not.toHaveClass('pressable')
    const page = source('app/(app)/tasks/page.tsx')
    expect(page).toMatch(/<ul className=\{dividedRowsClass\}>/)
    expect(page).not.toMatch(/SectionCard|listCardsClass/)
  })

  it('the leaderboard, rows on the page with your own row tinted', () => {
    const { container } = render(
      <ol>
        <LeaderboardRow rank={2} name="Grace" score={120} isMe href="/members/m1" />
      </ol>,
    )
    const row = container.querySelector('li')
    expect(row).not.toHaveClass('border')
    expect(row).toHaveClass('bg-acc-soft', 'pressable', 'hover-tint')
    expect(source('app/(app)/leaderboard/page.tsx')).toMatch(/<ol className=\{dividedRowsClass\}>/)
  })

  it('no SectionCard holds a ListCard', () => {
    for (const file of [
      'app/(app)/admin/(sections)/markets/page.tsx',
      'app/(app)/admin/(sections)/tasks/page.tsx',
      'app/(app)/admin/(sections)/tasks/pending-approvals.tsx',
      'components/admin/category-card.tsx',
      'components/admin/awaiting-market-row.tsx',
      'app/(app)/admin/(sections)/tasks/task-catalog-item.tsx',
    ]) {
      const text = source(file)
      expect(text, file).not.toMatch(/listCardsClass|<ListCard/)
    }
  })
})
