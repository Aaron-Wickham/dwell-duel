import { pageClass } from '@/components/ui/page'
import { Skeleton, SkeletonScreen } from '@/components/ui/skeleton'
import { homeRowsClass, homeSectionClass } from '@/components/home/home-section'
import { cn } from '@/lib/utils'

const BET_TITLES = ['w-4/5', 'w-3/5', 'w-2/3']
const ACTIVITY_LINES = ['w-4/5', 'w-3/5', 'w-2/3']

function SectionHead({ seeAll }: { seeAll: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <Skeleton className="h-6 w-28" />
      <Skeleton className={cn('h-5', seeAll)} />
    </div>
  )
}

// Mirrors Home (#388) with only what every member sees, so nothing moves when it lands: the
// greeting with its line, Your bets' three rows and Activity's three; from lg those sit on the
// left and the Balance card on the right. Needs you, Getting started and the rest show only when
// they apply, so they're left out.
export default function Loading() {
  return (
    <SkeletonScreen name="home" className={pageClass}>
      <div className="flex flex-col gap-5 md:gap-7 lg:grid lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-start">
        <div className="flex flex-col gap-5 md:gap-7">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <Skeleton className="h-8 w-36 md:h-11 md:w-52" />
            <Skeleton className="h-4 w-40 lg:hidden" />
          </div>
          <div className={homeSectionClass}>
            <SectionHead seeAll="w-16" />
            <div className={homeRowsClass}>
              {BET_TITLES.map((width, i) => (
                <div key={i} className="flex items-center justify-between gap-3 py-3">
                  <div className="flex min-w-0 grow flex-col gap-2">
                    <Skeleton className={cn('h-5', width)} />
                    <Skeleton className="h-4 w-40" />
                  </div>
                  <Skeleton className="h-4 w-12 shrink-0" />
                </div>
              ))}
            </div>
          </div>
          <div className={homeSectionClass}>
            <SectionHead seeAll="w-14" />
            <div className={homeRowsClass}>
              {ACTIVITY_LINES.map((width, i) => (
                <div key={i} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-3 py-3.5">
                  <Skeleton className="size-9 shrink-0 rounded-segment" />
                  <div className="grow pt-[7px]">
                    <Skeleton className={cn('h-4', width)} />
                  </div>
                  <Skeleton className="mt-[7px] h-4 w-9 shrink-0" />
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="hidden flex-col gap-1 rounded-card bg-acc-soft p-6 lg:mt-[73px] lg:flex">
          <Skeleton className="h-4 w-20 bg-surface/60" />
          <Skeleton className="h-14 w-56 bg-surface/60" />
          <Skeleton className="h-4 w-64 bg-surface/60" />
        </div>
      </div>
    </SkeletonScreen>
  )
}
