import { pageClass } from '@/components/ui/page'
import { Skeleton, SkeletonScreen } from '@/components/ui/skeleton'
import { homeRowsClass, homeSectionClass } from '@/components/home/home-section'
import { cn } from '@/lib/utils'

const BET_TITLES = ['w-4/5', 'w-3/5', 'w-2/3']
const ACTIVITY_LINES = ['w-4/5', 'w-3/5', 'w-2/3']

// A bar centred in a box one text line tall, so the skeleton's rows are as tall as the real ones.
function Line({ box, bar }: { box: string; bar: string }) {
  return (
    <div className={cn('flex items-center', box)}>
      <Skeleton className={bar} />
    </div>
  )
}

function SectionHead({ seeAll }: { seeAll: string }) {
  return (
    <div className="flex h-[25px] items-center justify-between gap-3 md:h-7">
      <Skeleton className="h-5 w-28" />
      <Skeleton className={cn('h-4', seeAll)} />
    </div>
  )
}

// Mirrors Home (#388) with only what every member sees, at its real heights, so nothing moves when
// it lands (measured at 375 and 1280): the greeting with its line; Your bets' three rows, a title
// over its stake line, the title two lines on a phone; Activity's three sentences, two lines on a
// phone; from lg those sit on the left and the Balance card on the right. Needs you and Getting
// started stream in behind empty boundaries of their own (page.tsx), so they aren't drawn here.
export default function Loading() {
  return (
    <SkeletonScreen name="home" className={pageClass}>
      <div className="flex flex-col gap-5 md:gap-7 lg:grid lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-start">
        <div className="flex flex-col gap-5 md:gap-7">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <Skeleton className="h-[31px] w-36 md:h-[45px] md:w-52" />
            <Skeleton className="h-4 w-40 lg:hidden" />
          </div>
          <div className={homeSectionClass}>
            <SectionHead seeAll="w-16" />
            <div className={homeRowsClass}>
              {BET_TITLES.map((width, i) => (
                <div key={i} className="flex items-center justify-between gap-3 py-3">
                  <div className="flex min-w-0 grow flex-col gap-1">
                    <div className="flex flex-col">
                      <Line box="h-[22.1px]" bar={cn('h-4', width)} />
                      <Line box="h-[22.1px] md:hidden" bar="h-4 w-1/3" />
                    </div>
                    <Line box="h-5" bar="h-3.5 w-40" />
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
                <div key={i} className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 py-3.5">
                  <div className="flex flex-col">
                    <Line box="h-6" bar={cn('h-4', width)} />
                    <Line box="h-6 md:hidden" bar="h-4 w-1/2" />
                  </div>
                  <Line box="h-[22px]" bar="h-3.5 w-9" />
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="hidden flex-col gap-1 rounded-card bg-acc-soft p-6 lg:mt-[73px] lg:flex">
          <Skeleton className="h-4 w-20 bg-surface/60" />
          <Line box="h-[84px]" bar="h-14 w-56 bg-surface/60" />
          <Line box="h-5" bar="h-4 w-64 bg-surface/60" />
        </div>
      </div>
    </SkeletonScreen>
  )
}
