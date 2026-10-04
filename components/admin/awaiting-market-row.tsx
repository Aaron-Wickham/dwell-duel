import Link from 'next/link'
import type { AwaitingMarket } from '@/lib/admin/markets-awaiting'
import { relativeTime } from '@/lib/social/relative-time'
import { LocalTime } from '@/components/ui/local-time'
import { buttonVariants } from '@/components/ui/button'
import { ListCard } from '@/components/ui/list-card'
import { rowTitleClass } from '@/components/ui/page'
import { focusTarget } from '@/lib/pagination/row-id'
import { cn } from '@/lib/utils'

// A card the title opens (its link stretches over it); the creator's name and Resolve sit above
// the cover, so each still goes where it says.
export function AwaitingMarketRow({ market, now, domId }: { market: AwaitingMarket; now: number; domId?: string }) {
  const titleId = domId ? `${domId}-title` : undefined
  return (
    <ListCard {...focusTarget(domId, titleId)} className="flex flex-col gap-3">
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
          Closed <LocalTime iso={market.closeAt} format="dateTime" /> · {relativeTime(market.closeAt, now)} ·{' '}
          <span className="tabular-nums">{market.pooled} DC</span> in the pool · by{' '}
          <span className="relative z-[1]">
            <Link href={`/members/${market.creatorId}`} transitionTypes={['nav-forward']}>
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
          className={buttonVariants({ size: 'sm' })}
        >
          Resolve
        </Link>
      </div>
    </ListCard>
  )
}
