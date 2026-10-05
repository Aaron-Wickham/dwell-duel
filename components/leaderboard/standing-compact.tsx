import type { ReactNode } from 'react'
import { gapLine } from '@/components/leaderboard/your-standing'
import { RankNumber, scoreText, stickyMineClass } from '@/components/leaderboard/leaderboard-row'
import type { YourStanding } from '@/lib/social/leaderboard'
import { cn } from '@/lib/utils'
import { rankText } from '@/lib/format/rank'
import { rowTitleClass } from '@/components/ui/page'

// The phone's stand-in for your own row while it's further down the board than the page shows: it
// sits after the rankings and sticks to the bottom of the viewport (#396), with "Jump to me" to
// open the board at your place. At lg, Your standing in the side column does this job.
export function StandingCompact({ standing, jump }: { standing: YourStanding; jump: ReactNode }) {
  const gap = gapLine(standing)
  return (
    <section aria-labelledby="leaderboard-standing-compact" className={cn(stickyMineClass, 'flex min-h-14 items-center gap-3 py-2 lg:hidden')}>
      <h2 id="leaderboard-standing-compact" className="sr-only">
        Your rank
      </h2>
      <RankNumber rank={standing.rank} label={rankText(standing.rank, standing.memberCount)} />
      <div className="flex min-w-0 grow flex-col">
        <span className={rowTitleClass}>You</span>
        {gap && <span className="truncate text-sm text-ink2">{gap}</span>}
      </div>
      <span className="shrink-0 font-extrabold whitespace-nowrap tabular-nums">
        {scoreText(standing.score, false)}
        <span className="sr-only"> DC</span>
      </span>
      {jump}
    </section>
  )
}
