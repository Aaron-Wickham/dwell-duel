import Link from 'next/link'
import type { AwaitingMarket } from '@/lib/admin/markets-awaiting'
import { relativeTime } from '@/lib/social/relative-time'
import { LocalTime } from '@/components/ui/local-time'
import { buttonVariants } from '@/components/ui/button'
import { rowTitleClass } from '@/components/ui/page'
import { focusTarget } from '@/lib/pagination/row-id'
import { cn } from '@/lib/utils'

// The row names two destinations (the market and its creator), so it's a sentence of links with a
// Resolve button, not a card that opens as a whole.
export function AwaitingMarketRow({ market, now, domId }: { market: AwaitingMarket; now: number; domId?: string }) {
  return (
    <li {...focusTarget(domId)} className="flex flex-col gap-3 py-3.5 first:pt-0 last:pb-0 md:flex-row md:items-center md:gap-4">
      <div className="flex min-w-0 grow flex-col gap-0.5">
        <Link href={`/markets/${market.id}`} transitionTypes={['nav-forward']} className={cn(rowTitleClass, 'hit-area break-words')}>
          {market.title}
        </Link>
        <p className="text-sm text-ink2">
          Closed <LocalTime iso={market.closeAt} format="dateTime" /> · {relativeTime(market.closeAt, now)} ·{' '}
          <span className="tabular-nums">{market.pooled} DC</span> in the pool · by{' '}
          <Link href={`/members/${market.creatorId}`} transitionTypes={['nav-forward']}>
            {market.creatorName}
          </Link>
        </p>
      </div>
      <Link
        href={`/markets/${market.id}#manage-title`}
        transitionTypes={['nav-forward']}
        aria-label={`Resolve ${market.title}`}
        className={cn(buttonVariants({ size: 'sm' }), 'shrink-0 self-start md:self-center')}
      >
        Resolve
      </Link>
    </li>
  )
}
