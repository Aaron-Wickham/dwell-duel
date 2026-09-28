// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { LedgerEntry } from '@/lib/ledger/list-transactions'
import { LedgerRow } from '@/components/admin/ledger-row'
import { formatDay } from '@/lib/markets/format-date'

function renderRow(overrides: Partial<LedgerEntry>) {
  const entry: LedgerEntry = {
    id: 1,
    profileId: 'p-mia',
    memberName: 'Mia',
    amount: 10,
    type: 'Task reward',
    context: 'Task approved: Read Genesis 1-3',
    createdAt: new Date(Date.now() - 5 * 60_000).toISOString(),
    ...overrides,
  }
  render(
    <ul>
      <LedgerRow entry={entry} />
    </ul>,
  )
}

describe('LedgerRow', () => {
  it('shows a credit as a plus amount, linked to the member, with its age and context', () => {
    renderRow({})
    expect(screen.getByText('+10 DC')).toHaveClass('text-win')
    expect(screen.getByRole('listitem')).toHaveTextContent('Mia: +10 DC — Task approved: Read Genesis 1-3')
    expect(screen.getByRole('link', { name: 'Mia' })).toHaveAttribute('href', '/members/p-mia')
    expect(screen.getByText('5m ago')).toBeInTheDocument()
  })

  it('shows a debit as a minus amount, with the adjustment reason', () => {
    renderRow({ amount: -15, context: 'Admin adjustment — “Task was claimed twice”' })
    expect(screen.getByText('−15 DC')).toHaveClass('text-loss')
    expect(screen.getByRole('listitem')).toHaveTextContent('Mia: −15 DC — Admin adjustment — “Task was claimed twice”')
  })

  it('shows a zero amount as neutral, with no sign', () => {
    renderRow({ amount: 0, context: 'Admin adjustment — “Correcting a typo”' })
    const amount = screen.getByText('0 DC')
    expect(amount).toHaveClass('text-ink2')
    expect(amount).not.toHaveClass('text-win')
    expect(amount).not.toHaveClass('text-loss')
    expect(screen.getByRole('listitem')).toHaveTextContent('Mia: 0 DC — Admin adjustment — “Correcting a typo”')
  })

  it('shows a bet win context line', () => {
    renderRow({ context: 'Bet won: Will it rain?' })
    expect(screen.getByRole('listitem')).toHaveTextContent('— Bet won: Will it rain?')
  })

  it('shows a bet stake context line', () => {
    renderRow({ context: 'Bet on Yes in Will it rain?' })
    expect(screen.getByRole('listitem')).toHaveTextContent('— Bet on Yes in Will it rain?')
  })

  it("shows a recent row's relative age", () => {
    renderRow({ createdAt: new Date(Date.now() - 60 * 60_000).toISOString() })
    expect(screen.getByText('1h ago')).toBeInTheDocument()
  })

  it('shows a calendar date instead of a relative age once a row is over a week old', () => {
    const createdAt = new Date(Date.now() - 8 * 24 * 60 * 60_000).toISOString()
    renderRow({ createdAt })
    expect(screen.queryByText(/ago$/)).not.toBeInTheDocument()
    const time = screen.getByRole('listitem').querySelector('time')
    expect(time).toHaveAttribute('datetime', createdAt)
    expect(time).toHaveTextContent(formatDay(createdAt))
  })

  it('is a focus target named from its own line when given a DOM id', () => {
    render(
      <ul>
        <LedgerRow
          entry={{
            id: 7,
            profileId: 'p-mia',
            memberName: 'Mia',
            amount: 10,
            type: 'Task reward',
            context: 'Task approved: Read Genesis 1-3',
            createdAt: new Date(Date.now() - 5 * 60_000).toISOString(),
          }}
          domId="ledger-7"
        />
      </ul>,
    )
    const row = screen.getByRole('listitem', { name: /^Mia: \+10 DC — Task approved: Read Genesis 1-3/ })
    expect(row).toHaveAttribute('id', 'ledger-7')
    expect(row).toHaveAttribute('tabindex', '-1')
  })
})
