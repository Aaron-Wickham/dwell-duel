'use client'

import dynamic from 'next/dynamic'
import { Skeleton } from '@/components/ui/skeleton'

// Recharts is the heaviest script on the market page, so the plot arrives in its own chunk once the
// page has shown (#210), behind a stand-in as tall as the whole chart: the bet count and range row,
// the plot and its ticks, so the comments under it don't jump twice (#390). A client module,
// because `ssr: false` is only allowed in one.
export const ProbabilityChart = dynamic(() => import('./probability-chart').then((m) => m.ProbabilityChart), {
  ssr: false,
  loading: () => (
    <div className="flex flex-col gap-3">
      <div className="flex h-[52px] items-center justify-between gap-3">
        <Skeleton className="h-4 w-12" />
        <Skeleton className="h-[52px] w-40 rounded-tile" />
      </div>
      <Skeleton className="h-[220px] md:h-[300px]" />
      <Skeleton className="h-5 w-full" />
    </div>
  ),
})
