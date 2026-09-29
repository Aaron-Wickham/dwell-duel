import type { LiveSubscription } from '@/components/live/live-refresh'

export const pageSubscriptions = {
  marketDetail(marketId: string): LiveSubscription[] {
    return [
      { table: 'bets', filter: `market_id=eq.${marketId}` },
      // A cancel deletes from bets, and a filtered channel never receives deletes; the
      // cancelled_bets insert it makes in the same transaction is what reaches this page.
      { table: 'cancelled_bets', filter: `market_id=eq.${marketId}` },
      { table: 'markets', filter: `id=eq.${marketId}` },
      { table: 'market_resolutions', filter: `market_id=eq.${marketId}` },
      // The creator's parlay legs show in the creator-stake line (#84).
      { table: 'parlay_legs', filter: `market_id=eq.${marketId}` },
    ]
  },
  // Every card's odds move with every bet, so this page does follow them all; LiveRefresh's
  // debounce keeps a busy spell to one refresh every couple of seconds.
  markets(): LiveSubscription[] {
    return [{ table: 'markets' }, { table: 'bets' }, { table: 'cancelled_bets' }]
  },
  // The HomeHero's pending-review count and the admin tile's pending-approvals count both only
  // change via task_completions -- a rejection moves no balance, so bets/profiles don't cover it.
  // An admin needs every submission; a member only needs their own.
  // profiles isn't watched here: every bet moves some balance, so watching all of them refreshed
  // every open Home on every bet (#68). The layout's base channel already follows this member's
  // own profile; the rank catches up on the next visit.
  // The hero's At stake moves when the member bets, cancels or places a parlay, and when a market
  // or parlay settles (markets, and parlays' own status).
  home({ me, admin }: { me: string; admin: boolean }): LiveSubscription[] {
    return [
      { table: 'markets' },
      { table: 'tasks' },
      { table: 'bets', filter: `profile_id=eq.${me}` },
      { table: 'cancelled_bets', filter: `profile_id=eq.${me}` },
      { table: 'parlays', filter: `profile_id=eq.${me}` },
      admin ? { table: 'task_completions' } : { table: 'task_completions', filter: `profile_id=eq.${me}` },
    ]
  },
  leaderboard(): LiveSubscription[] {
    return [{ table: 'profiles' }]
  },
  // Only this member's profile (#68): their balance and name stay live, and their rank, which
  // other members' bets can move, catches up on the next visit. activity_events carries every kind
  // this page shows, task approvals and resolutions included.
  member(memberId: string): LiveSubscription[] {
    return [
      { table: 'activity_events', filter: `actor_id=eq.${memberId}` },
      // A cancelled bet's event is deleted by cascade, which the filtered channel above can't see.
      { table: 'cancelled_bets', filter: `profile_id=eq.${memberId}` },
      { table: 'profiles', filter: `id=eq.${memberId}` },
    ]
  },
  // Every feed kind is a row in activity_events now, so it's the only table to watch.
  feed(): LiveSubscription[] {
    return [{ table: 'activity_events' }]
  },
  tasks(userId: string): LiveSubscription[] {
    return [{ table: 'tasks' }, { table: 'task_completions', filter: `profile_id=eq.${userId}` }]
  },
  // markets, unfiltered, carries every status change and resolution that moves a bet between
  // tabs or changes its result. It also carries parlay leg badges: settle_parlay writes nothing to
  // parlays/parlay_legs when a leg wins while others in the same parlay are still open.
  myBets(userId: string): LiveSubscription[] {
    return [
      { table: 'bets', filter: `profile_id=eq.${userId}` },
      { table: 'cancelled_bets', filter: `profile_id=eq.${userId}` },
      { table: 'parlays', filter: `profile_id=eq.${userId}` },
      { table: 'parlay_legs' },
      { table: 'markets' },
    ]
  },
  // coin_transactions isn't published for realtime, but every row in it moves the member's own
  // balance in the same transaction, so their profile row changes whenever their history does.
  myCoins(userId: string): LiveSubscription[] {
    return [{ table: 'profiles', filter: `id=eq.${userId}` }]
  },
  adminTasks(): LiveSubscription[] {
    return [{ table: 'task_completions' }]
  },
}
