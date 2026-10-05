import type { LiveSubscription } from '@/components/live/live-refresh'

export const pageSubscriptions = {
  // The bets and parlay_legs channels also carry the viewer's Your position card
  // (#262) and the outcomes' "riding in parlays" figure (#279); parlays filtered to the viewer
  // carries their own parlays settling on another market. Another member's parlay settling
  // elsewhere writes nothing here, so the figure catches up on the next refresh: following every
  // parlay would refresh every open market page group-wide.
  // Its category's row carries a rename or hide (0108); a merge moves markets.category_id, which
  // the markets row hears.
  marketDetail(marketId: string, viewerId: string, categoryId: string | null): LiveSubscription[] {
    return [
      { table: 'bets', filter: `market_id=eq.${marketId}` },
      { table: 'markets', filter: `id=eq.${marketId}` },
      { table: 'market_resolutions', filter: `market_id=eq.${marketId}` },
      // The creator's parlay legs show in the creator-stake line (#84).
      { table: 'parlay_legs', filter: `market_id=eq.${marketId}` },
      { table: 'parlays', filter: `profile_id=eq.${viewerId}` },
      // A deleted comment is a soft delete, an UPDATE (0053), so this filtered channel hears it.
      { table: 'market_comments', filter: `market_id=eq.${marketId}` },
      ...(categoryId ? [{ table: 'market_categories', filter: `id=eq.${categoryId}` } as const] : []),
    ]
  },
  // Every card's odds move with every bet, and every bet moves its outcome's pool_total and
  // shares, so the list follows the pools topic (market_outcomes) rather than every bets row (#204). The database pings it at most once every few seconds (#250).
  markets(): LiveSubscription[] {
    return [{ topic: 'markets' }, { topic: 'pools' }]
  },
  // Needs you's task submissions to review only change via task_completions -- a rejection moves
  // no balance, so bets/profiles don't cover it. A reviewer or above needs every submission (the
  // reviews topic); a member only needs their own, for Getting started's task step.
  // profiles isn't watched here: every bet moves some balance, so watching all of them refreshed
  // every open Home on every bet (#68). The layout's base channel already follows this member's
  // own profile; the rank catches up on the next visit.
  // Your bets and what's riding move when the member bets or places a parlay, and when a market
  // or parlay settles (markets, and parlays' own status). Activity, the feed's newest rows (#388),
  // doesn't follow the activity topic: every bet pings it, and Home is the most-opened page, so
  // that would bring back #68's refresh-on-every-bet and its Vercel cost. It catches up with any
  // of these refreshes, and /feed stays live. tasks carries what tasks pay, which a member at 0 DC sees.
  home({ me, reviewer }: { me: string; reviewer: boolean }): LiveSubscription[] {
    return [
      { topic: 'markets' },
      { topic: 'tasks' },
      { table: 'bets', filter: `profile_id=eq.${me}` },
      { table: 'parlays', filter: `profile_id=eq.${me}` },
      reviewer ? { topic: 'reviews' } : { table: 'task_completions', filter: `profile_id=eq.${me}` },
    ]
  },
  // Not profiles (#205): apply_coin_transaction updates a balance on every bet, win, task and parlay,
  // so watching every profile refreshed every open leaderboard on every coin movement, as Home once
  // did (#68). A bet moves nobody's net worth (balance down, riding up), and a settled market is
  // what really reorders both boards, so only markets is followed; the rest catches up on the next
  // visit, or when the tab returns to the foreground.
  leaderboard(): LiveSubscription[] {
    return [{ topic: 'markets' }]
  },
  // Only this member's profile (#68): their balance and name stay live, and their rank, which
  // other members' bets can move, catches up on the next visit. activity_events carries every kind
  // this page shows, task approvals and resolutions included.
  member(memberId: string): LiveSubscription[] {
    return [
      { table: 'activity_events', filter: `actor_id=eq.${memberId}` },
      { table: 'profiles', filter: `id=eq.${memberId}` },
      // Every reaction: a reaction row names its event, not the event's actor, and a filtered
      // channel would never hear a reaction being taken back (a DELETE).
      { topic: 'reactions' },
    ]
  },
  // Every feed kind is a row in activity_events. Reactions come through their own topic, so a
  // reaction taken back (a DELETE) still arrives.
  feed(): LiveSubscription[] {
    return [{ topic: 'activity' }, { topic: 'reactions' }]
  },
  tasks(userId: string): LiveSubscription[] {
    return [{ topic: 'tasks' }, { table: 'task_completions', filter: `profile_id=eq.${userId}` }]
  },
  // The markets topic carries every status change and resolution that moves a bet between tabs or
  // changes its result. It also carries parlay leg badges: settle_parlay writes nothing to
  // parlays/parlay_legs when a leg wins while others in the same parlay are still open. A member's
  // own legs are written with their parlay, and only a market's delete removes one (by cascade), so
  // the parlays row and the markets topic cover them without following every member's legs.
  myBets(userId: string): LiveSubscription[] {
    return [
      { table: 'bets', filter: `profile_id=eq.${userId}` },
      { table: 'parlays', filter: `profile_id=eq.${userId}` },
      { topic: 'markets' },
    ]
  },
  // A parlay's page: its own row (status, credit), its legs, and every market, since a leg's
  // result comes from the market resolving.
  parlay(parlayId: string): LiveSubscription[] {
    return [
      { table: 'parlays', filter: `id=eq.${parlayId}` },
      { table: 'parlay_legs', filter: `parlay_id=eq.${parlayId}` },
      { topic: 'markets' },
    ]
  },
  // coin_transactions isn't published for realtime, but every row in it moves the member's own
  // balance in the same transaction, so their profile row changes whenever their history does.
  myCoins(userId: string): LiveSubscription[] {
    return [{ table: 'profiles', filter: `id=eq.${userId}` }]
  },
  adminTasks(): LiveSubscription[] {
    return [{ topic: 'reviews' }]
  },
}
