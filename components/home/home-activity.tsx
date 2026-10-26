import { EmptyState } from '@/components/ui/empty-state'
import { FeedItems, knownEvents } from '@/app/(app)/feed/feed-list'
import type { FeedEvent } from '@/lib/social/describe-event'
import { HomeSection, SeeAll, homeRowsClass } from './home-section'

// The feed's newest few rows (D1: Feed moved into Home), with "See all" opening Activity (/feed).
// Reactions stay on Activity, where there's room for them. `events` is null when the read failed
// (HOME-1): the section keeps its heading, See all and the three rows' height the skeleton drew
// (loading.tsx: 76px rows below md, 52px from it, two dividers), so nothing below it jumps.
export function HomeActivity({ events, now }: { events: FeedEvent[] | null; now: number }) {
  return (
    <HomeSection title="Activity" titleId="home-activity-title" action={<SeeAll href="/feed" drillDown />}>
      {events === null ? (
        <p className="min-h-[230px] py-3.5 text-ink2 md:min-h-[158px]">Activity didn’t load. Reload the page to try again, or open See all.</p>
      ) : knownEvents(events).length === 0 ? (
        <div className="pt-2">
          <EmptyState title="Nothing yet.">
            Bets, new markets, results and approved tasks show up here as they happen.
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
