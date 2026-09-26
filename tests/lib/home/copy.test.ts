import { describe, it, expect } from 'vitest'
import {
  heroCaption,
  marketsTileSubtitle,
  parlaysTileSubtitle,
  leaderboardTileSubtitle,
  adminTileSubtitle,
} from '@/lib/home/copy'

describe('heroCaption', () => {
  it('drops the pending clause when nothing is pending', () => {
    expect(heroCaption(3, 8, 0, 0)).toBe('Rank 3 of 8')
  })

  it('uses the singular for one pending review', () => {
    expect(heroCaption(3, 8, 1, 25)).toBe('Rank 3 of 8 · 25 DC pending in 1 task review')
  })

  it('uses the plural for more than one', () => {
    expect(heroCaption(3, 8, 2, 40)).toBe('Rank 3 of 8 · 40 DC pending in 2 task reviews')
  })
})

describe('marketsTileSubtitle', () => {
  it('handles zero, one and many', () => {
    expect(marketsTileSubtitle(0)).toBe('No open markets')
    expect(marketsTileSubtitle(1)).toBe('1 open market')
    expect(marketsTileSubtitle(3)).toBe('3 open markets')
  })
})

describe('parlaysTileSubtitle', () => {
  it('handles zero, one and many', () => {
    expect(parlaysTileSubtitle(0)).toBe('Your slip is empty.')
    expect(parlaysTileSubtitle(1)).toBe('1 pick in your slip')
    expect(parlaysTileSubtitle(2)).toBe('2 picks in your slip')
  })
})

describe('leaderboardTileSubtitle', () => {
  it('always states the rank', () => {
    expect(leaderboardTileSubtitle(3, 8)).toBe('You’re ranked 3 of 8')
  })
})

describe('adminTileSubtitle', () => {
  it('handles zero, one and many', () => {
    expect(adminTileSubtitle(0)).toBe('Nothing waiting')
    expect(adminTileSubtitle(1)).toBe('1 approval waiting')
    expect(adminTileSubtitle(3)).toBe('3 approvals waiting')
  })
})
