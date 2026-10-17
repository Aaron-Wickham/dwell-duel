import { pageClass } from '@/components/ui/page'
import { Skeleton, SkeletonScreen } from '@/components/ui/skeleton'
import { homeRowsClass, homeSectionClass } from '@/components/home/home-section'
import { listCardClass, listCardsClass } from '@/components/ui/list-card'
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

function BalanceBlock() {
  return (
    <div className="flex flex-col gap-1 rounded-card bg-hero p-5 md:p-6">
      <Line box="h-5" bar="h-3.5 w-16 bg-hero-2/40" />
      <Line box="h-[60px] md:h-[84px]" bar="h-9 w-44 bg-hero-2/40 md:h-12 md:w-56" />
      <Line box="h-5" bar="h-3.5 w-56 bg-hero-2/40" />
    </div>
  )
}

// Mirrors Home (#388, #438) with only what every member sees, at its real heights, so nothing moves
// when it lands (measured at 375 and 1280): the greeting; the Balance card (under the greeting on a
// phone, on the right from lg); Your bets' three cards, a title over its stake line, the title two
// lines on a phone and in the two-column grid from lg; Activity's three sentences, two lines on a phone. Needs you and Getting started
// stream in behind empty boundaries of their own (page.tsx), so they aren't drawn here.
export default function Loading() {
  return (
    <SkeletonScreen name="home" className={pageClass}>
      <div className="flex flex-col gap-5 md:gap-7 lg:grid lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-start">
        <div className="flex flex-col gap-5 md:gap-7">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <Skeleton className="h-[31px] w-36 md:h-[45px] md:w-52" />
          </div>
          <div className="lg:hidden">
            <BalanceBlock />
          </div>
          <div className="flex flex-col gap-2">
            <SectionHead seeAll="w-16" />
            <div className={cn(listCardsClass, 'lg:grid lg:grid-cols-2')}>
              {BET_TITLES.map((width, i) => (
                <div key={i} className={cn(listCardClass, 'flex flex-col gap-2 bg-surface')}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 grow flex-col">
                      <Line box="h-[22.1px]" bar={cn('h-4', width)} />
                      <Line box="h-[22.1px] md:max-lg:hidden" bar="h-4 w-1/3" />
                    </div>
                    <Line box="h-5 shrink-0" bar="h-3.5 w-12" />
                  </div>
                  <Line box="h-6" bar="h-3.5 w-40" />
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
        <div className="hidden lg:mt-[73px] lg:block">
          <BalanceBlock />
        </div>
      </div>
    </SkeletonScreen>
  )
}
