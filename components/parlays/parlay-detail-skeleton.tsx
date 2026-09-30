import { Skeleton, SkeletonCard, SkeletonScreen } from '@/components/ui/skeleton'

// Stand-ins for the three sections a parlay's page streams (app/(app)/parlays/[id]/page.tsx):
// the summary, the picks and How it adds up, each carrying its section's grid placement so the
// lg layout holds while they load. None announces itself; the page renders one <LoadingStatus />
// around them, as the market page does.
export function ParlayDetailSkeleton({ legs }: { legs: number }) {
  return (
    <>
      <SkeletonScreen name="parlay-summary" announce={false} className="lg:col-start-2 lg:row-start-1">
        <SkeletonCard className="gap-4 bg-hero">
          <Skeleton className="h-7 w-24 rounded-full bg-hero-inset" />
          <div className="flex flex-col gap-1">
            <Skeleton className="h-5 w-24 bg-hero-inset" />
            <Skeleton className="h-[34px] w-32 bg-hero-inset" />
            <Skeleton className="h-5 w-56 max-w-full bg-hero-inset" />
          </div>
          <div className="flex flex-col gap-1.5">
            <div className="flex gap-[3px]">
              {Array.from({ length: legs }, (_, i) => (
                <Skeleton key={i} className="h-1.5 flex-1 rounded-full bg-hero-inset" />
              ))}
            </div>
            <Skeleton className="h-5 w-28 bg-hero-inset" />
          </div>
        </SkeletonCard>
      </SkeletonScreen>
      <SkeletonScreen name="parlay-picks" announce={false} className="lg:col-start-1 lg:row-span-2 lg:row-start-1">
        <SkeletonCard>
          <Skeleton className="h-6 w-16" />
          <div className="flex flex-col divide-y divide-line">
            {Array.from({ length: legs }, (_, i) => (
              <div key={i} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0">
                <div className="flex items-start justify-between gap-3">
                  <Skeleton className="h-6 w-3/5" />
                  <Skeleton className="h-6 w-16 shrink-0 rounded-full" />
                </div>
                <Skeleton className="h-5 w-48 max-w-full" />
                <Skeleton className="h-5 w-40 max-w-full" />
              </div>
            ))}
          </div>
        </SkeletonCard>
      </SkeletonScreen>
      <SkeletonScreen name="parlay-maths" announce={false} className="lg:col-start-2 lg:row-start-2">
        <SkeletonCard>
          <Skeleton className="h-6 w-36" />
          <div className="flex flex-col gap-2">
            {Array.from({ length: 3 }, (_, i) => (
              <div key={i} className="flex justify-between gap-3">
                <Skeleton className="h-6 w-28" />
                <Skeleton className="h-6 w-16" />
              </div>
            ))}
          </div>
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-2/3" />
        </SkeletonCard>
      </SkeletonScreen>
    </>
  )
}
