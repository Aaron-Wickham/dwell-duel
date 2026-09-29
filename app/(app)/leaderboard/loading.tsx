import { pageClass } from '@/components/ui/page'
import { Skeleton, SkeletonCard, SkeletonPageHeader, SkeletonScreen } from '@/components/ui/skeleton'

// Mirrors the leaderboard: header with its description, the board tabs, then the rankings card.
export default function Loading() {
  return (
    <SkeletonScreen name="leaderboard" className={pageClass}>
      <SkeletonPageHeader description />
      <Skeleton className="h-[52px] w-full rounded-[14px] md:w-72" />
      <SkeletonCard className="max-w-[820px] gap-0 px-2 py-1.5 md:px-3 md:py-1.5">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex min-h-[60px] items-center gap-3 px-2.5 py-2.5 md:px-3.5">
            <Skeleton className="size-10 shrink-0" />
            <Skeleton className="size-10 shrink-0 rounded-full" />
            <div className="grow">
              <Skeleton className="h-5 w-32" />
            </div>
            <Skeleton className="h-5 w-16 shrink-0" />
          </div>
        ))}
      </SkeletonCard>
    </SkeletonScreen>
  )
}
