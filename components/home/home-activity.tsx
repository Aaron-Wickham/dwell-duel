import { EmptyState } from '@/components/ui/empty-state'
import { FeedItems, knownEvents } from '@/app/(app)/feed/feed-list'
import type { FeedEvent } from '@/lib/social/describe-event'
import { HomeSection, SeeAll, homeRowsClass } from './home-section'

// The feed's newest few rows (D1: Feed moved into Home), with "See all" opening Activity (/feed).
// Reactions stay on Activity, where there's room for them.
export function HomeActivity({ events, now }: { events: FeedEvent[]; now: number }) {
  return (
    <HomeSection title="Activity" titleId="home-activity-title" action={<SeeAll href="/feed" drillDown />}>
      {knownEvents(events).length === 0 ? (
        <div className="pt-2">
          <EmptyState title="Nothing yet.">
            Bets, new markets, results and finished tasks show up here as they happen.
          </EmptyState>
        </div>
      ) : (
        <ul className={homeRowsClass}>
          <FeedItems events={events} now={now} />
        </ul>
      )}
    </HomeSection>
  )
}
