import { pageClass } from '@/components/ui/page'
import { cn } from '@/lib/utils'
import { listCardClass, listCardsClass } from '@/components/ui/list-card'
import { Skeleton, SkeletonPageHeader, SkeletonScreen } from '@/components/ui/skeleton'

// Mirrors My bets: the tabs (three bet statuses and Coins), then one tab's list cards straight on
// the page (D2), two across at lg. A title with its day, then the stake line.
export default function Loading() {
  return (
    <SkeletonScreen name="bets" className={pageClass}>
      <SkeletonPageHeader description />
      <Skeleton className="h-[52px] w-full rounded-tile md:w-96" />
      <div className={cn(listCardsClass, 'lg:grid lg:grid-cols-2 lg:items-start lg:gap-3')}>
        {Array.from({ length: 6 }, (_, i) => (
          <div
            key={i}
            className={cn(
              listCardClass,
              'flex flex-col gap-2',
              // A phone shows four cards; lg fills three rows of two.
              i >= 4 && 'hidden lg:flex',
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-4 w-12 shrink-0" />
            </div>
            <Skeleton className="h-4 w-1/2" />
          </div>
        ))}
      </div>
    </SkeletonScreen>
  )
}
