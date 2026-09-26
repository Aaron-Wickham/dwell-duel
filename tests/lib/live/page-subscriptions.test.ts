import { describe, it, expect } from 'vitest'
import { LIVE_TABLES, type LiveSubscription } from '@/components/live/live-refresh'
import { pageSubscriptions } from '@/lib/live/page-subscriptions'

const FILTER_RE = /^[a-z_]+=eq\..+$/

const MARKET_ID = '11111111-1111-4111-8111-111111111111'
const MEMBER_ID = '22222222-2222-4222-8222-222222222222'

const declarations: Record<string, () => LiveSubscription[]> = {
  marketDetail: () => pageSubscriptions.marketDetail(MARKET_ID),
  markets: () => pageSubscriptions.markets(),
  home: () => pageSubscriptions.home(),
  leaderboard: () => pageSubscriptions.leaderboard(),
  member: () => pageSubscriptions.member(MEMBER_ID),
  feed: () => pageSubscriptions.feed(),
  tasks: () => pageSubscriptions.tasks(MEMBER_ID),
  parlays: () => pageSubscriptions.parlays(MEMBER_ID),
  adminTasks: () => pageSubscriptions.adminTasks(),
}

describe('pageSubscriptions', () => {
  for (const [name, declare] of Object.entries(declarations)) {
    it(`${name} only declares published tables, with a valid eq filter when one is given`, () => {
      const subscriptions = declare()
      expect(subscriptions.length).toBeGreaterThan(0)
      for (const subscription of subscriptions) {
        expect(LIVE_TABLES).toContain(subscription.table)
        if (subscription.filter !== undefined) expect(subscription.filter).toMatch(FILTER_RE)
      }
    })
  }

  it('carries the market id, and only the market id, through marketDetail', () => {
    const subscriptions = pageSubscriptions.marketDetail(MARKET_ID)
    expect(subscriptions).toEqual([
      { table: 'bets', filter: `market_id=eq.${MARKET_ID}` },
      { table: 'markets', filter: `id=eq.${MARKET_ID}` },
      { table: 'market_resolutions', filter: `market_id=eq.${MARKET_ID}` },
    ])
  })

  it('carries the member id through member', () => {
    const subscriptions = pageSubscriptions.member(MEMBER_ID)
    expect(subscriptions).toEqual([
      { table: 'profiles', filter: `id=eq.${MEMBER_ID}` },
      { table: 'bets', filter: `profile_id=eq.${MEMBER_ID}` },
      { table: 'parlays', filter: `profile_id=eq.${MEMBER_ID}` },
    ])
  })
})
