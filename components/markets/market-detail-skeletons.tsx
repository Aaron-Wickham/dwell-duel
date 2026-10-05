import { Skeleton, SkeletonCard, SkeletonField, SkeletonScreen } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

// Stand-ins for the sections market detail streams (app/(app)/markets/[id]/page.tsx). Each sits in
// its section's own wrapper, which carries the section's place in the phone order and the lg rail
// or main column, so the skeletons carry no placement of their own.

// The page renders one combined <LoadingStatus /> instead (app/(app)/markets/[id]/page.tsx),
// since these sections stream independently and can be pending at the same time.
//
// Each is drawn at its section's real height (measured at 375 and 1280), so nothing moves when the
// sections land (#390): a heading is a box as tall as an h2 line, and a row as tall as its content.

function Heading({ width }: { width: string }) {
  return (
    <div className="flex h-6 items-center md:h-[26px]">
      <Skeleton className={`h-5 ${width}`} />
    </div>
  )
}

export function MarketChartSkeleton() {
  return (
    <SkeletonScreen name="market-chart" announce={false}>
      <SkeletonCard>
        <Heading width="w-44" />
        {/* The chart's bet count and range picker row, the plot, then its tick labels. */}
        <div className="flex h-[52px] items-center justify-between gap-3">
          <Skeleton className="h-4 w-12" />
          <Skeleton className="h-[52px] w-40 rounded-tile" />
        </div>
        <Skeleton className="h-[220px] md:h-[300px]" />
        <Skeleton className="h-5 w-full" />
      </SkeletonCard>
    </SkeletonScreen>
  )
}

// Shown only to a viewer my_market_position found something for, with a row per bet or parlay.
export function MarketPositionSkeleton({ rows }: { rows: number }) {
  return (
    <SkeletonScreen name="market-position" announce={false}>
      <SkeletonCard className="gap-1 border-2 border-ink">
        <Heading width="w-36" />
        <div className="flex h-5 items-center">
          <Skeleton className="h-3.5 w-56 max-w-full" />
        </div>
        <div className="flex flex-col divide-y divide-line">
          {Array.from({ length: Math.min(rows, 4) }, (_, i) => (
            <div key={i} className="flex h-[70px] items-center justify-between gap-3 py-3">
              <div className="flex grow flex-col gap-2">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-4 w-44 max-w-full" />
              </div>
              <Skeleton className="h-7 w-24" />
            </div>
          ))}
        </div>
      </SkeletonCard>
    </SkeletonScreen>
  )
}

// A row per outcome: its name over a payout line, its chance, and, while it takes bets, Add. Once
// it doesn't, the card opens with where the market stands (the result, the void or the wait). The
// line under the rows saying what rides in parlays is held when the page knows there is some.
export function MarketOutcomesSkeleton({
  outcomes,
  canBet,
  waiting = false,
  ridingNote = false,
}: {
  outcomes: number
  canBet: boolean
  // Closed and waiting on its result: one plain line, not a banner, opens the card.
  waiting?: boolean
  ridingNote?: boolean
}) {
  return (
    <SkeletonScreen name="market-outcomes" announce={false}>
      <SkeletonCard className="gap-1">
        <Heading width="w-28" />
        {waiting ? (
          <div className="flex h-8 items-start pb-2">
            <div className="flex h-6 items-center">
              <Skeleton className="h-4 w-64 max-w-full" />
            </div>
          </div>
        ) : (
          !canBet && <Skeleton className="mb-2 h-14 rounded-tile" />
        )}
        <div className="flex flex-col divide-y divide-line">
          {Array.from({ length: outcomes }, (_, i) => (
            <div key={i} className={cn('flex items-center gap-3 py-3', canBet ? 'h-[70px]' : 'h-14')}>
              <div className="flex grow flex-col gap-1.5">
                <Skeleton className="h-5 w-20" />
                {canBet && <Skeleton className="h-4 w-24" />}
              </div>
              <Skeleton className="h-7 w-14" />
              {canBet && <Skeleton className="h-11 w-20" />}
            </div>
          ))}
        </div>
        {ridingNote && (
          <div className="border-t border-line pt-3">
            <div className="flex h-5 items-center">
              <Skeleton className="h-3.5 w-64 max-w-full" />
            </div>
          </div>
        )}
      </SkeletonCard>
    </SkeletonScreen>
  )
}

export function MarketBetsSkeleton() {
  return (
    <SkeletonScreen name="market-bets" announce={false}>
      <SkeletonCard className="gap-1">
        <Skeleton className="h-6 w-16" />
        <div className="flex flex-col divide-y divide-line">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="flex min-h-[52px] items-center gap-3 py-3">
              <Skeleton className="size-8 shrink-0 rounded-full" />
              <Skeleton className="h-4 w-52 max-w-full" />
            </div>
          ))}
        </div>
      </SkeletonCard>
    </SkeletonScreen>
  )
}

export function MarketCommentsSkeleton() {
  return (
    <SkeletonScreen name="market-comments" announce={false}>
      <SkeletonCard className="gap-3">
        <Skeleton className="h-6 w-28" />
        <div className="flex flex-col divide-y divide-line">
          {Array.from({ length: 2 }, (_, i) => (
            <div key={i} className="flex items-start gap-3 py-3">
              <Skeleton className="size-8 shrink-0 rounded-full" />
              <div className="flex grow flex-col gap-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-64 max-w-full" />
              </div>
            </div>
          ))}
        </div>
        <SkeletonField />
      </SkeletonCard>
    </SkeletonScreen>
  )
}
