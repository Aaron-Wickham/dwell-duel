import type { ReactNode } from 'react'
import { describeEvent, type FeedEvent, type FeedKind } from '@/lib/social/describe-event'
import { isOldEntry, relativeTime } from '@/lib/social/relative-time'
import { SectionCard } from '@/components/ui/section-card'
import { ListSection } from '@/components/ui/list-section'
import { dividedRowsClass } from '@/components/ui/list-card'
import { EmptyState } from '@/components/ui/empty-state'
import { LocalTime } from '@/components/ui/local-time'
import { FeedItem } from '@/components/feed/feed-item'
import { ReactionBar } from '@/components/feed/reaction-bar'
import { noReactions, type EventReactions } from '@/lib/social/reactions'
import { rowDomId } from '@/lib/pagination/row-id'

// A Record, so a kind added to FeedKind fails the type check until it's listed here.
const KNOWN_KINDS: Record<FeedKind, true> = {
  bet_placed: true,
  parlay_placed: true,
  market_created: true,
  market_resolved: true,
  market_voided: true,
  bet_won: true,
  parlay_won: true,
  task_completed: true,
  season_champion: true,
}

// A kind this build doesn't know (one added later, or read after a rollback) is left out rather
// than rendered without a sentence, so a new kind can never take the feed down.
export function knownEvents(events: FeedEvent[]): FeedEvent[] {
  return events.filter((e) => Object.hasOwn(KNOWN_KINDS, e.kind))
}

// The rows of a feed list, for a list of the caller's own: the feed and member activity's, or
// Home's Activity (#388), which shows the newest few with no reactions.
export function FeedItems({
  events,
  reactions,
  now,
  rowIdPrefix,
}: {
  events: FeedEvent[]
  reactions?: Map<string, EventReactions>
  now: number
  rowIdPrefix?: string
}) {
  return knownEvents(events).map((e) => (
    <FeedItem
      key={e.id}
      segments={describeEvent(e)}
      age={isOldEntry(e.occurredAt, now) ? <LocalTime iso={e.occurredAt} format="day" /> : relativeTime(e.occurredAt, now)}
      detail={e.kind === 'market_resolved' ? e.resolutionNote : e.kind === 'market_voided' ? e.voidReason : null}
      note={e.kind === 'market_resolved' ? e.creatorStake : null}
      reactions={reactions && <ReactionBar eventId={e.id} reactions={reactions.get(e.id) ?? noReactions()} />}
      domId={rowIdPrefix && rowDomId(rowIdPrefix, e.id)}
    />
  ))
}

export function FeedList({
  events,
  reactions,
  now,
  heading,
  headingId,
  headingHidden,
  aboveList,
  belowList,
  emptyState,
  rowIdPrefix,
}: {
  events: FeedEvent[]
  // Each event's reactions (getReactions). Without it, the items show no reaction buttons.
  reactions?: Map<string, EventReactions>
  // The page's render time, so every age comes from one clock.
  now: number
  heading: string
  headingId: string
  headingHidden?: boolean
  aboveList?: ReactNode
  belowList?: ReactNode
  emptyState?: ReactNode
  rowIdPrefix?: string
}) {
  const known = knownEvents(events)
  const body =
    known.length === 0 ? (
      emptyState ?? <EmptyState title="Nothing yet.">Bets, new markets, results and finished tasks show up here as they happen.</EmptyState>
    ) : (
      <ul className={dividedRowsClass}>
        <FeedItems events={known} reactions={reactions} now={now} rowIdPrefix={rowIdPrefix} />
      </ul>
    )

  // A hidden heading means the feed is the page's only content, so its rows sit on the page (D2).
  if (headingHidden) {
    return (
      <ListSection title={heading} titleId={headingId} titleHidden className="gap-0">
        {aboveList}
        {body}
        {belowList}
      </ListSection>
    )
  }
  return (
    <SectionCard title={heading} titleId={headingId} className="pb-1 md:pt-[18px] md:pb-1">
      {aboveList}
      {body}
      {belowList}
    </SectionCard>
  )
}
