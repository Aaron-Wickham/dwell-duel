import Link from 'next/link'
import type { LucideIcon } from 'lucide-react'
import type { Segment } from '@/lib/social/describe-event'
import { focusTarget } from '@/lib/pagination/row-id'

export function FeedItem({
  icon: Icon,
  segments,
  age,
  detail,
  domId,
}: {
  icon: LucideIcon
  segments: Segment[]
  age: string
  // A quieter second line, like a resolution's reason.
  detail?: string | null
  domId?: string
}) {
  return (
    <li {...focusTarget(domId)} className="flex items-start gap-3 py-3.5">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-sunk text-ink">
        <Icon aria-hidden="true" className="size-5" />
      </span>
      <div className="flex min-w-0 grow flex-col gap-1 pt-[5px]">
        <p className="text-base">
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
      </div>
      <span className="shrink-0 pt-[7px] text-sm whitespace-nowrap text-ink2">{age}</span>
    </li>
  )
}
