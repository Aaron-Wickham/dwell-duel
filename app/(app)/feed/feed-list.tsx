import type { ReactNode } from 'react'
import { BookOpen, Crown, Flag, Layers, MessageSquareText, Plus, Target, Trophy, type LucideIcon } from 'lucide-react'
import { describeEvent, type FeedEvent, type FeedKind } from '@/lib/social/describe-event'
import { ageLabel } from '@/lib/social/relative-time'
import { SectionCard } from '@/components/ui/section-card'
import { EmptyState } from '@/components/ui/empty-state'
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
  bet_won: Trophy,
  parlay_won: Trophy,
  task_completed: BookOpen,
  season_champion: Crown,
}

export function FeedList({
  events,
  reactions,
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
  heading: string
  headingId: string
  headingHidden?: boolean
  aboveList?: ReactNode
  belowList?: ReactNode
  emptyState?: ReactNode
  rowIdPrefix?: string
}) {
  const body =
    events.length === 0 ? (
      emptyState ?? <EmptyState icon={MessageSquareText} title="Nothing yet." />
    ) : (
      <ul className={cn('flex flex-col divide-y divide-line', headingHidden && 'px-[18px] md:px-6')}>
        {events.map((e) => (
          <FeedItem
            key={e.id}
            icon={EVENT_ICONS[e.kind]}
            segments={describeEvent(e)}
            age={ageLabel(e.occurredAt)}
            detail={e.kind === 'market_resolved' ? e.resolutionNote : null}
            note={e.kind === 'market_resolved' ? e.creatorStake : null}
            reactions={reactions && <ReactionBar eventId={e.id} reactions={reactions.get(e.id) ?? noReactions()} />}
            domId={rowIdPrefix && rowDomId(rowIdPrefix, e.id)}
          />
        ))}
      </ul>
    )

  if (headingHidden && events.length === 0) {
    return (
      <>
        {aboveList}
        {body}
        {belowList}
      </>
    )
  }

  return (
    <SectionCard
      title={headingHidden ? <span className="sr-only">{heading}</span> : heading}
      titleId={headingId}
      className={cn('max-w-[820px]', headingHidden ? 'gap-0 py-1 px-0 md:py-1 md:px-0' : 'pb-1 md:pt-[18px] md:pb-1')}
    >
      {aboveList}
      {body}
      {belowList}
    </SectionCard>
  )
}
