import { cardClass } from '@/components/ui/card'
import { Skeleton, SkeletonField, SkeletonScreen } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

const ROW_WIDTHS = ['w-4/5', 'w-3/5', 'w-2/3', 'w-3/4']

// Below the Admin header and section tabs: one card, headed, with the member and kind filters
// (side by side from md, #418), listing every coin movement.
export default function Loading() {
  return (
    <SkeletonScreen name="admin-ledger" className={cn(cardClass, 'px-[18px] py-1 md:px-6')}>
      <Skeleton className="mt-[18px] mb-1 h-6 w-48 md:mt-6" />
      <div className="flex flex-col gap-3 border-b border-line pt-2 pb-3.5 md:flex-row md:items-end">
        <SkeletonField className="md:grow" />
        <SkeletonField className="md:grow" />
        <Skeleton className="h-12 w-full md:w-24" />
      </div>
      <div className="flex flex-col divide-y divide-line">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="flex items-start gap-3 py-3.5">
            <div className="grow">
              <Skeleton className={cn('h-4', ROW_WIDTHS[i % ROW_WIDTHS.length])} />
            </div>
            <Skeleton className="mt-0.5 h-4 w-20 shrink-0" />
          </div>
        ))}
      </div>
    </SkeletonScreen>
  )
}
