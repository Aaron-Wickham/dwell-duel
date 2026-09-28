import { pageClass } from '@/components/ui/page'
import { Skeleton, SkeletonCard, SkeletonPageHeader, SkeletonScreen } from '@/components/ui/skeleton'

function RowsCard({ rows }: { rows: number }) {
  return (
    <SkeletonCard className="gap-1">
      <Skeleton className="h-6 w-24" />
      <div className="flex flex-col divide-y divide-line">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-start justify-between gap-3 py-3">
            <div className="flex grow flex-col gap-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </div>
            <Skeleton className="h-7 w-16 shrink-0 rounded-full" />
          </div>
        ))}
      </div>
    </SkeletonCard>
  )
}

// Mirrors My bets: Open beside Settled and Cancelled from lg.
export default function Loading() {
  return (
    <SkeletonScreen name="bets" className={pageClass}>
      <SkeletonPageHeader description />
      <div className="flex flex-col gap-5 md:gap-7 lg:grid lg:grid-cols-2 lg:items-start">
        <RowsCard rows={3} />
        <div className="flex flex-col gap-5 md:gap-7">
          <RowsCard rows={3} />
          <RowsCard rows={1} />
        </div>
      </div>
    </SkeletonScreen>
  )
}
