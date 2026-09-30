// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { YourStandingCard } from '@/components/leaderboard/your-standing'
import type { YourStanding } from '@/lib/social/leaderboard'

const standing = (over: Partial<YourStanding> = {}): YourStanding => ({
  rank: 3,
  memberCount: 12,
  score: 900,
  tiedWith: 0,
  above: { name: 'Sarah', gap: 48 },
  ...over,
})

function card() {
  return screen.getByRole('region', { name: 'Your standing' })
}

describe('YourStandingCard', () => {
  it('shows rank, net worth, record and the gap to the member above', () => {
    render(<YourStandingCard standing={standing()} record={{ won: 6, lost: 3 }} />)
    expect(within(card()).getByText('3rd')).toBeInTheDocument()
    expect(within(card()).getByText('of 12')).toBeInTheDocument()
    expect(within(card()).getByText('900 DC')).toBeInTheDocument()
    expect(within(card()).getByText('6-3')).toBeInTheDocument()
    expect(within(card()).getByText('48 DC behind Sarah.')).toBeInTheDocument()
  })

  it('says you are top when first and alone', () => {
    render(<YourStandingCard standing={standing({ rank: 1, above: null })} record={{ won: 1, lost: 0 }} />)
    expect(within(card()).getByText('You’re top of the board.')).toBeInTheDocument()
  })

  it('words a tie for the top and a tie further down', () => {
    const { rerender } = render(<YourStandingCard standing={standing({ rank: 1, above: null, tiedWith: 1 })} record={{ won: 1, lost: 0 }} />)
    expect(within(card()).getByText('Tied for the top.')).toBeInTheDocument()
    rerender(<YourStandingCard standing={standing({ rank: 2, tiedWith: 2 })} record={{ won: 1, lost: 0 }} />)
    expect(within(card()).getByText('Tied 2nd. 48 DC behind Sarah.')).toBeInTheDocument()
  })

  it('uses the right ordinal suffix, including the teens', () => {
    const { rerender } = render(<YourStandingCard standing={standing({ rank: 11 })} />)
    expect(within(card()).getByText('11th')).toBeInTheDocument()
    rerender(<YourStandingCard standing={standing({ rank: 22 })} />)
    expect(within(card()).getByText('22nd')).toBeInTheDocument()
  })

  it('shows a dash and a note when no bet has settled', () => {
    render(<YourStandingCard standing={standing()} />)
    expect(within(card()).getByText('–')).toBeInTheDocument()
    expect(within(card()).getByText(/No settled bets yet\./)).toBeInTheDocument()
  })

  it('gives a member with no rank a short state', () => {
    render(<YourStandingCard standing={null} />)
    expect(within(card()).getByText(/not ranked yet/)).toBeInTheDocument()
  })
})
