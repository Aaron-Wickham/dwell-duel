import type { ReactNode } from 'react'
import { SectionCard } from '@/components/ui/section-card'
import { rowTitleClass } from '@/components/ui/page'
import { gapLine } from '@/components/leaderboard/your-standing'
import type { YourStanding } from '@/lib/social/leaderboard'
import { formatDcAmount } from '@/lib/format/dc'

// The phone's version of YourStandingCard: one row, with "Jump to me" for a board too long to scroll
// to your own place. It sits in the page flow and is deliberately not pinned: a fixed bar would fight
// the slip pill, the tab bar and the installed app's short-viewport fix.
export function StandingCompact({ standing, jump }: { standing: YourStanding; jump: ReactNode }) {
  const gap = gapLine(standing)
  return (
    <SectionCard
      title={<span className="sr-only">Your rank</span>}
      titleId="leaderboard-standing-compact"
      className="gap-0 p-3.5 md:p-3.5 lg:hidden"
    >
      <div className="flex items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-control bg-sunk text-lg font-extrabold tabular-nums">
          <span aria-hidden="true">{standing.rank}</span>
          <span className="sr-only">Rank {standing.rank} of {standing.memberCount}</span>
        </span>
        <div className="flex min-w-0 grow flex-col">
          <span className={`${rowTitleClass} tabular-nums`}>You · {formatDcAmount(standing.score)}</span>
          {gap && <span className="text-sm text-ink2">{gap}</span>}
        </div>
        {jump}
      </div>
    </SectionCard>
  )
}
