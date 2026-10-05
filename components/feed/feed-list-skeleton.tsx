import { Skeleton, SkeletonCard } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

const ROW_WIDTHS = ['w-4/5', 'w-3/5', 'w-2/3', 'w-1/2', 'w-3/4', 'w-7/12']

// Mirrors FeedList (app/(app)/feed/feed-list.tsx): in its card under a visible heading, or straight
// on the page with its heading hidden (D2). `reactions` draws the React button under each age, the
// way a list given reactions renders it; a row's used reactions vary (#395), so the skeleton draws
// none.
export function FeedListSkeleton({
  headingHidden = false,
  rows = 6,
  reactions = false,
}: {
  headingHidden?: boolean
  rows?: number
  reactions?: boolean
}) {
  const list = (
    <div className="flex flex-col divide-y divide-line">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 py-3.5">
          <div className="grow pt-0.5">
            <Skeleton className={cn('h-4', ROW_WIDTHS[i % ROW_WIDTHS.length])} />
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2.5">
            <Skeleton className="mt-0.5 h-4 w-9" />
            {reactions && (
              <div data-skeleton-reactions="">
                <Skeleton className="size-6 rounded-full" />
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  )
  if (headingHidden) return list
  return (
    <SkeletonCard className="pb-1 md:pt-[18px] md:pb-1">
      <Skeleton className="h-6 w-44" />
      {list}
    </SkeletonCard>
  )
}
