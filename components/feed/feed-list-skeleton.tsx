import { Skeleton, SkeletonCard } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

const ROW_WIDTHS = ['w-4/5', 'w-3/5', 'w-2/3', 'w-1/2', 'w-3/4', 'w-7/12']

// Mirrors FeedList (app/(app)/feed/feed-list.tsx), with or without its visible heading. `reactions`
// draws each row's four reaction pills, the way a list given reactions renders them; without it the
// rows stay one line tall.
export function FeedListSkeleton({
  headingHidden = false,
  rows = 6,
  reactions = false,
}: {
  headingHidden?: boolean
  rows?: number
  reactions?: boolean
}) {
  return (
    <SkeletonCard className={headingHidden ? 'gap-0 px-0 py-1 md:px-0 md:py-1' : 'pb-1 md:pt-[18px] md:pb-1'}>
      {!headingHidden && <Skeleton className="h-6 w-44" />}
      <div className={cn('flex flex-col divide-y divide-line', headingHidden && 'px-[18px] md:px-6')}>
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-3 py-3.5">
            <Skeleton className="size-9 shrink-0 rounded-[10px]" />
            <div className="grow pt-[7px]">
              <Skeleton className={cn('h-4', ROW_WIDTHS[i % ROW_WIDTHS.length])} />
            </div>
            <Skeleton className="mt-[7px] h-4 w-9 shrink-0" />
            {reactions && (
              <div data-skeleton-reactions="" className="col-span-2 col-start-2 flex flex-wrap gap-2 pt-1">
                {Array.from({ length: 4 }, (_, j) => (
                  <Skeleton key={j} className="h-11 w-11 rounded-full" />
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </SkeletonCard>
  )
}
