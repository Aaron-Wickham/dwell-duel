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
      // A deleted comment is a soft delete, an UPDATE (0053), so this filtered channel hears it.
      { table: 'market_comments', filter: `market_id=eq.${marketId}` },
    ]
  },
  // Every card's odds move with every bet, and every bet (or cancellation) moves its outcome's
  // pool_total, so the list follows market_outcomes rather than every bets and cancelled_bets row
  // (#204): one update per bet, from a table that changes for no other reason. LiveRefresh's
  // debounce keeps a busy spell to one refresh every couple of seconds.
  markets(): LiveSubscription[] {
    return [{ table: 'markets' }, { table: 'market_outcomes' }]
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
  // Not profiles (#205): apply_coin_transaction updates a balance on every bet, win, task and parlay,
  // so watching every profile refreshed every open leaderboard on every coin movement, as Home once
  // did (#68). A bet moves nobody's net worth (balance down, riding up), and a settled market is
  // what really reorders both boards, so only markets is followed; the rest catches up on the next
  // visit, or when the tab returns to the foreground.
  leaderboard(): LiveSubscription[] {
    return [{ table: 'markets' }]
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
      // Unfiltered: a reaction row names its event, not the event's actor, and a filtered channel
      // would never hear a reaction being taken back (a DELETE).
      { table: 'feed_reactions' },
    ]
  },
  // Every feed kind is a row in activity_events now. Reactions are watched unfiltered, so a
  // reaction taken back (a DELETE) still arrives.
  feed(): LiveSubscription[] {
    return [{ table: 'activity_events' }, { table: 'feed_reactions' }]
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
  // A parlay's page: its own row (status, credit), its legs, and every market, since a leg's
  // result comes from the market resolving.
  parlay(parlayId: string): LiveSubscription[] {
    return [
      { table: 'parlays', filter: `id=eq.${parlayId}` },
      { table: 'parlay_legs', filter: `parlay_id=eq.${parlayId}` },
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
