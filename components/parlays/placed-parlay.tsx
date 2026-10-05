import { IntentLink } from '@/components/ui/intent-link'
import { ListCard } from '@/components/ui/list-card'
import { LocalTime } from '@/components/ui/local-time'
import type { ParlayView } from '@/lib/parlays/list-parlays'
import { focusTarget } from '@/lib/pagination/row-id'
import { cn } from '@/lib/utils'
import { LegResult } from './parlay-parts'
import { rowTitleClass, uiTextClass } from '@/components/ui/page'
import { formatDcAmount } from '@/lib/format/dc'

// A card shows this many picks; the rest are one tap away on the parlay's page.
const PREVIEW_LEGS = 3

// The card's one line under its title: the stake, then what it pays or what it did.
function ParlayLine({ parlay }: { parlay: ParlayView }) {
  const stake = formatDcAmount(parlay.stake)
  switch (parlay.status) {
    case 'pending':
      return (
        <>
          {stake} · pays{' '}
          <span className="font-extrabold text-win">
            {parlay.estimated ? '~' : ''}
            {formatDcAmount(parlay.potentialPayout)}
          </span>{' '}
          if all win
        </>
      )
    case 'won':
      return (
        <>
          {stake} · won <span className="font-extrabold text-win">{formatDcAmount(parlay.credited)}</span>
        </>
      )
    case 'lost':
      return (
        <>
          {stake} · <span className="font-extrabold text-loss">lost</span>
        </>
      )
    case 'refunded':
      return <>{stake} · refunded</>
  }
}

// A parlay in My bets' list: one card, tappable as a whole (the title link stretches over it),
// leading to its breakdown. Its picks are plain lines here, a word for each one's result, so no
// link sits inside another (#393).
export function PlacedParlay({ parlay, domId }: { parlay: ParlayView; domId?: string }) {
  const titleId = domId ? `${domId}-title` : undefined
  const shown = parlay.legs.slice(0, PREVIEW_LEGS)
  const hidden = parlay.legs.length - shown.length

  return (
    <ListCard {...focusTarget(domId, titleId)} className="flex flex-col gap-2 lg:col-span-full">
      <div className="flex items-start justify-between gap-3">
        <IntentLink
          id={titleId}
          href={`/parlays/${parlay.id}`}
          transitionTypes={['nav-forward']}
          className={cn(rowTitleClass, 'stretched-link text-ink')}
        >
          Parlay · {parlay.legs.length} picks
        </IntentLink>
        <span className="shrink-0 text-sm whitespace-nowrap text-ink2">
          <span className="sr-only">Placed </span>
          <LocalTime iso={parlay.createdAt} format="day" />
        </span>
      </div>
      <p className="text-sm">
        <ParlayLine parlay={parlay} />
      </p>

      <ul className="flex flex-col border-t border-line pt-1.5">
        {shown.map((leg) => (
          <li key={leg.marketId} className={cn('flex items-center justify-between gap-3 py-2', uiTextClass)}>
            <span className="min-w-0 break-words">
              {leg.marketTitle} · <strong>{leg.outcomeLabel}</strong>
            </span>
            <LegResult status={leg.status} />
          </li>
        ))}
      </ul>
      {hidden > 0 && (
        <p className="text-sm text-ink2">
          +{hidden} more {hidden === 1 ? 'pick' : 'picks'}
        </p>
      )}
    </ListCard>
  )
}
