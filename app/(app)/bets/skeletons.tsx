import { pageClassFor } from '@/components/ui/page'
import { cn } from '@/lib/utils'
import { listCardClass } from '@/components/ui/list-card'
import { betListClass } from './bet-rows'
import { Skeleton, SkeletonPageHeader, SkeletonScreen } from '@/components/ui/skeleton'

function Tabs() {
  return <Skeleton className="h-[52px] w-full rounded-tile md:w-[357px]" />
}

// Open, Settled and Cancelled: the tabs, then one tab's list cards straight on the page (D2), two
// to a row at lg. A title with its day, then the stake line.
export function BetsSkeleton() {
  return (
    <SkeletonScreen name="bets" className={pageClassFor('wide')}>
      <SkeletonPageHeader />
      <Tabs />
      <div className={betListClass}>
        {Array.from({ length: 6 }, (_, i) => (
          <div
            key={i}
            className={cn(
              listCardClass,
              'flex flex-col gap-2',
              // A phone shows four cards; lg fills three rows of two.
              i >= 4 && 'hidden lg:flex',
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-4 w-12 shrink-0" />
            </div>
            <Skeleton className="h-4 w-1/2" />
          </div>
        ))}
      </div>
    </SkeletonScreen>
  )
}

// Coins, at the reading width like its page: the tabs, the privacy line, then days of divided
// rows, each a heading over a label and its time, with the amount on the right.
export function CoinsSkeleton() {
  return (
    <SkeletonScreen name="bets-coins" className={pageClassFor('reading')}>
      <SkeletonPageHeader />
      <Tabs />
      <div className="flex h-5 items-center">
        <Skeleton className="h-3.5 w-56" />
      </div>
      <div className="flex flex-col gap-5">
        {[3, 4].map((rows, day) => (
          <div key={day} className="flex flex-col">
            <div className="border-b border-line pb-2">
              <div className="flex h-4 items-center">
                <Skeleton className="h-3 w-20" />
              </div>
            </div>
            <div className="flex flex-col divide-y divide-line">
              {Array.from({ length: rows }, (_, i) => (
                <div key={i} className="flex items-start justify-between gap-3 py-3">
                  <div className="flex min-w-0 grow flex-col gap-1">
                    <div className="flex h-6 items-center">
                      <Skeleton className="h-4 w-3/4" />
                    </div>
                    <div className="flex h-5 items-center">
                      <Skeleton className="h-3.5 w-16" />
                    </div>
                  </div>
                  <div className="flex h-6 items-center">
                    <Skeleton className="h-4 w-14" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </SkeletonScreen>
  )
}
