import { pageClass } from '@/components/ui/page'
import { Skeleton, SkeletonCard, SkeletonPageHeader, SkeletonScreen } from '@/components/ui/skeleton'

// Mirrors the markets list: header with Create market, the status tabs (Open, Waiting and Resolved
// measure 276px from md) with the search beside them (an icon on a phone, a field from md), the
// category button under them on a phone, then a column of market cards, three across from lg. The
// button shows only while more than one category holds markets, which is the group's usual state,
// so the phone skeleton keeps its row rather than have every card jump down when it arrives. From
// md it sits between the tabs and the field and doesn't change the row's height. Each card draws an
// open two-outcome card's quick-picks row, since Open is the default tab and its cards carry it;
// Waiting and Resolved cards have none and shrink by that row when they land, the same trade as the
// category button.
// It sits in the (list) group because a loading.tsx also wraps every segment below it, and market
// detail's real 404 needs nothing above it that streams.
export default function Loading() {
  return (
    <SkeletonScreen name="markets" className={pageClass}>
      <SkeletonPageHeader action />
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 md:gap-3">
          <Skeleton className="h-[52px] min-w-0 flex-1 rounded-tile md:w-[276px] md:flex-none" />
          <Skeleton className="size-11 shrink-0 rounded-control md:ml-auto md:h-12 md:w-80" />
        </div>
        <Skeleton className="h-12 rounded-control md:hidden" />
      </div>
      <div className="grid gap-5 lg:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <SkeletonCard key={i}>
            <Skeleton className="h-6 w-4/5" />
            <div className="flex items-baseline gap-2">
              <Skeleton className="h-8 w-14" />
              <Skeleton className="h-4 w-12" />
            </div>
            <Skeleton className="h-16" />
            <div className="flex gap-2">
              <Skeleton className="h-11 flex-1 rounded-control" />
              <Skeleton className="h-11 flex-1 rounded-control" />
            </div>
            <Skeleton className="h-4 w-44" />
          </SkeletonCard>
        ))}
      </div>
    </SkeletonScreen>
  )
}
