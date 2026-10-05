// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { WagerRows } from '@/app/(app)/bets/bet-rows'
import type { MyBet } from '@/lib/bets/list-my-bets'

function bet(overrides: Partial<MyBet>): MyBet {
  return {
    id: 1,
    marketId: 'k1',
    marketTitle: 'Will it rain on the picnic?',
    outcomeLabel: 'Yes',
    amount: 10,
    placedAt: '2026-09-25T12:00:00Z',
    closeAt: '2026-10-18T12:00:00Z',
    pays: 18,
    result: { kind: 'open' },
    ...overrides,
  }
}

function renderBet(b: MyBet) {
  render(<WagerRows rowIdPrefix="open" wagers={[{ kind: 'bet', key: `bet:${b.id}`, bet: b }]} />)
}

const line = (text: string) => screen.getByText((_, el) => el?.tagName === 'P' && el.textContent === text)

describe('WagerRows (#393)', () => {
  it('says what an open bet pays, with its closing day beside the title and no chip', () => {
    renderBet(bet({}))
    expect(line('10 DC on Yes · pays 18 DC')).toBeInTheDocument()
    expect(screen.getByText('18 DC')).toHaveClass('text-win')
    expect(screen.getByText('Closes').parentElement).toHaveTextContent('Closes Oct 18')
    expect(screen.queryByText('Open')).toBeNull()
  })

  it('says a bet waiting on its result is waiting, in the line', () => {
    renderBet(bet({ result: { kind: 'awaiting' } }))
    expect(line('10 DC on Yes · pays 18 DC · waiting for a result')).toBeInTheDocument()
    expect(screen.getByText('Closed')).toBeInTheDocument()
  })

  it('says what a settled bet did', () => {
    renderBet(bet({ result: { kind: 'won', payout: 18 } }))
    expect(line('10 DC on Yes · won 18 DC')).toBeInTheDocument()
  })

  it('says a lost bet lost', () => {
    renderBet(bet({ result: { kind: 'lost' } }))
    expect(screen.getByText('lost')).toHaveClass('text-loss')
  })

  it('leaves the payout out for a pool bet, whose payout was never fixed', () => {
    renderBet(bet({ pays: null }))
    expect(line('10 DC on Yes')).toBeInTheDocument()
  })

  it('titles the card with a stretched link to the market', () => {
    renderBet(bet({}))
    const link = screen.getByRole('link', { name: 'Will it rain on the picnic?' })
    expect(link).toHaveAttribute('href', '/markets/k1')
    expect(link).toHaveClass('stretched-link')
  })
})
