import { IntentLink } from '@/components/ui/intent-link'
import { h2Class } from '@/components/ui/page'
import { seasonName, signedDc } from '@/lib/social/season'
import type { PastChampion } from '@/lib/social/leaderboard-extras'
import { cn } from '@/lib/utils'

// Divided rows under a heading, as the awards above it are: the month, its champion and the
// profit, in ink, since a figure isn't a status.
export function PastChampions({ champions, className }: { champions: PastChampion[]; className?: string }) {
  if (champions.length === 0) return null
  return (
    <section aria-labelledby="leaderboard-champions" className={cn('flex flex-col gap-3', className)}>
      <h2 id="leaderboard-champions" className={h2Class}>
        Past champions
      </h2>
      <ul className="flex flex-col divide-y divide-line">
        {champions.map((champion) => (
          <li key={champion.season} className="pressable hover-tint relative flex min-h-11 items-center gap-3 py-2.5">
            <span className="flex min-w-0 grow flex-col">
              <span className="text-sm text-ink2">{seasonName(champion.season)}</span>
              <IntentLink
                href={`/members/${champion.memberId}`}
                transitionTypes={['nav-forward']}
                className="stretched-link min-w-0 truncate font-bold text-ink no-underline"
              >
                {champion.name}
              </IntentLink>
            </span>
            <span className="shrink-0 font-extrabold whitespace-nowrap text-ink">{signedDc(champion.profit)}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
