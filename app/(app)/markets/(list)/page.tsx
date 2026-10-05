import { Fragment } from 'react'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import { requireUser } from '@/lib/auth/require-user'
import { LiveTables } from '@/components/live/live-tables'
import { renderStamp } from '@/lib/live/render-stamp'
import { pageSubscriptions } from '@/lib/live/page-subscriptions'
import { listResolvedMarkets, listOpenMarkets, listMatchingMarkets, type MarketSummary } from '@/lib/markets/list-markets'
import { marketsHref, readMarketSearch } from '@/lib/markets/search'
import { busiestCategories, listCategoryCounts, readCategoryParam } from '@/lib/markets/categories'
import type { KeysetPage } from '@/lib/pagination/keyset'
import { marketOdds } from '@/lib/markets/pricing'
import { outcomeSeries } from '@/lib/markets/outcome-series'
import { weeklyChange } from '@/lib/markets/chart-summary'
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
import { FilterChips } from '@/components/ui/filter-chips'
import { MarketSearch } from '@/components/markets/market-search'
import { MoreCategories } from '@/components/markets/more-categories'
import { cn } from '@/lib/utils'
import { MarketCard, leadingOutcome, type MarketCardChart } from '@/components/markets/market-card'

const GROUPS: { id: MarketCardStatus; heading: string }[] = [
  { id: 'open', heading: 'Open' },
  { id: 'awaiting', heading: 'Waiting for a result' },
  { id: 'resolved', heading: 'Resolved' },
  { id: 'voided', heading: 'Called off' },
]

const EMPTY_TITLES: Record<MarketFilter, string> = {
  open: 'No open markets.',
  awaiting: 'Nothing waiting for a result.',
  resolved: 'No resolved markets yet.',
}

const EMPTY_BODIES: Record<MarketFilter, string> = {
  open: 'Nothing is taking bets right now. Create one to get the next duel going.',
  awaiting: 'Markets past their close time show up here until someone resolves them.',
  resolved: 'Resolved and called-off markets show up here.',
}

const STATUS_WORDS: Record<MarketFilter, string> = { open: 'open ', awaiting: 'waiting ', resolved: 'resolved ' }

const NO_ROWS: KeysetPage<MarketSummary> = { rows: [], next: null, windowed: false }

// Each tab reads one list with its own Show more (#389). The open and waiting lists are the two
// sides of the close time (#261); resolved and voided markets share the third.
type ListId = MarketFilter
type List = { id: ListId; groups: MarketCardStatus[] }
const LISTS: List[] = [
  { id: 'open', groups: ['open'] },
  { id: 'awaiting', groups: ['awaiting'] },
  { id: 'resolved', groups: ['resolved', 'voided'] },
]

// A search lists its matches as one flat list instead (#264).
type CardList = ListId | 'match'
const rowIdPrefix = (list: CardList) => `market-${list}`

export default async function MarketsPage(props: PageProps<'/markets'>) {
  const searchParams = await props.searchParams
  const { supabase, user } = await requireUser()
  if (!user) redirect('/sign-in')

  const filter = readMarketFilter(searchParams.status)
  const q = readMarketSearch(searchParams.q)
  const narrowed = q !== ''
  // A category (0103) is named by its slug, so the lists wait on the counts only when there's one
  // to look up. An unknown or hidden slug, and the old ?mine= chips, fall through to All.
  const countsRead = listCategoryCounts(supabase)
  const category = searchParams.category ? readCategoryParam(searchParams.category, await countsRead) : null
  const scope = { categoryId: category?.id ?? null }
  const slug = category?.slug ?? null
  // eslint-disable-next-line react-hooks/purity
  const nowMs = Date.now()
  const now = new Date(nowMs)
  const at = now.toISOString()
  const read = async ({ id }: List): Promise<KeysetPage<MarketSummary>> => {
    if (narrowed || id !== filter) return NO_ROWS
    const params = readPageParams(searchParams, id)
    if (id === 'resolved') return listResolvedMarkets(supabase, params, scope)
    return listOpenMarkets(supabase, params, { upcoming: id === 'open', at }, scope)
  }
  const [[open, awaiting, resolved], matches, counts] = await Promise.all([
    Promise.all(LISTS.map(read)),
    narrowed ? listMatchingMarkets(supabase, readPageParams(searchParams, 'match'), { q, ...scope }) : NO_ROWS,
    countsRead,
  ])
  const pages: Record<ListId, KeysetPage<MarketSummary>> = { open, awaiting, resolved }
  const markets: (readonly [MarketSummary, CardList])[] = [
    ...pages[filter].rows.map((m) => [m, filter] as const),
    ...matches.rows.map((m) => [m, 'match'] as const),
  ]
  // One sparkline batch per list, so each list's cache entry moves only with its own markets.
  const cardLists: CardList[] = narrowed ? ['match'] : LISTS.map(({ id }) => id)
  const sparklinesByMarket = await readSparklines(
    supabase,
    cardLists.map((id) =>
      markets
        .filter(([, list]) => list === id)
        .map(([m]) => ({
          id: m.id,
          seedPerOutcome: m.seedPerOutcome,
          pricing: m.pricing,
          createdAt: m.createdAt,
          outcomeIds: m.outcomes.map((o) => o.id),
          version: m.sparkVersion,
        })),
    ),
  )

  // A category chip tells markets apart only while more than one category holds markets, and never
  // in a list already narrowed to one (#387). The category filter row follows the same rule.
  const severalCategories = counts.filter((c) => c.markets > 0).length > 1
  const showCategory = category === null && severalCategories
  const cards = markets.map(([market, list]) => {
    const odds = marketOdds(market)
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
    const outcomes = odds.map((o) => ({
      id: o.outcomeId,
      label: o.label,
      pct: o.impliedProbability === null ? null : Math.round(o.impliedProbability * 100),
    }))
    const status = marketCardStatus(market.status, market.closeAt, now)
    const lead = leadingOutcome(market.kind, outcomes)
    const card = {
      id: market.id,
      title: market.title,
      status,
      kind: market.kind,
      edited: market.edited,
      category: showCategory ? (market.category?.name ?? null) : null,
      closeAt: market.closeAt,
      resolvedAt: market.resolvedAt,
      settledAt: market.settledAt,
      outcomes,
      resolvedOutcomeLabel: market.resolvedOutcomeLabel,
      chart,
      weeklyChange:
        (status === 'open' || status === 'awaiting') && lead?.pct != null ? weeklyChange(points, lead.id, lead.pct, nowMs) : null,
      betCount: market.betCount,
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

  // The Open and Waiting tabs already name their one group, so its heading is for screen readers.
  const renderGroup = (group: ReturnType<typeof listGroups>[number], list: List) => (
    <section key={group.id} aria-labelledby={`markets-${group.id}-heading`} className="flex flex-col gap-3">
      <h2 id={`markets-${group.id}-heading`} className={list.groups.length > 1 ? h2Class : 'sr-only'}>
        {group.heading}
      </h2>
      <div className="grid gap-5 lg:grid-cols-3">
        {group.markets.map((market) => (
          <MarketCard key={market.id} {...market} />
        ))}
      </div>
    </section>
  )

  const subject = 'markets'
  const inCategory = category ? ` in ${category.name}` : ''
  const clearHref = marketsHref({ status: filter, category: slug })
  const clearLabel = 'Clear search'
  const allCategoriesHref = marketsHref({ status: filter, q })
  const matchCards = cards.filter((c) => c.list === 'match').map((c) => c.card)

  function renderMatches() {
    if (matchCards.length === 0 && !matches.windowed) {
      return (
        <EmptyState
          title={`No ${subject}${inCategory} match “${q}”.`}
          action={
            <Link href={clearHref} className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
              {clearLabel}
            </Link>
          }
        >
          Check the spelling, or try fewer words.
        </EmptyState>
      )
    }
    // The count is only known when the whole list is on screen; past one page it's "newest first".
    const complete = !matches.next && !matches.windowed
    const lead = complete ? `${matchCards.length} ${matchCards.length === 1 ? 'market' : subject}` : `Newest ${subject}`
    return (
      <section aria-labelledby="markets-matches-heading" className="flex flex-col gap-3">
        <h2 id="markets-matches-heading" className="sr-only">
          Matching markets
        </h2>
        <p id="markets-matches-caption" className="text-sm text-ink2">
          {`${lead} ${complete && matchCards.length === 1 ? 'matches' : 'match'} “${q}”. Showing matches in every status. `}
          <Link href={clearHref}>{clearLabel}</Link>
        </p>
        {windowTop(matches, 'match')}
        <div className="grid gap-5 lg:grid-cols-3">
          {matchCards.map((market) => (
            <MarketCard key={market.id} {...market} />
          ))}
        </div>
        {matches.next && (
          <ShowMore
            href={showMoreHref('/markets', searchParams, 'match', matches.next)}
            fresh={matches.next.kind === 'window'}
            focusId={rowDomId(rowIdPrefix('match'), matches.next.firstId)}
          />
        )}
      </section>
    )
  }

  // All, the busiest categories, and the chosen one when it isn't among them; More… lists the rest.
  const busiest = busiestCategories(counts)
  const categoryChip = (c: (typeof counts)[number]) => ({
    href: marketsHref({ status: filter, q, category: c.slug }),
    label: c.name,
    current: c.id === category?.id,
  })
  const categoryChips = [
    { href: allCategoriesHref, label: 'All', current: category === null },
    ...(category && !busiest.some((c) => c.id === category.id) ? [...busiest, category] : busiest).map(categoryChip),
  ]

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
      <MarketSearch
        key={q}
        q={q}
        category={slug}
        tabs={
          <SubNav
            label="Filter markets"
            className="min-w-0 flex-1 md:flex-none"
            items={MARKET_FILTERS.map((f) => ({
              href: marketsHref({ status: f, category: slug }),
              label: MARKET_FILTER_LABELS[f],
              // A search reads every status, so no tab is current while one is showing.
              current: !narrowed && f === filter,
            }))}
          />
        }
        filters={
          severalCategories && (
            <FilterChips scroll label="Categories" items={categoryChips}>
              {counts.length > busiest.length && <MoreCategories items={counts.map(categoryChip)} />}
            </FilterChips>
          )
        }
      />
      {category && (
        <p id="markets-category-caption" className="text-sm text-ink2">
          Showing {narrowed ? '' : STATUS_WORDS[filter]}markets in <strong className="text-ink">{category.name}</strong> ·{' '}
          <Link href={allCategoriesHref}>Show all categories</Link>
        </p>
      )}
      <LiveTables subscriptions={pageSubscriptions.markets()} renderedAt={renderStamp()} />
      <ShowMoreFocus />
      {narrowed ? (
        renderMatches()
      ) : nothing ? (
        <EmptyState
          title={category ? `No ${STATUS_WORDS[filter]}markets in ${category.name}.` : EMPTY_TITLES[filter]}
          action={
            <div className="flex flex-wrap gap-2">
              <Link
                href="/markets/new"
                transitionTypes={['nav-forward']}
                className={buttonVariants({ variant: 'secondary', size: 'sm' })}
              >
                Create market
              </Link>
              {category && (
                <Link href={allCategoriesHref} className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
                  Show all categories
                </Link>
              )}
            </div>
          }
        >
          {category ? 'Make one in this category, or look at the others.' : EMPTY_BODIES[filter]}
        </EmptyState>
      ) : (
        <>
          {lists.map(({ id, page, groups }) => {
            return (
              <Fragment key={id}>
                {windowTop(page, id)}
                {groups.map((group) => renderGroup(group, LISTS.find((l) => l.id === id)!))}
                {page.next && (
                  <ShowMore
                    href={showMoreHref('/markets', searchParams, id, page.next)}
                    fresh={page.next.kind === 'window'}
                    focusId={rowDomId(rowIdPrefix(id), page.next.firstId)}
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
