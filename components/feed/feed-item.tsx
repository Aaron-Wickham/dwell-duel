import type { ReactNode } from 'react'
import { IntentLink } from '@/components/ui/intent-link'
import type { Segment } from '@/lib/social/describe-event'
import { focusTarget } from '@/lib/pagination/row-id'

export function FeedItem({
  segments,
  age,
  detail,
  note,
  reactions,
  domId,
}: {
  segments: Segment[]
  // "5m ago" while it's recent, a date once it isn't (isOldEntry).
  age: ReactNode
  // A quieter second line, like a resolution's reason.
  detail?: string | null
  // A plain fact under it, like what a market's creator had riding on it.
  note?: string | null
  // The item's reactions (ReactionBar).
  reactions?: ReactNode
  domId?: string
}) {
  // With reaction buttons in the row, naming it from its whole content would read out every
  // button's label too, so a row that takes focus is named by its sentence alone.
  const labelId = domId && reactions ? `${domId}-label` : undefined
  return (
    // No icon tile before the sentence (#387): it only named the kind the sentence already says.
    // The reactions sit in the sentence's column, under it, now that only the used ones show (#395).
    <li {...focusTarget(domId, labelId)} className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 py-3.5">
      <div className="flex min-w-0 grow flex-col gap-1">
        <p id={labelId} className="text-base break-words">
          {segments.map((segment, i) =>
            typeof segment === 'string' ? (
              <span key={i}>{segment}</span>
            ) : (
              // The names are the row's only tap targets (#187), so each reaches 44px tall without
              // growing the row (A11Y-06).
              <IntentLink key={i} href={segment.href} transitionTypes={['nav-forward']} className="hit-area">
                {segment.text}
              </IntentLink>
            ),
          )}
        </p>
        {detail && <p className="line-clamp-2 text-sm break-words text-ink2">“{detail}”</p>}
        {note && <p className="text-sm font-bold text-ink2">{note}</p>}
        {reactions && <div className="pt-1">{reactions}</div>}
      </div>
      <span className="shrink-0 pt-0.5 text-sm whitespace-nowrap text-ink2">{age}</span>
    </li>
  )
}
