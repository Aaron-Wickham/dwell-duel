'use client'

import dynamic from 'next/dynamic'
import { SectionCard } from '@/components/ui/section-card'
import { Skeleton } from '@/components/ui/skeleton'
import { RACE_SKELETON_BODY } from './race-size'

// The race is the only Recharts plot on the leaderboard, so it arrives in its own chunk once the
// board has shown (#210), behind a card of its own size. A client module, because `ssr: false` is
// only allowed in one.
export const RaceChart = dynamic(() => import('./race-chart').then((m) => m.RaceChart), {
  ssr: false,
  loading: () => (
    <SectionCard
      title="The race"
      titleId="leaderboard-race"
      description={
        <>
          Net profit for this month’s leaders.
          <span className="flex h-5 items-center">
            <Skeleton className="h-3.5 w-3/4" />
          </span>
        </>
      }
    >
      <Skeleton className={RACE_SKELETON_BODY} />
    </SectionCard>
  ),
})
