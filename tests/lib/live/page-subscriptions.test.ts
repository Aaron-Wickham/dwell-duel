import { describe, it, expect } from 'vitest'
import { LIVE_TABLES, type LiveSubscription } from '@/components/live/live-refresh'
import { pageSubscriptions } from '@/lib/live/page-subscriptions'

const FILTER_RE = /^[a-z_]+=eq\..+$/

const MARKET_ID = '11111111-1111-4111-8111-111111111111'
const MEMBER_ID = '22222222-2222-4222-8222-222222222222'

const declarations: Record<string, () => LiveSubscription[]> = {
  marketDetail: () => pageSubscriptions.marketDetail(MARKET_ID),
  markets: () => pageSubscriptions.markets(),
  'home (member)': () => pageSubscriptions.home({ me: MEMBER_ID, admin: false }),
  'home (admin)': () => pageSubscriptions.home({ me: MEMBER_ID, admin: true }),
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

  // Presence in LIVE_TABLES alone doesn't prove a page gets every update it needs today, so each
  // declaration is pinned exactly against the agreed table.
  it('marketDetail carries the market id, and only the market id', () => {
    expect(pageSubscriptions.marketDetail(MARKET_ID)).toEqual([
      { table: 'bets', filter: `market_id=eq.${MARKET_ID}` },
      { table: 'markets', filter: `id=eq.${MARKET_ID}` },
      { table: 'market_resolutions', filter: `market_id=eq.${MARKET_ID}` },
    ])
  })

  it('markets declares the open/closed list tables', () => {
    expect(pageSubscriptions.markets()).toEqual([{ table: 'markets' }, { table: 'bets' }])
  })

  it('home, for a member, filters task_completions to their own submissions and watches every profile for live ranks', () => {
    expect(pageSubscriptions.home({ me: MEMBER_ID, admin: false })).toEqual([
      { table: 'markets' },
      { table: 'tasks' },
      { table: 'profiles' },
      { table: 'task_completions', filter: `profile_id=eq.${MEMBER_ID}` },
    ])
  })

  it('home, for an admin, watches every submission and every profile so ranks and pending-approvals stay live', () => {
    expect(pageSubscriptions.home({ me: MEMBER_ID, admin: true })).toEqual([
      { table: 'markets' },
      { table: 'tasks' },
      { table: 'profiles' },
      { table: 'task_completions' },
    ])
  })

  it('leaderboard watches every profile', () => {
    expect(pageSubscriptions.leaderboard()).toEqual([{ table: 'profiles' }])
  })

  it('member watches every profile for live ranks, and carries the member id through bets and parlays', () => {
    expect(pageSubscriptions.member(MEMBER_ID)).toEqual([
      { table: 'profiles' },
      { table: 'bets', filter: `profile_id=eq.${MEMBER_ID}` },
      { table: 'parlays', filter: `profile_id=eq.${MEMBER_ID}` },
    ])
  })

  it('feed watches every table its event kinds come from, including markets for market_created', () => {
    expect(pageSubscriptions.feed()).toEqual([
      { table: 'bets' },
      { table: 'parlays' },
      { table: 'task_completions' },
      { table: 'market_resolutions' },
      { table: 'markets' },
    ])
  })

  it('tasks filters task_completions to the signed-in member', () => {
    expect(pageSubscriptions.tasks(MEMBER_ID)).toEqual([
      { table: 'tasks' },
      { table: 'task_completions', filter: `profile_id=eq.${MEMBER_ID}` },
    ])
  })

  it('parlays carries the member id and watches markets for leg status changes', () => {
    expect(pageSubscriptions.parlays(MEMBER_ID)).toEqual([
      { table: 'parlays', filter: `profile_id=eq.${MEMBER_ID}` },
      { table: 'parlay_legs' },
      { table: 'markets' },
    ])
  })

  it('adminTasks watches every submission', () => {
    expect(pageSubscriptions.adminTasks()).toEqual([{ table: 'task_completions' }])
  })
})
