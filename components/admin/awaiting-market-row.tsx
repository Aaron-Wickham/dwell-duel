import Link from 'next/link'
import type { AwaitingMarket } from '@/lib/admin/markets-awaiting'
import { relativeTime } from '@/lib/social/relative-time'
import { LocalTime } from '@/components/ui/local-time'
import { buttonVariants } from '@/components/ui/button'
import { dividedRowClass } from '@/components/ui/list-card'
import { rowTitleClass } from '@/components/ui/page'
import { focusTarget } from '@/lib/pagination/row-id'
import { cn } from '@/lib/utils'
import { formatDcAmount } from '@/lib/format/dc'

// A phrase after a · starts with a capital ("Just now"); "2h ago" starts with a number.
const sentenceStart = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

// Resolve is secondary, like the review queue's Approve: a list of ten waiting markets would
// otherwise be ten primary fills.
// A divided row in its Waiting to be resolved card (D2) that the title opens (its link stretches
// over it); the creator's name and Resolve sit above the cover, so each still goes where it says.
export function AwaitingMarketRow({ market, now, domId }: { market: AwaitingMarket; now: number; domId?: string }) {
  const titleId = domId ? `${domId}-title` : undefined
  return (
    <li {...focusTarget(domId, titleId)} className={cn(dividedRowClass, 'pressable hover-tint relative flex flex-col gap-3')}>
      <div className="flex min-w-0 flex-col gap-0.5">
        <Link
          id={titleId}
          href={`/markets/${market.id}`}
          transitionTypes={['nav-forward']}
          className={cn(rowTitleClass, 'stretched-link break-words text-ink no-underline')}
        >
          {market.title}
        </Link>
        <p className="text-sm text-ink2">
          Closed <LocalTime iso={market.closeAt} format="dateTime" /> · {sentenceStart(relativeTime(market.closeAt, now))} ·{' '}
          <span className="whitespace-nowrap">{formatDcAmount(market.pooled)}</span> staked · By{' '}
          <span className="relative z-[1]">
            <Link href={`/members/${market.creatorId}`} transitionTypes={['nav-forward']} className="prose-link">
              {market.creatorName}
            </Link>
          </span>
        </p>
      </div>
      <div className="relative z-[1] self-start">
        <Link
          href={`/markets/${market.id}#manage-title`}
          transitionTypes={['nav-forward']}
          aria-label={`Resolve ${market.title}`}
          className={buttonVariants({ variant: 'secondary', size: 'sm' })}
        >
          Resolve
        </Link>
      </div>
    </li>
  )
}
