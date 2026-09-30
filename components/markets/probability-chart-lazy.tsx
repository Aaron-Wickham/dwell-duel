'use client'

import dynamic from 'next/dynamic'
import { Skeleton } from '@/components/ui/skeleton'

// Recharts is the heaviest script on the market page, so the plot arrives in its own chunk once the
// page has shown (#210), behind the plot area of MarketChartSkeleton. A client module, because
// `ssr: false` is only allowed in one.
export const ProbabilityChart = dynamic(() => import('./probability-chart').then((m) => m.ProbabilityChart), {
  ssr: false,
  loading: () => <Skeleton className="h-[220px] md:h-[300px]" />,
})
