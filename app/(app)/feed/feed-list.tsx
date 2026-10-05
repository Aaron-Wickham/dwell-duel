import type { ReactNode } from 'react'
import { Ban, BookOpen, Crown, Flag, Layers, MessageSquareText, Plus, Target, Trophy, type LucideIcon } from 'lucide-react'
import { describeEvent, type FeedEvent, type FeedKind } from '@/lib/social/describe-event'
import { isOldEntry, relativeTime } from '@/lib/social/relative-time'
import { SectionCard } from '@/components/ui/section-card'
import { EmptyState } from '@/components/ui/empty-state'
import { LocalTime } from '@/components/ui/local-time'
import { FeedItem } from '@/components/feed/feed-item'
import { ReactionBar } from '@/components/feed/reaction-bar'
import { noReactions, type EventReactions } from '@/lib/social/reactions'
import { rowDomId } from '@/lib/pagination/row-id'
import { cn } from '@/lib/utils'

const EVENT_ICONS: Record<FeedKind, LucideIcon> = {
  bet_placed: Target,
  parlay_placed: Layers,
  market_created: Plus,
  market_resolved: Flag,
  market_voided: Ban,
  bet_won: Trophy,
  parlay_won: Trophy,
  task_completed: BookOpen,
  season_champion: Crown,
}

// A kind this build doesn't know (one added later, or read after a rollback) is left out rather
// than rendered without a sentence, so a new kind can never take the feed down.
export function knownEvents(events: FeedEvent[]): FeedEvent[] {
  return events.filter((e) => Object.hasOwn(EVENT_ICONS, e.kind))
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
      icon={EVENT_ICONS[e.kind]}
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
      emptyState ?? (
        <EmptyState icon={MessageSquareText} title="Nothing yet.">
          Bets, new markets, results and finished tasks show up here as they happen.
        </EmptyState>
      )
    ) : (
      <ul className={cn('flex flex-col divide-y divide-line', headingHidden && 'px-[18px] md:px-6')}>
        <FeedItems events={known} reactions={reactions} now={now} rowIdPrefix={rowIdPrefix} />
      </ul>
    )

  // With its heading hidden the card's padding belongs to the rows; an empty state has no rows, so
  // it takes the card's own padding instead.
  const bare = headingHidden && known.length > 0
  return (
    <SectionCard
      title={headingHidden ? <span className="sr-only">{heading}</span> : heading}
      titleId={headingId}
      className={bare ? 'gap-0 py-1 px-0 md:py-1 md:px-0' : headingHidden ? 'gap-0' : 'pb-1 md:pt-[18px] md:pb-1'}
    >
      {aboveList}
      {body}
      {belowList}
    </SectionCard>
  )
}
