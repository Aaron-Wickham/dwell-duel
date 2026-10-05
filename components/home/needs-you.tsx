import type { ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'
import { IntentLink } from '@/components/ui/intent-link'
import { TAB_TRANSITION } from '@/components/nav/page-transition'
import type { ReviewCounts } from '@/lib/admin/review-counts'
import type { MarketsToResolve } from '@/lib/markets/markets-to-resolve'
import { countNoun, taskRewardsDetail, type RewardRange } from '@/lib/home/copy'
import { cn } from '@/lib/utils'
import { HomeSection, homeRowsClass } from './home-section'

type Row = { key: string; href: string; drillDown: boolean; tone?: 'gold'; content: ReactNode }

function NeedsYouRow({ href, drillDown, tone, children }: { href: string; drillDown: boolean; tone?: 'gold'; children: ReactNode }) {
  return (
    <li>
      <IntentLink
        href={href}
        transitionTypes={drillDown ? ['nav-forward'] : TAB_TRANSITION}
        className={cn(
          'pressable hover-tint flex min-h-11 items-center justify-between gap-3 py-3 no-underline',
          tone === 'gold' ? 'font-bold text-gold' : 'text-ink',
        )}
      >
        <span className="min-w-0 break-words">{children}</span>
        <ChevronRight aria-hidden="true" className="size-5 shrink-0" />
      </IntentLink>
    </li>
  )
}

// What waits on the member, only when something does (#388): task submissions to review
// (reviewers and up) and markets to resolve (admins and up), each opening its Admin section, which
// makes this one of Admin's two ways in (D1); for everyone else, their own closed markets they can
// resolve; and at 0 DC, the way to earn more.
export function NeedsYou({
  counts,
  showReviews,
  showAdminMarkets,
  marketsToResolve,
  balance,
  taskRewards,
}: {
  counts: ReviewCounts
  showReviews: boolean
  // An admin's market count covers every closed market, their own included, so their own
  // closed markets aren't listed again.
  showAdminMarkets: boolean
  marketsToResolve: MarketsToResolve
  balance: number
  taskRewards: RewardRange | null
}) {
  const rows: Row[] = []
  if (showReviews && counts.tasks > 0) {
    rows.push({
      key: 'tasks',
      href: '/admin/tasks',
      drillDown: true,
      content: (
        <>
          <b>{countNoun(counts.tasks, 'task submission', 'task submissions')}</b> to review
        </>
      ),
    })
  }
  if (showAdminMarkets && counts.markets > 0) {
    rows.push({
      key: 'markets',
      href: '/admin/markets',
      drillDown: true,
      content: (
        <>
          <b>{countNoun(counts.markets, 'market', 'markets')}</b> to resolve
        </>
      ),
    })
  }
  if (!showAdminMarkets) {
    for (const market of marketsToResolve.markets) {
      rows.push({
        key: `market:${market.id}`,
        href: `/markets/${market.id}`,
        drillDown: true,
        content: (
          <>
            <b>{market.title}</b> closed. Resolve it.
          </>
        ),
      })
    }
    const more = marketsToResolve.total - marketsToResolve.markets.length
    if (more > 0) {
      rows.push({
        key: 'markets-more',
        href: '/markets?status=awaiting',
        drillDown: false,
        content: <>{countNoun(more, 'more market', 'more markets')} to resolve</>,
      })
    }
  }
  if (balance === 0) {
    const rewards = taskRewardsDetail(taskRewards)
    rows.push({
      key: 'earn',
      href: '/tasks',
      drillDown: false,
      tone: 'gold',
      content: `You’re out of Dwell Coin. Earn more with Tasks${rewards ? `: ${rewards}.` : '.'}`,
    })
  }
  if (rows.length === 0) return null

  return (
    <HomeSection title="Needs you" titleId="needs-you-title">
      <ul className={homeRowsClass}>
        {rows.map((row) => (
          <NeedsYouRow key={row.key} href={row.href} drillDown={row.drillDown} tone={row.tone}>
            {row.content}
          </NeedsYouRow>
        ))}
      </ul>
    </HomeSection>
  )
}
