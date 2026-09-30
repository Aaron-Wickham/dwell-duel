'use client'

import dynamic from 'next/dynamic'
import { SectionCard } from '@/components/ui/section-card'
import { Skeleton } from '@/components/ui/skeleton'

// The race is the only Recharts plot on the leaderboard, so it arrives in its own chunk once the
// board has shown (#210), behind a card of its own size. A client module, because `ssr: false` is
// only allowed in one.
export const RaceChart = dynamic(() => import('./race-chart').then((m) => m.RaceChart), {
  ssr: false,
  loading: () => (
    <SectionCard title="The race" titleId="leaderboard-race">
      <Skeleton className="h-[220px] md:h-[260px]" />
    </SectionCard>
  ),
})
