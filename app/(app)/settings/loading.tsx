import { pageClass } from '@/components/ui/page'
import { Skeleton, SkeletonCard, SkeletonPageHeader, SkeletonScreen } from '@/components/ui/skeleton'

// A switch-like row: the 44px label line, then its hint under it.
function SkeletonToggle({ hintWidth }: { hintWidth: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex min-h-11 items-center gap-2.5">
        <Skeleton className="size-[22px] rounded-[4px]" />
        <Skeleton className="h-5 w-36" />
      </div>
      <Skeleton className={`ml-8 h-5 ${hintWidth}`} />
    </div>
  )
}

// Mirrors Settings: back link, header, and the six section cards, in two columns at lg. Each card
// draws the same rows as its loaded state: Appearance's legend, segmented control and hint;
// Notifications' device status, four notification kinds with their hints, and the save button.
export default function Loading() {
  return (
    <SkeletonScreen name="settings" className={pageClass}>
      <div className="flex min-h-11 items-center">
        <Skeleton className="h-5 w-28" />
      </div>
      <SkeletonPageHeader description />
      <div className="flex flex-col gap-5 md:gap-7 lg:grid lg:grid-cols-2 lg:items-start">
        <div className="flex flex-col gap-5 md:gap-7">
          <SkeletonCard className="gap-3">
            <Skeleton className="h-6 w-32" />
            <div className="flex flex-col gap-1.5">
              <Skeleton className="mb-1.5 h-5 w-16" />
              <Skeleton className="h-[52px] w-full rounded-[14px]" />
              <Skeleton className="h-5 w-64 max-w-full" />
            </div>
          </SkeletonCard>
          <SkeletonCard className="gap-3">
            <Skeleton className="h-6 w-20" />
            <div className="flex items-center gap-4">
              <Skeleton className="size-10 rounded-full" />
              <Skeleton className="h-5 w-32 grow" />
              <Skeleton className="h-11 w-36" />
            </div>
          </SkeletonCard>
          <SkeletonCard className="gap-3">
            <Skeleton className="h-6 w-40" />
            <div className="flex flex-col gap-3">
              <SkeletonToggle hintWidth="w-full max-w-[420px]" />
              <SkeletonToggle hintWidth="w-72 max-w-full" />
            </div>
          </SkeletonCard>
        </div>
        <div className="flex flex-col gap-5 md:gap-7">
          <SkeletonCard className="gap-3">
            <Skeleton className="h-6 w-36" />
            <div className="flex flex-col gap-5">
              <div className="flex flex-col gap-3">
                <Skeleton className="h-5 w-64 max-w-full" />
                <Skeleton className="h-11 w-52" />
              </div>
              <div className="flex flex-col gap-3">
                <Skeleton className="mb-1.5 h-5 w-32" />
                {Array.from({ length: 4 }, (_, i) => (
                  <SkeletonToggle key={i} hintWidth={i % 2 === 0 ? 'w-full max-w-[420px]' : 'w-64 max-w-full'} />
                ))}
                <Skeleton className="h-5 w-80 max-w-full" />
                <Skeleton className="h-11 w-32" />
              </div>
            </div>
          </SkeletonCard>
          <SkeletonCard className="gap-3">
            <Skeleton className="h-6 w-16" />
            <Skeleton className="h-5 w-72 max-w-full" />
            <Skeleton className="h-11 w-40" />
          </SkeletonCard>
          <SkeletonCard className="gap-3">
            <Skeleton className="h-6 w-24" />
            <Skeleton className="h-12 w-full md:w-40" />
          </SkeletonCard>
        </div>
      </div>
    </SkeletonScreen>
  )
}
