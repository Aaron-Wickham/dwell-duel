import Link from 'next/link'
import { Trophy } from 'lucide-react'
import { SectionCard } from '@/components/ui/section-card'
import { StatusChip } from '@/components/ui/status-chip'
import { seasonName, signedDc } from '@/lib/social/season'
import type { PastChampion } from '@/lib/social/leaderboard-extras'

export function PastChampions({ champions }: { champions: PastChampion[] }) {
  if (champions.length === 0) return null
  return (
    <SectionCard title="Past champions" titleId="leaderboard-champions" className="max-w-[820px]">
      <ul className="flex flex-col divide-y divide-line">
        {champions.map((champion) => (
          <li key={champion.season} className="pressable hover-lift-row relative flex min-h-11 items-center gap-3 py-2 first:pt-0 last:pb-0">
            <Trophy aria-hidden="true" className="size-5 shrink-0 text-gold" />
            <span className="grow">{seasonName(champion.season)}</span>
            <Link href={`/members/${champion.memberId}`} transitionTypes={['nav-forward']} className="stretched-link font-extrabold">
              {champion.name}
            </Link>
            <StatusChip tone="open">{signedDc(champion.profit)}</StatusChip>
          </li>
        ))}
      </ul>
    </SectionCard>
  )
}
