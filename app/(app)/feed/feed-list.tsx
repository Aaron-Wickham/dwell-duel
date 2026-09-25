import { BookOpen, Flag, Layers, MessageSquareText, Plus, Target, Trophy, type LucideIcon } from 'lucide-react'
import { describeEvent, type FeedEvent, type FeedKind } from '@/lib/social/describe-event'
import { ageLabel } from '@/lib/social/relative-time'
import { SectionCard } from '@/components/ui/section-card'
import { EmptyState } from '@/components/ui/empty-state'
import { FeedItem } from '@/components/feed/feed-item'
import { cn } from '@/lib/utils'

const EVENT_ICONS: Record<FeedKind, LucideIcon> = {
  bet_placed: Target,
  parlay_placed: Layers,
  market_created: Plus,
  market_resolved: Flag,
  bet_won: Trophy,
  parlay_won: Trophy,
  task_completed: BookOpen,
}

export function FeedList({
  events,
  heading,
  headingId,
  headingHidden,
}: {
  events: FeedEvent[]
  heading: string
  headingId: string
  headingHidden?: boolean
}) {
  const body =
    events.length === 0 ? (
      <EmptyState icon={MessageSquareText} title="Nothing yet." />
    ) : (
      <ul className={cn('flex flex-col divide-y divide-line', headingHidden && 'px-[18px] md:px-6')}>
        {events.map((e) => (
          <FeedItem key={e.id} icon={EVENT_ICONS[e.kind]} segments={describeEvent(e)} age={ageLabel(e.occurredAt)} />
        ))}
      </ul>
    )

  // A hidden heading with nothing to show (the Feed page, empty) renders no card at all.
  if (headingHidden && events.length === 0) return body

  return (
    <SectionCard
      title={headingHidden ? <span className="sr-only">{heading}</span> : heading}
      titleId={headingId}
      className={cn('max-w-[820px]', headingHidden && 'gap-0 py-1 px-0 md:py-1 md:px-0')}
    >
      {body}
    </SectionCard>
  )
}
