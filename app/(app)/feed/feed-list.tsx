import type { ReactNode } from 'react'
import { BookOpen, Flag, Layers, MessageSquareText, Plus, Target, Trophy, type LucideIcon } from 'lucide-react'
import { describeEvent, type FeedEvent, type FeedKind } from '@/lib/social/describe-event'
import { ageLabel } from '@/lib/social/relative-time'
import { SectionCard } from '@/components/ui/section-card'
import { EmptyState } from '@/components/ui/empty-state'
import { FeedItem } from '@/components/feed/feed-item'

const EVENT_ICONS: Record<FeedKind, LucideIcon> = {
  bet_placed: Target,
  parlay_placed: Layers,
  market_created: Plus,
  market_resolved: Flag,
  bet_won: Trophy,
  parlay_won: Trophy,
  task_completed: BookOpen,
}

export function FeedList({ events, heading, headingId }: { events: FeedEvent[]; heading: ReactNode; headingId: string }) {
  if (events.length === 0) return <EmptyState icon={MessageSquareText} title="Nothing yet." />

  return (
    <SectionCard title={heading} titleId={headingId} className="gap-0 py-1 px-0 md:py-1 md:px-0">
      <ul className="flex flex-col divide-y divide-line px-[18px] md:px-6">
        {events.map((e) => (
          <FeedItem key={e.id} icon={EVENT_ICONS[e.kind]} segments={describeEvent(e)} age={ageLabel(e.occurredAt)} />
        ))}
      </ul>
    </SectionCard>
  )
}
