import { describe, it, expect } from 'vitest'
import {
  atStakeDetail,
  pendingDetail,
  marketsTileSubtitle,
  leaderboardTileSubtitle,
  adminTileSubtitle,
} from '@/lib/home/copy'

describe('atStakeDetail', () => {
  it('counts bets, and says so when nothing is riding', () => {
    expect(atStakeDetail(0)).toBe('Nothing riding')
    expect(atStakeDetail(1)).toBe('on 1 bet')
    expect(atStakeDetail(4)).toBe('on 4 bets')
  })
})

describe('pendingDetail', () => {
  it('counts reviews', () => {
    expect(pendingDetail(1)).toBe('in 1 review')
    expect(pendingDetail(2)).toBe('in 2 reviews')
  })
})

describe('marketsTileSubtitle', () => {
  it('handles zero, one and many', () => {
    expect(marketsTileSubtitle(0)).toBe('No open markets')
    expect(marketsTileSubtitle(1)).toBe('1 open market')
    expect(marketsTileSubtitle(3)).toBe('3 open markets')
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
