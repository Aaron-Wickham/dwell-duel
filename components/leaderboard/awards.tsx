import { IntentLink } from '@/components/ui/intent-link'
import { Avatar } from '@/components/ui/avatar'
import { h2Class } from '@/components/ui/page'
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

// A divided list of sentences, not a tile grid (#396): each row names the award, its winner and
// the figure, in ink, since most of these figures aren't gains.
export function Awards({ awards }: { awards: Award[] }) {
  if (awards.length === 0) return null
  return (
    <section aria-labelledby="leaderboard-awards" className="flex flex-col gap-3">
      <h2 id="leaderboard-awards" className={h2Class}>
        This month’s awards
      </h2>
      <ul className="flex flex-col divide-y divide-line">
        {awards.map((award) => (
          <li key={award.kind} className="pressable hover-tint relative flex min-h-11 items-center gap-3 py-2.5">
            <Avatar name={award.name} src={award.avatarSrc} size="sm" />
            <span className="flex min-w-0 grow flex-col">
              <span className="text-sm text-ink2">{LABEL[award.kind]}</span>
              <IntentLink href={`/members/${award.memberId}`} transitionTypes={['nav-forward']} className="stretched-link min-w-0 truncate font-bold text-ink no-underline">
                {award.name}
              </IntentLink>
              {caption(award) && <span className="truncate text-sm text-ink2">{caption(award)}</span>}
            </span>
            <span className="shrink-0 font-extrabold whitespace-nowrap text-ink">{figure(award)}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
