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
  myBets: () => pageSubscriptions.myBets(MEMBER_ID),
  myCoins: () => pageSubscriptions.myCoins(MEMBER_ID),
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
      { table: 'cancelled_bets', filter: `market_id=eq.${MARKET_ID}` },
      { table: 'markets', filter: `id=eq.${MARKET_ID}` },
      { table: 'market_resolutions', filter: `market_id=eq.${MARKET_ID}` },
      { table: 'parlay_legs', filter: `market_id=eq.${MARKET_ID}` },
      { table: 'market_comments', filter: `market_id=eq.${MARKET_ID}` },
    ])
  })

  it('markets declares the open/closed list tables', () => {
    expect(pageSubscriptions.markets()).toEqual([{ table: 'markets' }, { table: 'bets' }, { table: 'cancelled_bets' }])
  })

  it('home, for a member, filters task_completions to their own submissions', () => {
    expect(pageSubscriptions.home({ me: MEMBER_ID, admin: false })).toEqual([
      { table: 'markets' },
      { table: 'tasks' },
      { table: 'bets', filter: `profile_id=eq.${MEMBER_ID}` },
      { table: 'cancelled_bets', filter: `profile_id=eq.${MEMBER_ID}` },
      { table: 'parlays', filter: `profile_id=eq.${MEMBER_ID}` },
      { table: 'task_completions', filter: `profile_id=eq.${MEMBER_ID}` },
    ])
  })

  it('home, for an admin, watches every submission so pending-approvals stay live', () => {
    expect(pageSubscriptions.home({ me: MEMBER_ID, admin: true })).toEqual([
      { table: 'markets' },
      { table: 'tasks' },
      { table: 'bets', filter: `profile_id=eq.${MEMBER_ID}` },
      { table: 'cancelled_bets', filter: `profile_id=eq.${MEMBER_ID}` },
      { table: 'parlays', filter: `profile_id=eq.${MEMBER_ID}` },
      { table: 'task_completions' },
    ])
  })

  it('leaderboard watches every profile', () => {
    expect(pageSubscriptions.leaderboard()).toEqual([{ table: 'profiles' }])
  })

  it('member watches only that member, carrying their id through activity_events', () => {
    expect(pageSubscriptions.member(MEMBER_ID)).toEqual([
      { table: 'activity_events', filter: `actor_id=eq.${MEMBER_ID}` },
      { table: 'cancelled_bets', filter: `profile_id=eq.${MEMBER_ID}` },
      { table: 'profiles', filter: `id=eq.${MEMBER_ID}` },
      { table: 'feed_reactions' },
    ])
  })

  // place_bet writes bets, the bettor's profile balance, their coin transaction and an
  // activity_events row, and nothing on markets (#68).
  it("doesn't refresh a member's Home or member page when someone else bets", () => {
    const betWrites = new Set(['bets', 'profiles', 'activity_events', 'parlays', 'parlay_legs'])
    const OTHER = '99999999-9999-4999-8999-999999999999'
    for (const subs of [
      pageSubscriptions.home({ me: MEMBER_ID, admin: false }),
      pageSubscriptions.home({ me: MEMBER_ID, admin: true }),
      pageSubscriptions.member(MEMBER_ID),
    ]) {
      const hears = subs.filter((s) => betWrites.has(s.table) && (!s.filter || s.filter.endsWith(OTHER)))
      expect(hears).toEqual([])
    }
  })

  it("myBets watches the member's own bets, cancellations and parlays, and every market for results", () => {
    expect(pageSubscriptions.myBets(MEMBER_ID)).toEqual([
      { table: 'bets', filter: `profile_id=eq.${MEMBER_ID}` },
      { table: 'cancelled_bets', filter: `profile_id=eq.${MEMBER_ID}` },
      { table: 'parlays', filter: `profile_id=eq.${MEMBER_ID}` },
      { table: 'parlay_legs' },
      { table: 'markets' },
    ])
  })

  it('feed watches activity_events, where every event kind is a row, and every reaction', () => {
    expect(pageSubscriptions.feed()).toEqual([{ table: 'activity_events' }, { table: 'feed_reactions' }])
  })

  // A filtered channel never receives a DELETE, and taking a reaction back is one.
  it('watches feed_reactions unfiltered wherever reactions show', () => {
    for (const subs of [pageSubscriptions.feed(), pageSubscriptions.member(MEMBER_ID)]) {
      expect(subs).toContainEqual({ table: 'feed_reactions' })
    }
  })

  it('tasks filters task_completions to the signed-in member', () => {
    expect(pageSubscriptions.tasks(MEMBER_ID)).toEqual([
      { table: 'tasks' },
      { table: 'task_completions', filter: `profile_id=eq.${MEMBER_ID}` },
    ])
  })

  it("myCoins watches only the member's own profile, whose balance moves with every coin row", () => {
    expect(pageSubscriptions.myCoins(MEMBER_ID)).toEqual([{ table: 'profiles', filter: `id=eq.${MEMBER_ID}` }])
  })

  it('adminTasks watches every submission', () => {
    expect(pageSubscriptions.adminTasks()).toEqual([{ table: 'task_completions' }])
  })
})
