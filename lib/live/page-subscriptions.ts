import type { LiveSubscription } from '@/components/live/live-refresh'

export const pageSubscriptions = {
  marketDetail(marketId: string): LiveSubscription[] {
    return [
      { table: 'bets', filter: `market_id=eq.${marketId}` },
      { table: 'markets', filter: `id=eq.${marketId}` },
      { table: 'market_resolutions', filter: `market_id=eq.${marketId}` },
    ]
  },
  markets(): LiveSubscription[] {
    return [{ table: 'markets' }, { table: 'bets' }]
  },
  // The HomeHero's pending-review count and the admin tile's pending-approvals count both only
  // change via task_completions -- a rejection moves no balance, so bets/profiles don't cover it.
  // An admin needs every submission; a member only needs their own. profiles is unfiltered so the
  // rank and member count (getMemberStanding) refresh when any member's balance changes, not just
  // this member's own.
  home({ me, admin }: { me: string; admin: boolean }): LiveSubscription[] {
    return [
      { table: 'markets' },
      { table: 'tasks' },
      { table: 'profiles' },
      admin ? { table: 'task_completions' } : { table: 'task_completions', filter: `profile_id=eq.${me}` },
    ]
  },
  leaderboard(): LiveSubscription[] {
    return [{ table: 'profiles' }]
  },
  // profiles is unfiltered, not id=eq.<memberId>: this page also shows the member's live rank
  // (getMemberStanding), which moves whenever any other member's balance does. activity_events
  // carries every kind this page shows, task approvals and resolutions included.
  member(memberId: string): LiveSubscription[] {
    return [
      { table: 'activity_events', filter: `actor_id=eq.${memberId}` },
      { table: 'profiles' },
    ]
  },
  // Every feed kind is a row in activity_events now, so it's the only table to watch.
  feed(): LiveSubscription[] {
    return [{ table: 'activity_events' }]
  },
  tasks(userId: string): LiveSubscription[] {
    return [{ table: 'tasks' }, { table: 'task_completions', filter: `profile_id=eq.${userId}` }]
  },
  // Leg badges come from market status and resolution: settle_parlay writes nothing to
  // parlays/parlay_legs when a leg wins while others in the same parlay are still open.
  parlays(userId: string): LiveSubscription[] {
    return [{ table: 'parlays', filter: `profile_id=eq.${userId}` }, { table: 'parlay_legs' }, { table: 'markets' }]
  },
  adminTasks(): LiveSubscription[] {
    return [{ table: 'task_completions' }]
  },
}
