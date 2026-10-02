// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
vi.mock('@/lib/markets/cancel-bet', () => ({ cancelBetAction: vi.fn() }))

import { BetList } from '@/components/markets/bet-list'
import type { MarketBet } from '@/lib/markets/get-market'

const outcomes = [
  { id: 'o-yes', label: 'Yes' },
  { id: 'o-no', label: 'No' },
]

const bets: MarketBet[] = [
  { id: 2, outcomeId: 'o-no', amount: 15, createdAt: '2026-09-25T10:00:00Z', profileId: 'p-bob', bettorName: 'Bob', bettorAvatarSrc: null },
  { id: 1, outcomeId: 'o-yes', amount: 5, createdAt: '2026-09-25T09:00:00Z', profileId: 'p-alice', bettorName: 'Alice', bettorAvatarSrc: null },
]

describe('BetList', () => {
  it("reads each bet as one sentence and marks the viewer's own", () => {
    render(<BetList bets={bets} outcomes={outcomes} viewerId="p-alice" canBet />)
    const sentences = screen.getAllByRole('listitem').map((li) => li.querySelector('p')?.textContent)
    expect(sentences).toEqual(['Bob — 15 DC on No', 'Alice — 5 DC on Yes (you)'])
  })

  it("links each bettor's name to their profile", () => {
    render(<BetList bets={bets} outcomes={outcomes} viewerId="p-alice" canBet />)
    expect(screen.getByRole('link', { name: 'Alice' })).toHaveAttribute('href', '/members/p-alice')
    expect(screen.getByRole('link', { name: 'Bob' })).toHaveAttribute('href', '/members/p-bob')
  })

  it('invites the first bet while betting is open', () => {
    render(<BetList bets={[]} outcomes={outcomes} viewerId="p-alice" canBet />)
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
    expect(screen.getByText('No bets yet.')).toBeInTheDocument()
    expect(screen.getByText('Be the first to back an outcome.')).toBeInTheDocument()
  })

  it('drops the invitation once betting has closed', () => {
    render(<BetList bets={[]} outcomes={outcomes} viewerId="p-alice" canBet={false} />)
    expect(screen.getByText('No bets yet.')).toBeInTheDocument()
    expect(screen.queryByText('Be the first to back an outcome.')).not.toBeInTheDocument()
  })

  it('gives each bet a focus target named from its sentence, when the list has a row id prefix', () => {
    render(<BetList bets={bets} outcomes={outcomes} viewerId="p-alice" canBet rowIdPrefix="bet" />)
    const row = screen.getByRole('listitem', { name: 'Bob — 15 DC on No' })
    expect(row).toHaveAttribute('id', 'bet-2')
    expect(row).toHaveAttribute('tabindex', '-1')
    // The whole name, so the Cancel button's label is proven to stay out of it.
    expect(screen.getByRole('listitem', { name: /^Alice — 5 DC on Yes ?\(you\)$/ })).toHaveAttribute('id', 'bet-1')
  })

  it("offers Cancel on the viewer's own bets only, and only while betting is open", () => {
    const { rerender } = render(<BetList bets={bets} outcomes={outcomes} viewerId="p-alice" canBet />)
    expect(screen.getAllByRole('button', { name: /^Cancel your/ }).map((b) => b.textContent)).toEqual(['Cancel'])
    expect(screen.getByRole('button', { name: 'Cancel your 5 DC bet on Yes' })).toBeInTheDocument()

    rerender(<BetList bets={bets} outcomes={outcomes} viewerId="p-alice" canBet={false} />)
    expect(screen.queryByRole('button', { name: /^Cancel your/ })).not.toBeInTheDocument()
  })

  it('offers no Cancel or Remove on a market whose bets are final (0102)', () => {
    render(<BetList bets={bets} outcomes={outcomes} viewerId="p-alice" canBet canRemove final />)
    expect(screen.queryByRole('button', { name: /^Cancel your/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Remove/ })).not.toBeInTheDocument()
  })
})
