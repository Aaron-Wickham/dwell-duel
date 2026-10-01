import { describe, it, expect } from 'vitest'
import {
  atStakeDetail,
  pendingDetail,
  marketsTileSubtitle,
  leaderboardTileSubtitle,
  adminTileSubtitle,
  adminTileHref,
  taskRewardsDetail,
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
  it('states the rank', () => {
    expect(leaderboardTileSubtitle(3, 8)).toBe('You’re ranked 3 of 8')
  })

  it('drops the rank when there is none, as for a member with no profile row', () => {
    expect(leaderboardTileSubtitle(0, 0)).toBe('See who’s leading')
  })
})

describe('adminTileSubtitle', () => {
  it('counts approvals: zero, one and many', () => {
    expect(adminTileSubtitle({ tasks: 0, markets: 0 })).toBe('Nothing waiting')
    expect(adminTileSubtitle({ tasks: 1, markets: 0 })).toBe('1 approval waiting')
    expect(adminTileSubtitle({ tasks: 3, markets: 0 })).toBe('3 approvals waiting')
  })

  it('counts markets to resolve too, as the Admin badge does (#266)', () => {
    expect(adminTileSubtitle({ tasks: 0, markets: 1 })).toBe('1 market to resolve')
    expect(adminTileSubtitle({ tasks: 0, markets: 3 })).toBe('3 markets to resolve')
    expect(adminTileSubtitle({ tasks: 2, markets: 3 })).toBe('2 approvals, 3 markets to resolve')
  })
})

describe('adminTileHref', () => {
  it('opens the queue with work in it, approvals first, else the usual start', () => {
    expect(adminTileHref({ tasks: 2, markets: 3 }, '/admin/invites')).toBe('/admin/tasks')
    expect(adminTileHref({ tasks: 0, markets: 3 }, '/admin/invites')).toBe('/admin/markets')
    expect(adminTileHref({ tasks: 0, markets: 0 }, '/admin/invites')).toBe('/admin/invites')
  })
})

describe('taskRewardsDetail', () => {
  it('gives the range of what tasks pay, a single amount, or nothing without tasks', () => {
    expect(taskRewardsDetail({ min: 5, max: 25 })).toBe('they pay 5–25 DC')
    expect(taskRewardsDetail({ min: 10, max: 10 })).toBe('they pay 10 DC each')
    expect(taskRewardsDetail(null)).toBeNull()
  })
})
