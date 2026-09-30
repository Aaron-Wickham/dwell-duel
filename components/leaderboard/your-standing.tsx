import type { ReactNode } from 'react'
import { SectionCard } from '@/components/ui/section-card'
import { eyebrowClass, rowTitleClass } from '@/components/ui/page'
import type { YourStanding } from '@/lib/social/leaderboard'
import type { MemberRecord } from '@/lib/social/leaderboard-extras'

function ordinal(n: number): string {
  const teen = n % 100 >= 11 && n % 100 <= 13
  const suffix = teen ? 'th' : (({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th')
  return `${n}${suffix}`
}

function gapLine({ rank, tiedWith, above }: YourStanding): string {
  if (rank === 1) return tiedWith > 0 ? 'Tied for the top.' : 'You’re top of the board.'
  const behind = above ? `${above.gap} DC behind ${above.name}.` : ''
  return tiedWith > 0 ? `Tied ${ordinal(rank)}. ${behind}`.trim() : behind
}

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <dt className={eyebrowClass}>{label}</dt>
      <dd className={`${rowTitleClass} tabular-nums`}>{children}</dd>
    </div>
  )
}

// The net-worth board's side card at lg. A phone doesn't get it: the list already marks "(you)",
// and a card stacked under a long list would sit below the fold.
export function YourStandingCard({ standing, record, className }: { standing: YourStanding | null; record?: MemberRecord; className?: string }) {
  const settled = record !== undefined && record.won + record.lost > 0
  return (
    <SectionCard title="Your standing" titleId="leaderboard-standing" className={className}>
      {standing ? (
        <>
          <dl className="grid grid-cols-3 gap-3">
            <Stat label="Rank">
              {ordinal(standing.rank)} <span className="font-semibold text-ink2">of {standing.memberCount}</span>
            </Stat>
            <Stat label="Net worth">{standing.score} DC</Stat>
            <Stat label="Record">{settled ? `${record.won}-${record.lost}` : '–'}</Stat>
          </dl>
          <p className="text-sm text-ink2">
            {gapLine(standing)}
            {!settled && ' No settled bets yet.'}
          </p>
        </>
      ) : (
        <p className="text-sm text-ink2">You’re not ranked yet. Your place shows up once you’re on the board.</p>
      )}
    </SectionCard>
  )
}
