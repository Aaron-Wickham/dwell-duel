import { pageClass } from '@/components/ui/page'
import { dividedRowsClass } from '@/components/ui/list-card'
import { Skeleton, SkeletonCard, SkeletonPageHeader, SkeletonScreen } from '@/components/ui/skeleton'

// The podium's blocks by place (components/leaderboard/podium.tsx), drawn in DOM order.
const PODIUM = [
  { avatar: 'size-16 md:size-20', block: 'h-[72px]', order: 'order-2' },
  { avatar: 'size-10', block: 'h-[48px]', order: 'order-1' },
  { avatar: 'size-10', block: 'h-[34px]', order: 'order-3' },
]

// Mirrors the Net worth board: the header, the board tabs, then the rankings as divided rows on the
// page (D2), with the podium above them on a phone and, at lg, in a side column beside them over
// Your standing (7 : 5).
export default function Loading() {
  return (
    <SkeletonScreen name="leaderboard" className={pageClass}>
      <SkeletonPageHeader />
      <Skeleton className="h-[52px] w-full rounded-tile md:w-[232px]" />
      <div className="flex flex-col gap-5 md:gap-7 lg:grid lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-start">
        <div className="flex flex-col gap-5 lg:col-start-2 lg:row-start-1 lg:gap-7">
          <div className="flex items-end justify-center gap-3 md:gap-6">
            {PODIUM.map((place, i) => (
              <div key={i} className={`flex min-w-0 flex-1 flex-col items-center gap-1 ${place.order}`}>
                <Skeleton className={`shrink-0 rounded-full ${place.avatar}`} />
                <Skeleton className="h-[18px] w-20 max-w-full" />
                <Skeleton className="h-4 w-14" />
                <Skeleton className={`mt-1 w-full rounded-t-segment rounded-b-none ${place.block}`} />
              </div>
            ))}
          </div>
          <SkeletonCard className="hidden gap-4 lg:flex">
            <Skeleton className="h-6 w-36" />
            <div className="grid grid-cols-3 gap-3">
              {Array.from({ length: 3 }, (_, i) => (
                <div key={i} className="flex flex-col gap-1.5">
                  <Skeleton className="h-4 w-12" />
                  <Skeleton className="h-[22px] w-20" />
                </div>
              ))}
            </div>
            <Skeleton className="h-4 w-48" />
          </SkeletonCard>
        </div>
        <div className={`${dividedRowsClass} lg:col-start-1 lg:row-start-1`}>
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="flex min-h-14 items-center gap-3 py-2.5">
              <Skeleton className="h-5 w-6 shrink-0" />
              <Skeleton className="size-8 shrink-0 rounded-full" />
              <div className="min-w-0 grow">
                <Skeleton className="h-5 w-32 max-w-full" />
              </div>
              <Skeleton className="h-5 w-14 shrink-0" />
            </div>
          ))}
        </div>
      </div>
    </SkeletonScreen>
  )
}
