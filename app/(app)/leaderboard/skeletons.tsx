import { pageClass } from '@/components/ui/page'
import { dividedRowsClass } from '@/components/ui/list-card'
import { Skeleton, SkeletonCard, SkeletonPageHeader, SkeletonScreen } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

// The podium's blocks by place (components/leaderboard/podium.tsx), drawn in DOM order.
const PODIUM = [
  { avatar: 'size-16 md:size-20', block: 'h-[72px]', order: 'order-2' },
  { avatar: 'size-10', block: 'h-[48px]', order: 'order-1' },
  { avatar: 'size-10', block: 'h-[34px]', order: 'order-3' },
]

// The header, the board tabs and the member search, as both boards draw them.
function Head() {
  return (
    <>
      <SkeletonPageHeader />
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between md:gap-4">
        <Skeleton className="h-[52px] w-full rounded-tile md:w-[232px]" />
        <Skeleton className="h-12 w-full rounded-control md:w-96" />
      </div>
    </>
  )
}

function Rankings({ className }: { className?: string }) {
  return (
    <div className={cn(dividedRowsClass, className)}>
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
  )
}

// Your standing's side card (components/leaderboard/your-standing.tsx), shown from lg only.
function StandingCard() {
  return (
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
  )
}

// Net worth: the rankings as divided rows on the page (D2), with the podium above them on a phone
// and, at lg, in a side column beside them over Your standing (7 : 5).
export function NetWorthSkeleton() {
  return (
    <SkeletonScreen name="leaderboard" className={pageClass}>
      <Head />
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
          <StandingCard />
        </div>
        <Rankings className="lg:col-start-1 lg:row-start-1" />
      </div>
    </SkeletonScreen>
  )
}

// This month: no podium (#396). The race card across the page (its heading, the movement line,
// three lines on a phone and one from md, the phone's readout strip, the plot and its day labels),
// then the rankings, with Your standing beside them at lg. The awards and past champions show
// only some months, so they aren't drawn.
export function MonthSkeleton() {
  return (
    <SkeletonScreen name="leaderboard-month" className={pageClass}>
      <Head />
      <SkeletonCard>
        <div className="flex flex-col gap-1">
          <div className="flex h-6 items-center md:h-[26px]">
            <Skeleton className="h-5 w-28" />
          </div>
          <div className="flex flex-col">
            <div className="flex h-5 items-center">
              <Skeleton className="h-3.5 w-full md:w-3/4" />
            </div>
            <div className="flex h-5 items-center md:hidden">
              <Skeleton className="h-3.5 w-full" />
            </div>
            <div className="flex h-5 items-center md:hidden">
              <Skeleton className="h-3.5 w-1/2" />
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <div className="min-h-[5.5rem] md:hidden">
            <div className="flex h-5 items-center">
              <Skeleton className="h-3.5 w-48" />
            </div>
          </div>
          <Skeleton className="h-[220px] md:h-[260px]" />
          <div className="flex h-4 items-center justify-between pr-[96px] md:pr-[120px]">
            <Skeleton className="h-3 w-10" />
            <Skeleton className="h-3 w-8" />
          </div>
        </div>
      </SkeletonCard>
      <div className="flex flex-col gap-5 md:gap-7 lg:grid lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-start">
        <Rankings className="lg:col-start-1 lg:row-start-1" />
        <div className="hidden flex-col gap-5 lg:col-start-2 lg:row-start-1 lg:flex lg:gap-7">
          <StandingCard />
        </div>
      </div>
    </SkeletonScreen>
  )
}
