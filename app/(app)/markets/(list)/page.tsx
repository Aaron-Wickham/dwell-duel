import { Fragment } from 'react'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ChartColumn, Plus } from 'lucide-react'
import { requireUser } from '@/lib/auth/require-user'
import { LiveTables } from '@/components/live/live-tables'
import { pageSubscriptions } from '@/lib/live/page-subscriptions'
import { listResolvedMarkets, listOpenMarkets, type MarketSummary } from '@/lib/markets/list-markets'
import type { KeysetPage } from '@/lib/pagination/keyset'
import { computeOdds } from '@/lib/markets/odds'
import { outcomeSeries } from '@/lib/markets/outcome-series'
import { marketCardStatus, type MarketCardStatus } from '@/lib/markets/market-status'
import { readSparklines } from '@/lib/markets/sparklines'
import { MARKET_FILTERS, MARKET_FILTER_LABELS, readMarketFilter, type MarketFilter } from '@/lib/markets/status-filter'
import { newestHref, readPageParams, showMoreHref } from '@/lib/pagination/cursor'
import { rowDomId } from '@/lib/pagination/row-id'
import { Page, PageHeader, h2Class } from '@/components/ui/page'
import { EmptyState } from '@/components/ui/empty-state'
import { buttonVariants } from '@/components/ui/button'
import { NothingOlder } from '@/components/ui/nothing-older'
import { BackToNewest, ShowMore } from '@/components/ui/show-more'
import { ShowMoreFocus } from '@/components/ui/show-more-focus'
import { SubNav } from '@/components/ui/sub-nav'
import { cn } from '@/lib/utils'
import { MarketCard, type MarketCardChart } from '@/components/markets/market-card'

const GROUPS: { id: MarketCardStatus; heading: string }[] = [
  { id: 'open', heading: 'Open' },
  { id: 'awaiting', heading: 'Awaiting resolution' },
  { id: 'resolved', heading: 'Resolved' },
  { id: 'voided', heading: 'Voided' },
]

const EMPTY_TITLES: Record<MarketFilter, string> = {
  all: 'No markets yet.',
  open: 'No open markets.',
  awaiting: 'Nothing awaiting resolution.',
  resolved: 'No resolved markets yet.',
}

const EMPTY_BODIES: Record<MarketFilter, string> = {
  all: 'Open the first one and get the duel started.',
  open: 'Nothing is taking bets right now. Create one to get the next duel going.',
  awaiting: 'Markets past their close time show up here until someone resolves them.',
  resolved: 'Resolved and voided markets show up here.',
}

const NO_ROWS: KeysetPage<MarketSummary> = { rows: [], next: null, windowed: false }

// The All tab reads three lists, each with its own Show more, so markets still taking bets come
// first however many are waiting on a result (#261). The open and awaiting lists are the two sides
// of the close time; the Open and Awaiting tabs read just theirs.
type ListId = 'open' | 'awaiting' | 'resolved'
type List = { id: ListId; groups: MarketCardStatus[]; filters: MarketFilter[]; description: string }
const LISTS: List[] = [
  { id: 'open', groups: ['open'], filters: ['all', 'open'], description: 'Open markets' },
  { id: 'awaiting', groups: ['awaiting'], filters: ['all', 'awaiting'], description: 'Markets awaiting resolution' },
  { id: 'resolved', groups: ['resolved', 'voided'], filters: ['all', 'resolved'], description: 'Resolved markets' },
]

const rowIdPrefix = (list: ListId) => `market-${list}`

export default async function MarketsPage(props: PageProps<'/markets'>) {
  const searchParams = await props.searchParams
  const { supabase, user } = await requireUser()
  if (!user) redirect('/sign-in')

  const filter = readMarketFilter(searchParams.status)
  // eslint-disable-next-line react-hooks/purity
  const nowMs = Date.now()
  const now = new Date(nowMs)
  const at = now.toISOString()
  const read = async ({ id, filters }: List): Promise<KeysetPage<MarketSummary>> => {
    if (!filters.includes(filter)) return NO_ROWS
    const params = readPageParams(searchParams, id)
    if (id === 'resolved') return listResolvedMarkets(supabase, params)
    return listOpenMarkets(supabase, params, { upcoming: id === 'open', at })
  }
  const [open, awaiting, resolved] = await Promise.all(LISTS.map(read))
  const pages: Record<ListId, KeysetPage<MarketSummary>> = { open, awaiting, resolved }
  // A market can resolve or void between the concurrent reads above, and then come back from
  // two lists. It only ever moves from open to resolved or voided, so the resolved list's copy is
  // the fresher one: the open copy is dropped rather than rendering the market twice, with
  // duplicate React keys and DOM/title ids. The open and awaiting lists split at one instant, so
  // they never share a market.
  const resolvedIds = new Set(resolved.rows.map((m) => m.id))
  const markets = LISTS.flatMap(({ id }) =>
    pages[id].rows.filter((m) => id === 'resolved' || !resolvedIds.has(m.id)).map((m) => [m, id] as const),
  )
  const sparklinesByMarket = await readSparklines(
    supabase,
    markets.map(([m]) => ({
      id: m.id,
      seedPerOutcome: m.seedPerOutcome,
      createdAt: m.createdAt,
      outcomeIds: m.outcomes.map((o) => o.id),
      version: m.sparkVersion,
    })),
  )

  const cards = markets.map(([market, list]) => {
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
    const card = {
      id: market.id,
      title: market.title,
      status: marketCardStatus(market.status, market.closeAt, now),
      kind: market.kind,
      line: market.line,
      edited: market.edited,
      closeAt: market.closeAt,
      resolvedAt: market.resolvedAt,
      settledAt: market.settledAt,
      outcomes: odds.map((o) => ({
        id: o.outcomeId,
        label: o.label,
        pct: o.impliedProbability === null ? null : Math.round(o.impliedProbability * 100),
      })),
      resolvedOutcomeLabel: market.resolvedOutcomeLabel,
      chart,
      domId: rowDomId(rowIdPrefix(list), market.id),
      now: nowMs,
    }
    return { list, card }
  })

  // Each list's groups hold only its own cards: a market that closes between two Show mores has
  // already moved to the awaiting list.
  const listGroups = (list: List) =>
    GROUPS.filter((group) => list.groups.includes(group.id))
      .map((group) => ({
        ...group,
        markets: cards.filter((c) => c.list === list.id && c.card.status === group.id).map((c) => c.card),
      }))
      .filter((group) => group.markets.length > 0)
  const lists = LISTS.map((list) => ({ ...list, page: pages[list.id], groups: listGroups(list) }))
  const nothing = lists.every((list) => list.groups.length === 0 && !list.page.windowed)

  // Each list's window says where it starts above its own groups: Back to newest, or, when the
  // window has no rows left, that there's nothing older, where those groups would have been.
  const windowTop = (list: KeysetPage<MarketSummary>, param: string) => {
    if (!list.windowed) return null
    const href = newestHref('/markets', searchParams, param)
    return list.rows.length > 0 ? <BackToNewest href={href} /> : <NothingOlder href={href} />
  }

  const renderGroup = (group: ReturnType<typeof listGroups>[number]) => (
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
      <SubNav
        label="Filter markets"
        items={MARKET_FILTERS.map((f) => ({
          href: f === 'all' ? '/markets' : `/markets?status=${f}`,
          label: MARKET_FILTER_LABELS[f],
          current: f === filter,
        }))}
      />
      <LiveTables subscriptions={pageSubscriptions.markets()} />
      <ShowMoreFocus />
      {nothing ? (
        <EmptyState
          icon={ChartColumn}
          title={EMPTY_TITLES[filter]}
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
          {EMPTY_BODIES[filter]}
        </EmptyState>
      ) : (
        <>
          {lists.map(({ id, description, page, groups }) => {
            return (
              <Fragment key={id}>
                {windowTop(page, id)}
                {groups.map(renderGroup)}
                {page.next && (
                  <ShowMore
                    href={showMoreHref('/markets', searchParams, id, page.next)}
                    fresh={page.next.kind === 'window'}
                    focusId={rowDomId(rowIdPrefix(id), page.next.firstId)}
                    description={description}
                  />
                )}
              </Fragment>
            )
          })}
        </>
      )}
    </Page>
  )
}
