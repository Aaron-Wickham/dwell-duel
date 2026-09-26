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
  // An admin needs every submission; a member only needs their own.
  home({ me, admin }: { me: string; admin: boolean }): LiveSubscription[] {
    return [
      { table: 'markets' },
      { table: 'tasks' },
      admin ? { table: 'task_completions' } : { table: 'task_completions', filter: `profile_id=eq.${me}` },
    ]
  },
  leaderboard(): LiveSubscription[] {
    return [{ table: 'profiles' }]
  },
  member(memberId: string): LiveSubscription[] {
    return [
      { table: 'profiles', filter: `id=eq.${memberId}` },
      { table: 'bets', filter: `profile_id=eq.${memberId}` },
      { table: 'parlays', filter: `profile_id=eq.${memberId}` },
    ]
  },
  // market_created feed rows come from markets, not bets.
  feed(): LiveSubscription[] {
    return [
      { table: 'bets' },
      { table: 'parlays' },
      { table: 'task_completions' },
      { table: 'market_resolutions' },
      { table: 'markets' },
    ]
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
