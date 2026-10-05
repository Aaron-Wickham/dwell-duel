import { pageClassFor } from '@/components/ui/page'
import { Skeleton, SkeletonCard, SkeletonPageHeader, SkeletonScreen } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

// Text drawn a line at a time, each bar centred in a box one line tall, so a block is as tall as
// the copy it stands for: `phone` lines below md and `desk` from md (they wrap differently). Small
// text is 20px a line, body text 24px.
function Lines({ phone, desk, body = false, last = 'w-3/5' }: { phone: number; desk: number; body?: boolean; last?: string }) {
  const count = Math.max(phone, desk)
  return (
    <div className="flex flex-col">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className={cn('flex items-center', body ? 'h-6' : 'h-5', i >= phone && 'max-md:hidden', i >= desk && 'md:hidden')}>
          <Skeleton className={cn(body ? 'h-4' : 'h-3.5', i === count - 1 ? last : 'w-full')} />
        </div>
      ))}
    </div>
  )
}

// A checkbox row: the 44px label line, then its hint under it, indented past the box.
function SkeletonToggle({ phone, desk }: { phone: number; desk: number }) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex min-h-11 items-center gap-2.5">
        <Skeleton className="size-[22px] rounded-segment" />
        <Skeleton className="h-5 w-36" />
      </div>
      {/* The indent is the wrapper's padding, so a full-width hint stays inside the card (ST-6). */}
      <div className="pl-8">
        <Lines phone={phone} desk={desk} />
      </div>
    </div>
  )
}

// A section card's heading, with its description under it when it has one.
function SkeletonHeading({ width, description }: { width: string; description?: { phone: number; desk: number } }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex h-6 items-center md:h-[26px]">
        <Skeleton className={`h-5 ${width}`} />
      </div>
      {description && <Lines phone={description.phone} desk={description.desk} last="w-48 max-w-full" />}
    </div>
  )
}

// A legend over its group, with the legend's own margin and no gap after it, as a <fieldset> lays
// one out.
function SkeletonLegend({ width }: { width: string }) {
  return (
    <div className="mb-1.5 flex h-[23px] items-center">
      <Skeleton className={`h-4 ${width}`} />
    </div>
  )
}

// Mirrors Settings: back link, header, and its one column of cards, each drawn line for line at
// its real height at 375 and 1280 (#398): Appearance & motion's theme control and two toggles;
// Notifications' device status with its Turn on button, the four kinds a member gets with their
// hints, the line under them and Save; Help; Account.
export default function Loading() {
  return (
    <SkeletonScreen name="settings" className={pageClassFor('reading')}>
      <div className="flex min-h-11 items-center">
        <Skeleton className="h-5 w-28" />
      </div>
      <SkeletonPageHeader />
      <SkeletonCard className="gap-3">
        <SkeletonHeading width="w-52" description={{ phone: 1, desk: 1 }} />
        <div className="flex flex-col gap-5">
          <div className="flex flex-col">
            <SkeletonLegend width="w-14" />
            <div className="flex flex-col gap-1.5">
              <Skeleton className="h-[52px] w-full rounded-tile" />
              <Lines phone={1} desk={1} last="w-64 max-w-full" />
            </div>
          </div>
          <div className="flex flex-col gap-3">
            <SkeletonToggle phone={3} desk={1} />
            <SkeletonToggle phone={2} desk={1} />
          </div>
        </div>
      </SkeletonCard>
      <SkeletonCard className="gap-3">
        <SkeletonHeading width="w-36" description={{ phone: 2, desk: 1 }} />
        <div className="flex flex-col gap-5">
          <div className="flex flex-col items-start gap-3">
            <div className="flex h-6 w-64 max-w-full items-center">
              <Skeleton className="h-4 w-full" />
            </div>
            <Skeleton className="h-11 w-52" />
          </div>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col">
              <SkeletonLegend width="w-32" />
              <div className="flex flex-col gap-3">
                <SkeletonToggle phone={3} desk={2} />
                <SkeletonToggle phone={2} desk={1} />
                <SkeletonToggle phone={1} desk={1} />
                <SkeletonToggle phone={1} desk={1} />
              </div>
            </div>
            <Lines phone={2} desk={1} last="w-2/3" />
            <Skeleton className="h-11 w-32" />
          </div>
        </div>
      </SkeletonCard>
      <SkeletonCard className="gap-3">
        <SkeletonHeading width="w-16" />
        <Lines phone={3} desk={1} body last="w-2/5" />
        <div className="flex gap-2">
          <Skeleton className="h-11 w-36" />
          <Skeleton className="h-11 w-28" />
        </div>
      </SkeletonCard>
      <SkeletonCard className="gap-3">
        <SkeletonHeading width="w-24" description={{ phone: 2, desk: 1 }} />
        <div className="flex items-center gap-4">
          <Skeleton className="size-10 rounded-full" />
          <Skeleton className="h-5 w-32 grow" />
          <Skeleton className="h-11 w-36" />
        </div>
        <Skeleton className="h-12 w-full md:w-40" />
      </SkeletonCard>
    </SkeletonScreen>
  )
}
