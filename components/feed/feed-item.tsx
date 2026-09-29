import type { ReactNode } from 'react'
import Link from 'next/link'
import type { LucideIcon } from 'lucide-react'
import type { Segment } from '@/lib/social/describe-event'
import { focusTarget } from '@/lib/pagination/row-id'

export function FeedItem({
  icon: Icon,
  segments,
  age,
  detail,
  note,
  reactions,
  domId,
}: {
  icon: LucideIcon
  segments: Segment[]
  age: string
  // A quieter second line, like a resolution's reason.
  detail?: string | null
  // A plain fact under it, like what a market's creator had riding on it.
  note?: string | null
  // The item's reaction buttons (ReactionBar).
  reactions?: ReactNode
  domId?: string
}) {
  // With reaction buttons in the row, naming it from its whole content would read out every
  // button's label too, so a row that takes focus is named by its sentence alone.
  const labelId = domId && reactions ? `${domId}-label` : undefined
  return (
    // A grid, so the reactions can run under the time as well as the sentence: in the sentence's
    // column alone, four 44px buttons wrapped onto a second row on a phone.
    <li {...focusTarget(domId, labelId)} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-3 py-3.5">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-sunk text-ink">
        <Icon aria-hidden="true" className="size-5" />
      </span>
      <div className="flex min-w-0 grow flex-col gap-1 pt-[5px]">
        <p id={labelId} className="text-base">
          {segments.map((segment, i) =>
            typeof segment === 'string' ? (
              <span key={i}>{segment}</span>
            ) : (
              <Link key={i} href={segment.href} transitionTypes={['nav-forward']}>
                {segment.text}
              </Link>
            ),
          )}
        </p>
        {detail && <p className="line-clamp-2 text-sm break-words text-ink2">“{detail}”</p>}
        {note && <p className="text-sm font-bold text-ink2">{note}</p>}
      </div>
      <span className="shrink-0 pt-[7px] text-sm whitespace-nowrap text-ink2">{age}</span>
      {reactions && <div className="col-span-2 col-start-2 pt-1">{reactions}</div>}
    </li>
  )
}
