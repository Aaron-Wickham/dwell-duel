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
  home(): LiveSubscription[] {
    return [{ table: 'markets' }, { table: 'tasks' }]
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
  feed(): LiveSubscription[] {
    return [{ table: 'bets' }, { table: 'parlays' }, { table: 'task_completions' }, { table: 'market_resolutions' }]
  },
  tasks(userId: string): LiveSubscription[] {
    return [{ table: 'tasks' }, { table: 'task_completions', filter: `profile_id=eq.${userId}` }]
  },
  parlays(userId: string): LiveSubscription[] {
    return [{ table: 'parlays', filter: `profile_id=eq.${userId}` }, { table: 'parlay_legs' }]
  },
  adminTasks(): LiveSubscription[] {
    return [{ table: 'task_completions' }]
  },
}
