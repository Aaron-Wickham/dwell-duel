import { seasonName, signedDc } from './season'

export type FeedKind =
  | 'bet_placed'
  | 'parlay_placed'
  | 'market_created'
  | 'market_resolved'
  | 'market_voided'
  | 'bet_won'
  | 'parlay_won'
  | 'task_completed'
  | 'season_champion'

export interface FeedEvent {
  id: string
  kind: FeedKind
  occurredAt: string
  actorId: string
  actorName: string
  marketId: string | null
  marketTitle: string | null
  outcomeLabel: string | null
  amount: number | null
  legCount: number | null
  taskTitle: string | null
  // Why a market resolved the way it did (0042), for market_resolved events.
  resolutionNote: string | null
  // Why a market was voided (0073), for market_voided events.
  voidReason: string | null
  // For a result: what the market's creator had riding on it (#84).
  creatorStake: string | null
  // For a champion: the month they won, as YYYY-MM (0051).
  season: string | null
}

export type Segment = string | { text: string; href: string }

function actor(e: FeedEvent): Segment {
  return { text: e.actorName, href: `/members/${e.actorId}` }
}

function market(e: FeedEvent): Segment {
  return { text: e.marketTitle ?? '', href: `/markets/${e.marketId}` }
}

export function describeEvent(e: FeedEvent): Segment[] {
  switch (e.kind) {
    case 'bet_placed':
      return [actor(e), ` bet ${e.amount} DC on ${e.outcomeLabel} in `, market(e)]
    case 'parlay_placed':
      return [actor(e), ` placed a ${e.legCount}-pick parlay for ${e.amount} DC`]
    case 'market_created':
      return [actor(e), ' opened ', market(e)]
    case 'market_resolved':
      return [market(e), ` resolved: ${e.outcomeLabel}`]
    case 'market_voided':
      return [actor(e), ' voided ', market(e)]
    case 'bet_won':
      return [actor(e), ` won ${e.amount} DC on `, market(e)]
    case 'parlay_won':
      return [actor(e), `'s ${e.legCount}-pick parlay paid ${e.amount} DC`]
    case 'task_completed':
      return [actor(e), ` completed ${e.taskTitle} (+${e.amount} DC)`]
    case 'season_champion':
      return [actor(e), ` was ${e.season ? seasonName(e.season) : 'last month'}’s champion with ${signedDc(e.amount ?? 0)}`]
    // A kind added after this build (FeedList leaves such rows out).
    default:
      return []
  }
}
