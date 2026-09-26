import { Skeleton, SkeletonCard } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

const ROW_WIDTHS = ['w-4/5', 'w-3/5', 'w-2/3', 'w-1/2', 'w-3/4', 'w-7/12']

// Mirrors FeedList (app/(app)/feed/feed-list.tsx), with or without its visible heading.
export function FeedListSkeleton({ headingHidden = false, rows = 6 }: { headingHidden?: boolean; rows?: number }) {
  return (
    <SkeletonCard
      className={cn('max-w-[820px]', headingHidden ? 'gap-0 px-0 py-1 md:px-0 md:py-1' : 'pb-1 md:pt-[18px] md:pb-1')}
    >
      {!headingHidden && <Skeleton className="h-6 w-44" />}
      <div className={cn('flex flex-col divide-y divide-line', headingHidden && 'px-[18px] md:px-6')}>
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-start gap-3 py-3.5">
            <Skeleton className="size-9 shrink-0 rounded-[10px]" />
            <div className="grow pt-[7px]">
              <Skeleton className={cn('h-4', ROW_WIDTHS[i % ROW_WIDTHS.length])} />
            </div>
            <Skeleton className="mt-[7px] h-4 w-9 shrink-0" />
          </div>
        ))}
      </div>
    </SkeletonCard>
  )
}
