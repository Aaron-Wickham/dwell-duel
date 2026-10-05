// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ParlayOddsNote } from '@/components/parlays/parlay-odds-note'

const base = { fixed: true, converted: false, lockedAtPlacement: false, capped: false, maxMultiplier: 20, stake: 10 }

describe('ParlayOddsNote', () => {
  it('says a fixed parlay’s stake was split and its odds fixed at placement, with no cap', () => {
    render(<ParlayOddsNote parlay={base} dropped={0} />)
    expect(screen.getByText(/The stake was split evenly across the picks/)).toBeInTheDocument()
    expect(screen.queryByText(/cap/)).toBeNull()
  })

  it('says a converted parlay’s odds came from the pools, fixed at the October 2026 switch, under the old caps (0105)', () => {
    render(<ParlayOddsNote parlay={{ ...base, converted: true, capped: true }} dropped={1} />)
    const note = screen.getByText(/came from the other members’ money/)
    expect(note).toHaveTextContent('fixed by the time DwellDuel switched to fixed payouts in October 2026')
    expect(note).toHaveTextContent('up to a 20× cap, and a win pays at most 1,000 DC: the old caps still apply.')
    expect(note).toHaveTextContent('1 called-off pick was left out')
    expect(note).not.toHaveTextContent('stake was split')
  })

  it('keeps a pool parlay’s wording', () => {
    render(<ParlayOddsNote parlay={{ ...base, fixed: false, capped: true }} dropped={0} />)
    expect(screen.getByText(/set when its market closes/)).toHaveTextContent('up to a 20× cap. A win pays at most 1,000 DC.')
  })
})
