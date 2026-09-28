import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ChartColumn, Plus } from 'lucide-react'
import { requireUser } from '@/lib/auth/require-user'
import { LiveTables } from '@/components/live/live-tables'
import { pageSubscriptions } from '@/lib/live/page-subscriptions'
import { listClosedMarkets, listOpenMarkets } from '@/lib/markets/list-markets'
import { computeOdds } from '@/lib/markets/odds'
import { outcomeSeries } from '@/lib/markets/outcome-series'
import { marketCardStatus, type MarketCardStatus } from '@/lib/markets/market-status'
import { readSparklines } from '@/lib/markets/sparklines'
import { newestHref, readPageParams, showMoreHref } from '@/lib/pagination/cursor'
import { rowDomId } from '@/lib/pagination/row-id'
import { Page, PageHeader, h2Class } from '@/components/ui/page'
import { EmptyState } from '@/components/ui/empty-state'
import { buttonVariants } from '@/components/ui/button'
import { NothingOlder } from '@/components/ui/nothing-older'
import { BackToNewest, ShowMore } from '@/components/ui/show-more'
import { ShowMoreFocus } from '@/components/ui/show-more-focus'
import { cn } from '@/lib/utils'
import { MarketCard, type MarketCardChart } from '@/components/markets/market-card'

const GROUPS: { id: MarketCardStatus; heading: string }[] = [
  { id: 'open', heading: 'Open' },
  { id: 'awaiting', heading: 'Awaiting resolution' },
  { id: 'resolved', heading: 'Resolved' },
  { id: 'voided', heading: 'Voided' },
]

const OPEN_GROUPS: MarketCardStatus[] = ['open', 'awaiting']
const OPEN_ROW_ID_PREFIX = 'market-open'
const CLOSED_ROW_ID_PREFIX = 'market-closed'

export default async function MarketsPage(props: PageProps<'/markets'>) {
  const searchParams = await props.searchParams
  const { supabase, user } = await requireUser()
  if (!user) redirect('/sign-in')

  const [open, closed] = await Promise.all([
    listOpenMarkets(supabase, readPageParams(searchParams, 'open')),
    listClosedMarkets(supabase, readPageParams(searchParams, 'resolved')),
  ])
  // A market can resolve or void between the two concurrent reads above, and then come back from
  // both. It only ever moves from open to closed, so the closed copy is the fresher one: the open
  // copy is dropped rather than rendering the market twice, with duplicate React keys and
  // duplicate `market-closed-*` DOM/title ids.
  const closedIds = new Set(closed.rows.map((m) => m.id))
  const markets = [
    ...open.rows.filter((m) => !closedIds.has(m.id)).map((m) => [m, OPEN_ROW_ID_PREFIX] as const),
    ...closed.rows.map((m) => [m, CLOSED_ROW_ID_PREFIX] as const),
  ]
  const sparklinesByMarket = await readSparklines(
    supabase,
    markets.map(([m]) => m.id),
  )
  // eslint-disable-next-line react-hooks/purity
  const nowMs = Date.now()
  const now = new Date(nowMs)

  const cards = markets.map(([market, prefix]) => {
    const odds = computeOdds(
      market.outcomes.map((o) => ({ id: o.id, label: o.label, pool_total: o.poolTotal })),
      market.seedPerOutcome,
    )
    const points = sparklinesByMarket.get(market.id) ?? []
    const chart: MarketCardChart | undefined =
      points.length > 0
        ? {
            outcomes: odds.map((o, index) => ({
              id: o.outcomeId,
              label: o.label,
              series: outcomeSeries(market.kind, o.label, index),
            })),
            points,
            now: nowMs,
          }
        : undefined
    return {
      id: market.id,
      title: market.title,
      status: marketCardStatus(market.status, market.closeAt, now),
      kind: market.kind,
      line: market.line,
      edited: market.edited,
      closeAt: market.closeAt,
      resolvedAt: market.resolvedAt,
      outcomes: odds.map((o) => ({
        id: o.outcomeId,
        label: o.label,
        pct: o.impliedProbability === null ? null : Math.round(o.impliedProbability * 100),
      })),
      resolvedOutcomeLabel: market.resolvedOutcomeLabel,
      chart,
      domId: rowDomId(prefix, market.id),
    }
  })

  const groups = GROUPS.map((group) => ({
    ...group,
    markets: cards.filter((card) => card.status === group.id),
  })).filter((group) => group.markets.length > 0)
  const openGroups = groups.filter((group) => OPEN_GROUPS.includes(group.id))
  const closedGroups = groups.filter((group) => !OPEN_GROUPS.includes(group.id))

  // Each list's window says where it starts above its own groups: Back to newest, or, when the
  // window has no rows left, that there's nothing older, where those groups would have been.
  const windowTop = (list: typeof open, param: string) => {
    if (!list.windowed) return null
    const href = newestHref('/markets', searchParams, param)
    return list.rows.length > 0 ? <BackToNewest href={href} /> : <NothingOlder href={href} />
  }

  const renderGroup = (group: (typeof groups)[number]) => (
    <section key={group.id} aria-labelledby={`markets-${group.id}-heading`} className="flex flex-col gap-3">
      <h2 id={`markets-${group.id}-heading`} className={h2Class}>
        {group.heading}
      </h2>
      <div className="grid items-start gap-5 lg:grid-cols-3">
        {group.markets.map((market) => (
          <MarketCard key={market.id} {...market} />
        ))}
      </div>
    </section>
  )

  return (
    <Page transition="tab">
      <PageHeader
        title="Markets"
        action={
          <Link
            href="/markets/new"
            transitionTypes={['nav-forward']}
            className={cn(buttonVariants({ variant: 'primary', size: 'sm' }), 'md:min-h-12 md:px-5 md:text-base')}
          >
            <Plus aria-hidden="true" className="size-5" />
            Create market
          </Link>
        }
      />
      <LiveTables subscriptions={pageSubscriptions.markets()} />
      <ShowMoreFocus />
      {groups.length === 0 && !open.windowed && !closed.windowed ? (
        <EmptyState
          icon={ChartColumn}
          title="No markets yet."
          action={
            <Link
              href="/markets/new"
              transitionTypes={['nav-forward']}
              className={buttonVariants({ variant: 'secondary', size: 'sm' })}
            >
              Create market
            </Link>
          }
        >
          Open the first one and get the duel started.
        </EmptyState>
      ) : (
        <>
          {windowTop(open, 'open')}
          {openGroups.map(renderGroup)}
          {open.next && (
            <ShowMore
              href={showMoreHref('/markets', searchParams, 'open', open.next)}
              fresh={open.next.kind === 'window'}
              focusId={rowDomId(OPEN_ROW_ID_PREFIX, open.next.firstId)}
              description="Open markets"
            />
          )}
          {windowTop(closed, 'resolved')}
          {closedGroups.map(renderGroup)}
          {closed.next && (
            <ShowMore
              href={showMoreHref('/markets', searchParams, 'resolved', closed.next)}
              fresh={closed.next.kind === 'window'}
              focusId={rowDomId(CLOSED_ROW_ID_PREFIX, closed.next.firstId)}
              description="Closed markets"
            />
          )}
        </>
      )}
    </Page>
  )
}
