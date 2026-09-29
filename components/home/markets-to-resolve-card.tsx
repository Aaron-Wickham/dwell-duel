import Link from 'next/link'
import { SectionCard } from '@/components/ui/section-card'
import { LocalTime } from '@/components/ui/local-time'
import type { MarketsToResolve } from '@/lib/markets/markets-to-resolve'

// Bettors' DC and parlays wait on a closed market until someone resolves it, so Home lists the
// ones waiting on this member. Nothing waiting, no card.
export function MarketsToResolveCard({ total, markets }: MarketsToResolve) {
  if (total === 0) return null
  const more = total - markets.length
  return (
    <SectionCard title={`Markets to resolve (${total})`} titleId="markets-to-resolve-title">
      <ul className="flex flex-col divide-y divide-line">
        {markets.map((market) => (
          <li key={market.id} className="flex flex-col gap-0.5 py-2.5 first:pt-0 last:pb-0">
            <Link
              href={`/markets/${market.id}`}
              transitionTypes={['nav-forward']}
              className="hit-area break-words font-extrabold"
            >
              {market.title}
            </Link>
            <span className="text-sm text-ink2">
              Closed <LocalTime iso={market.closeAt} format="dateTime" />
            </span>
          </li>
        ))}
      </ul>
      {more > 0 && (
        <p className="text-sm text-ink2">
          And {more} more under <Link href="/markets">Awaiting resolution</Link>.
        </p>
      )}
    </SectionCard>
  )
}
