import type { ReactNode } from 'react'
import { SectionCard } from '@/components/ui/section-card'
import { eyebrowClass, rowTitleClass } from '@/components/ui/page'
import type { YourStanding } from '@/lib/social/leaderboard'
import type { MemberRecord } from '@/lib/social/leaderboard-extras'
import { formatDcAmount } from '@/lib/format/dc'

function ordinal(n: number): string {
  const teen = n % 100 >= 11 && n % 100 <= 13
  const suffix = teen ? 'th' : (({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th')
  return `${n}${suffix}`
}

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

// The net-worth board's side card at lg, under the podium, with "Jump to me" when your row is further
// down than the page shows. A phone has the sticky bar (StandingCompact) instead.
export function YourStandingCard({
  standing,
  record,
  jump,
  className,
}: {
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
            <Stat label="Net worth">{formatDcAmount(standing.score)}</Stat>
            <Stat label="Record">{settled ? `${record.won}-${record.lost}` : '–'}</Stat>
          </dl>
          <p className="text-sm text-ink2">
            {gapLine(standing)}
            {!settled && ' No settled bets yet.'}
          </p>
          {jump && <div className="flex">{jump}</div>}
        </>
      ) : (
        <p className="text-sm text-ink2">You’re not ranked yet. Your place shows up once you’re on the board.</p>
      )}
    </SectionCard>
  )
}
