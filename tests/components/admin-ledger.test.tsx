// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { LedgerEntry } from '@/lib/ledger/list-transactions'
import { LedgerRow } from '@/components/admin/ledger-row'

function renderRow(overrides: Partial<LedgerEntry>) {
  const entry: LedgerEntry = {
    id: 1,
    profileId: 'p-mia',
    memberName: 'Mia',
    amount: 10,
    type: 'Task reward',
    reason: null,
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
  it('shows a credit as a plus amount, linked to the member, with its age', () => {
    renderRow({})
    expect(screen.getByText('+10 DC')).toHaveClass('text-win')
    expect(screen.getByRole('listitem')).toHaveTextContent('Mia: +10 DC — Task reward')
    expect(screen.getByRole('link', { name: 'Mia' })).toHaveAttribute('href', '/members/p-mia')
    expect(screen.getByText('5m ago')).toBeInTheDocument()
  })

  it('shows a debit as a minus amount, with the adjustment reason', () => {
    renderRow({ amount: -15, type: 'Admin adjustment', reason: 'Task was claimed twice' })
    expect(screen.getByText('−15 DC')).toHaveClass('text-loss')
    expect(screen.getByRole('listitem')).toHaveTextContent('Mia: −15 DC — Admin adjustment — “Task was claimed twice”')
  })
})
