import { describe, it, expect } from 'vitest'
import { LIVE_TABLES, LIVE_TOPICS, type LiveSubscription } from '@/components/live/live-refresh'
import { pageSubscriptions } from '@/lib/live/page-subscriptions'

const FILTER_RE = /^[a-z_]+=eq\..+$/

const MARKET_ID = '11111111-1111-4111-8111-111111111111'
const MEMBER_ID = '22222222-2222-4222-8222-222222222222'
const CATEGORY_ID = '33333333-3333-4333-8333-333333333333'

const declarations: Record<string, () => LiveSubscription[]> = {
  marketDetail: () => pageSubscriptions.marketDetail(MARKET_ID, MEMBER_ID, CATEGORY_ID),
  markets: () => pageSubscriptions.markets(),
  'home (member)': () => pageSubscriptions.home({ me: MEMBER_ID, reviewer: false }),
  'home (reviewer)': () => pageSubscriptions.home({ me: MEMBER_ID, reviewer: true }),
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
    // An unfiltered table would send every open page a message per row anyone writes (#250):
    // anything group-wide is a topic, which the database pings at most once per transaction.
    it(`${name} declares published tables, always with an eq filter, or known topics`, () => {
      const subscriptions = declare()
      expect(subscriptions.length).toBeGreaterThan(0)
      for (const subscription of subscriptions) {
        if ('topic' in subscription) {
          expect(LIVE_TOPICS).toContain(subscription.topic)
        } else {
          expect(LIVE_TABLES).toContain(subscription.table)
          expect(subscription.filter).toMatch(FILTER_RE)
        }
      }
    })
  }

  // Presence in LIVE_TABLES alone doesn't prove a page gets every update it needs today, so each
  // declaration is pinned exactly against the agreed table.
  // The viewer's id narrows only their own parlays (#262), so no channel follows every parlay.
  it('marketDetail carries the market id, the viewer id for their own parlays, and its category row', () => {
    const marketRows = [
      { table: 'bets', filter: `market_id=eq.${MARKET_ID}` },
      { table: 'markets', filter: `id=eq.${MARKET_ID}` },
      { table: 'market_resolutions', filter: `market_id=eq.${MARKET_ID}` },
      { table: 'parlay_legs', filter: `market_id=eq.${MARKET_ID}` },
      { table: 'parlays', filter: `profile_id=eq.${MEMBER_ID}` },
      { table: 'market_comments', filter: `market_id=eq.${MARKET_ID}` },
    ]
    expect(pageSubscriptions.marketDetail(MARKET_ID, MEMBER_ID, CATEGORY_ID)).toEqual([
      ...marketRows,
      { table: 'market_categories', filter: `id=eq.${CATEGORY_ID}` },
    ])
    expect(pageSubscriptions.marketDetail(MARKET_ID, MEMBER_ID, null)).toEqual(marketRows)
  })

  // A bet writes bets and market_outcomes.pool_total; the list hears the pools topic, never a bet row.
  it('markets follows the markets and pools topics, not bets', () => {
    expect(pageSubscriptions.markets()).toEqual([{ topic: 'markets' }, { topic: 'pools' }])
  })

  it('home, for a member, filters task_completions to their own submissions', () => {
    expect(pageSubscriptions.home({ me: MEMBER_ID, reviewer: false })).toEqual([
      { topic: 'markets' },
      { topic: 'tasks' },
      { table: 'bets', filter: `profile_id=eq.${MEMBER_ID}` },
      { table: 'parlays', filter: `profile_id=eq.${MEMBER_ID}` },
      { table: 'task_completions', filter: `profile_id=eq.${MEMBER_ID}` },
    ])
  })

  it('home, for a reviewer or above, follows the review queue so pending-approvals stay live', () => {
    expect(pageSubscriptions.home({ me: MEMBER_ID, reviewer: true })).toEqual([
      { topic: 'markets' },
      { topic: 'tasks' },
      { table: 'bets', filter: `profile_id=eq.${MEMBER_ID}` },
      { table: 'parlays', filter: `profile_id=eq.${MEMBER_ID}` },
      { topic: 'reviews' },
    ])
  })

  // Every bet, win, task and parlay updates a profile's balance, so a profiles channel would refresh
  // every leaderboard viewer on every coin movement (#205); resolutions, which reorder the board,
  // arrive through markets.
  it('leaderboard follows settled markets, never every profile', () => {
    expect(pageSubscriptions.leaderboard()).toEqual([{ topic: 'markets' }])
  })

  it('member watches only that member, carrying their id through activity_events', () => {
    expect(pageSubscriptions.member(MEMBER_ID)).toEqual([
      { table: 'activity_events', filter: `actor_id=eq.${MEMBER_ID}` },
      { table: 'profiles', filter: `id=eq.${MEMBER_ID}` },
      { topic: 'reactions' },
    ])
  })

  // place_bet writes bets, the bettor's profile balance, their coin transaction, an outcome's pool
  // and an activity_events row, and nothing on markets (#68).
  it("doesn't refresh a member's Home or member page when someone else bets", () => {
    const betWrites = new Set(['bets', 'profiles', 'activity_events', 'parlays', 'parlay_legs'])
    const betTopics = new Set(['pools', 'activity'])
    for (const subs of [
      pageSubscriptions.home({ me: MEMBER_ID, reviewer: false }),
      pageSubscriptions.home({ me: MEMBER_ID, reviewer: true }),
      pageSubscriptions.member(MEMBER_ID),
    ]) {
      const hears = subs.filter((s) =>
        'topic' in s ? betTopics.has(s.topic) : betWrites.has(s.table) && !s.filter.endsWith(MEMBER_ID),
      )
      expect(hears).toEqual([])
    }
  })

  it("myBets watches the member's own bets, cancellations and parlays, and every market for results", () => {
    expect(pageSubscriptions.myBets(MEMBER_ID)).toEqual([
      { table: 'bets', filter: `profile_id=eq.${MEMBER_ID}` },
      { table: 'parlays', filter: `profile_id=eq.${MEMBER_ID}` },
      { topic: 'markets' },
    ])
  })

  it('feed follows activity, where every event kind is a row, and every reaction', () => {
    expect(pageSubscriptions.feed()).toEqual([{ topic: 'activity' }, { topic: 'reactions' }])
  })

  // A filtered channel never receives a DELETE, and taking a reaction back is one.
  it('follows the reactions topic wherever reactions show', () => {
    for (const subs of [pageSubscriptions.feed(), pageSubscriptions.member(MEMBER_ID)]) {
      expect(subs).toContainEqual({ topic: 'reactions' })
    }
  })

  it('tasks filters task_completions to the signed-in member', () => {
    expect(pageSubscriptions.tasks(MEMBER_ID)).toEqual([
      { topic: 'tasks' },
      { table: 'task_completions', filter: `profile_id=eq.${MEMBER_ID}` },
    ])
  })

  it("myCoins watches only the member's own profile, whose balance moves with every coin row", () => {
    expect(pageSubscriptions.myCoins(MEMBER_ID)).toEqual([{ table: 'profiles', filter: `id=eq.${MEMBER_ID}` }])
  })

  it('adminTasks follows the review queue', () => {
    expect(pageSubscriptions.adminTasks()).toEqual([{ topic: 'reviews' }])
  })
})
