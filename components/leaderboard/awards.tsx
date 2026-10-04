import Link from 'next/link'
import { Avatar } from '@/components/ui/avatar'
import { eyebrowClass, h2Class } from '@/components/ui/page'
import { formatOdds, lockedOddsToBp } from '@/lib/parlays/odds'
import type { Award, AwardKind } from '@/lib/social/leaderboard-extras'
import { signedDc } from '@/lib/social/season'

const LABEL: Record<AwardKind, string> = {
  biggest_win: 'Biggest win',
  best_parlay: 'Best parlay',
  sharpshooter: 'Sharpshooter',
  most_active: 'Most active',
}

function figure(award: Award): string {
  switch (award.kind) {
    case 'biggest_win':
      return signedDc(award.value)
    case 'best_parlay':
      return `${formatOdds(lockedOddsToBp(award.value))}×`
    case 'sharpshooter':
      return `${Math.round(award.value * 100)}%`
    case 'most_active':
      return String(award.value)
  }
}

// What the award is for, under the winner's name.
function caption(award: Award): string | null {
  switch (award.kind) {
    case 'biggest_win':
      return award.detail
    case 'sharpshooter':
      return award.detail
    case 'most_active':
      return 'bets and parlays'
    case 'best_parlay':
      return null
  }
}

export function Awards({ awards }: { awards: Award[] }) {
  if (awards.length === 0) return null
  return (
    <section aria-labelledby="leaderboard-awards" className="flex flex-col gap-3">
      <h2 id="leaderboard-awards" className={h2Class}>
        This month’s awards
      </h2>
      <ul className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-2">
        {awards.map((award) => (
          <li key={award.kind} className="pressable hover-lift relative flex min-w-0 flex-col gap-1.5 rounded-card border border-line bg-surface p-3.5 shadow-card">
            <span className={eyebrowClass}>{LABEL[award.kind]}</span>
            <span className="text-xl leading-none font-extrabold tabular-nums text-acc-text">{figure(award)}</span>
            <span className="flex min-w-0 items-center gap-2">
              <Avatar name={award.name} src={award.avatarSrc} size="sm" />
              <Link href={`/members/${award.memberId}`} transitionTypes={['nav-forward']} className="stretched-link min-w-0 truncate font-bold text-ink">
                {award.name}
              </Link>
            </span>
            {caption(award) && <span className="line-clamp-2 text-sm break-words text-ink2">{caption(award)}</span>}
          </li>
        ))}
      </ul>
    </section>
  )
}
