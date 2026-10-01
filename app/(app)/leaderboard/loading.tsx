import { pageClass } from "@/components/ui/page";
import {
  Skeleton,
  SkeletonCard,
  SkeletonPageHeader,
  SkeletonScreen,
} from "@/components/ui/skeleton";

// The podium's blocks by place (components/leaderboard/podium.tsx), drawn in DOM order.
const PODIUM = [
  { avatar: "size-16 md:size-20", block: "h-[72px]", order: "order-2" },
  { avatar: "size-10", block: "h-[48px]", order: "order-1" },
  { avatar: "size-10", block: "h-[34px]", order: "order-3" },
];

// Mirrors the leaderboard: header with its description, the board tabs, the podium, then the
// rankings card, which at lg has a side card beside it (your standing on Net worth, the race on
// This month).
export default function Loading() {
  return (
    <SkeletonScreen name="leaderboard" className={pageClass}>
      <SkeletonPageHeader description />
      <Skeleton className="h-[52px] w-full rounded-[14px] md:w-72" />
      <SkeletonCard className="flex-row items-center gap-3 p-4 lg:hidden">
        <Skeleton className="size-10 shrink-0" />
        <div className="flex grow flex-col gap-1.5">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-4 w-40" />
        </div>
        <Skeleton className="h-11 w-28 shrink-0 rounded-full" />
      </SkeletonCard>
      <SkeletonCard className="p-4 md:p-6">
        <div className="flex items-end justify-center gap-3 md:gap-6">
          {PODIUM.map((place, i) => (
            <div
              key={i}
              className={`flex min-w-0 flex-1 flex-col items-center gap-1 ${place.order}`}
            >
              <Skeleton className={`shrink-0 rounded-full ${place.avatar}`} />
              <Skeleton className="h-[18px] w-20 max-w-full" />
              <Skeleton className="h-4 w-14" />
              <Skeleton
                className={`mt-1 w-full rounded-t-[10px] rounded-b-none ${place.block}`}
              />
            </div>
          ))}
        </div>
      </SkeletonCard>
      <div className="flex flex-col gap-5 md:gap-7 lg:grid lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-start">
        <SkeletonCard className="gap-0 px-2 py-1.5 md:px-3 md:py-1.5">
          {Array.from({ length: 6 }, (_, i) => (
            <div
              key={i}
              className="flex min-h-[60px] items-center gap-3 px-2.5 py-2.5 md:px-3.5"
            >
              <Skeleton className="size-10 shrink-0" />
              <Skeleton className="size-10 shrink-0 rounded-full" />
              <div className="grow">
                <Skeleton className="h-5 w-32" />
              </div>
              <Skeleton className="h-5 w-16 shrink-0" />
            </div>
          ))}
        </SkeletonCard>
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
    </SkeletonScreen>
  );
}
