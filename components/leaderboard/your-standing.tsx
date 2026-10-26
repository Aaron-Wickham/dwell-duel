import type { ReactNode } from 'react'
import { SectionCard } from '@/components/ui/section-card'
import { eyebrowClass, rowTitleClass } from '@/components/ui/page'
import type { Board, YourStanding } from '@/lib/social/leaderboard'
import type { MemberRecord } from '@/lib/social/leaderboard-extras'
import { formatDcAmount, formatSignedDcAmount } from '@/lib/format/dc'
import { ordinal } from '@/lib/format/rank'

export function gapLine({ rank, tiedWith, above }: YourStanding): string {
  if (rank === 1) return tiedWith > 0 ? 'Tied for the top.' : 'You’re top of the board.'
  const behind = above ? `${formatDcAmount(above.gap)} behind ${above.name}.` : ''
  return tiedWith > 0 ? `Tied ${ordinal(rank)}. ${behind}`.trim() : behind
}

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <dt className={eyebrowClass}>{label}</dt>
      <dd className={`${rowTitleClass}`}>{children}</dd>
    </div>
  )
}

// Each board's side card at lg (under the podium on Net worth, above the awards on This month), with
// "Jump to me" when your row is further down than the page shows. A phone has the sticky bar
// (StandingCompact) instead.
export function YourStandingCard({
  board = 'all',
  standing,
  record,
  jump,
  className,
}: {
  board?: Board
  standing: YourStanding | null
  record?: MemberRecord
  jump?: ReactNode
  className?: string
}) {
  const settled = record !== undefined && record.won + record.lost > 0
  return (
    <SectionCard title="Your standing" titleId="leaderboard-standing" className={className}>
      {standing ? (
        <>
          <dl className="grid grid-cols-3 gap-3">
            <Stat label="Rank">
              {ordinal(standing.rank)} <span className="font-bold text-ink2">of {standing.memberCount}</span>
            </Stat>
            {board === 'all' ? (
              <Stat label="Net worth">{formatDcAmount(standing.score)}</Stat>
            ) : (
              <Stat label="Profit">{formatSignedDcAmount(standing.score)}</Stat>
            )}
            <Stat label="Record">{settled ? `${record.won}-${record.lost}` : 'None yet'}</Stat>
          </dl>
          {gapLine(standing) && <p className="text-sm text-ink2">{gapLine(standing)}</p>}
          {jump && <div className="flex">{jump}</div>}
        </>
      ) : (
        <p className="text-sm text-ink2">
          {board === 'all'
            ? 'You’re not ranked yet. Your place shows up once you’re on the board.'
            : 'You’re not on this month’s board yet. Place a bet to join it.'}
        </p>
      )}
    </SectionCard>
  )
}
