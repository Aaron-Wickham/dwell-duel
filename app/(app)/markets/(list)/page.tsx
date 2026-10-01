import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ChartColumn, Plus, SearchX } from 'lucide-react'
import { requireUser } from '@/lib/auth/require-user'
import { LiveTables } from '@/components/live/live-tables'
import { pageSubscriptions } from '@/lib/live/page-subscriptions'
import { listResolvedMarkets, listOpenMarkets, listMatchingMarkets } from '@/lib/markets/list-markets'
import { MINE_LABELS, marketsHref, readMarketSearch, readMineFilter, type MineFilter } from '@/lib/markets/search'
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
import { FilterChips } from '@/components/ui/filter-chips'
import { MarketSearch } from '@/components/markets/market-search'
import { cn } from '@/lib/utils'
import { MarketCard, type MarketCardChart } from '@/components/markets/market-card'

const GROUPS: { id: MarketCardStatus; heading: string }[] = [
  { id: 'open', heading: 'Open' },
  { id: 'awaiting', heading: 'Awaiting resolution' },
  { id: 'resolved', heading: 'Resolved' },
  { id: 'voided', heading: 'Voided' },
]

const OPEN_GROUPS: MarketCardStatus[] = ['open', 'awaiting']
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

// The open list holds both sides of the close time unless a tab picks one.
const OPEN_LIST_DESCRIPTIONS: Record<Exclude<MarketFilter, 'resolved'>, string> = {
  all: 'Open and awaiting markets',
  open: 'Open markets',
  awaiting: 'Markets awaiting resolution',
}

// What a narrowed list is a list of, in the caption and the empty state.
const MINE_SUBJECTS: Record<MineFilter | 'all', string> = {
  all: 'markets',
  bet: 'markets you bet on',
  made: 'markets you made',
}
const STATUS_WORDS: Record<MarketFilter, string> = { all: '', open: 'open ', awaiting: 'awaiting ', resolved: 'resolved ' }

const NO_ROWS = { rows: [], next: null, windowed: false } as const

const OPEN_ROW_ID_PREFIX = 'market-open'
const RESOLVED_ROW_ID_PREFIX = 'market-resolved'
const MATCH_ROW_ID_PREFIX = 'market-match'

export default async function MarketsPage(props: PageProps<'/markets'>) {
  const searchParams = await props.searchParams
  const { supabase, user } = await requireUser()
  if (!user) redirect('/sign-in')

  const filter = readMarketFilter(searchParams.status)
  const q = readMarketSearch(searchParams.q)
  const mine = readMineFilter(searchParams.mine)
  const narrowed = q !== '' || mine !== null
  // eslint-disable-next-line react-hooks/purity
  const nowMs = Date.now()
  const now = new Date(nowMs)
  const openParams = readPageParams(searchParams, 'open')
  // A search or a whose-markets chip lists its matches as one flat list under the match prefix;
  // otherwise it's the status groups, read as two lists.
  const matches = narrowed
    ? await listMatchingMarkets(supabase, readPageParams(searchParams, 'match'), filter, { q, mine, userId: user.id }, now.toISOString())
    : NO_ROWS
  const [open, resolved] = narrowed
    ? [NO_ROWS, NO_ROWS]
    : await Promise.all([
        filter === 'resolved'
          ? NO_ROWS
          : filter === 'all'
            ? listOpenMarkets(supabase, openParams)
            : listOpenMarkets(supabase, openParams, { upcoming: filter === 'open', at: now.toISOString() }),
        filter === 'all' || filter === 'resolved' ? listResolvedMarkets(supabase, readPageParams(searchParams, 'resolved')) : NO_ROWS,
      ])
  // A market can resolve or void between the two concurrent reads above, and then come back from
  // both. It only ever moves from open to resolved or voided, so the resolved list's copy is the
  // fresher one: the open copy is dropped rather than rendering the market twice, with duplicate
  // React keys and duplicate `market-resolved-*` DOM/title ids.
  const resolvedIds = new Set(resolved.rows.map((m) => m.id))
  const markets = narrowed
    ? matches.rows.map((m) => [m, MATCH_ROW_ID_PREFIX] as const)
    : [
        ...open.rows.filter((m) => !resolvedIds.has(m.id)).map((m) => [m, OPEN_ROW_ID_PREFIX] as const),
        ...resolved.rows.map((m) => [m, RESOLVED_ROW_ID_PREFIX] as const),
      ]
  const sparklinesByMarket = await readSparklines(
    supabase,
    markets.map(([m]) => ({
      id: m.id,
      seedPerOutcome: m.seedPerOutcome,
      createdAt: m.createdAt,
      outcomeIds: m.outcomes.map((o) => o.id),
      sparkline: m.sparkline,
    })),
  )

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
      settledAt: market.settledAt,
      outcomes: odds.map((o) => ({
        id: o.outcomeId,
        label: o.label,
        pct: o.impliedProbability === null ? null : Math.round(o.impliedProbability * 100),
      })),
      resolvedOutcomeLabel: market.resolvedOutcomeLabel,
      chart,
      domId: rowDomId(prefix, market.id),
      now: nowMs,
    }
  })

  const groups = GROUPS.map((group) => ({
    ...group,
    markets: cards.filter((card) => card.status === group.id),
  })).filter((group) => group.markets.length > 0)
  const openGroups = groups.filter((group) => OPEN_GROUPS.includes(group.id))
  const resolvedGroups = groups.filter((group) => !OPEN_GROUPS.includes(group.id))

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

  const subject = MINE_SUBJECTS[mine ?? 'all']
  const clearHref = q ? marketsHref({ status: filter, mine }) : marketsHref({ status: filter })
  const clearLabel = q ? 'Clear search' : 'Show everyone’s markets'
  const matchesWindowTop = matches.windowed ? (
    matches.rows.length > 0 ? <BackToNewest href={newestHref('/markets', searchParams, 'match')} /> : <NothingOlder href={newestHref('/markets', searchParams, 'match')} />
  ) : null

  function renderMatches() {
    if (cards.length === 0 && !matches.windowed) {
      return (
        <EmptyState
          icon={q ? SearchX : ChartColumn}
          title={q ? `No ${STATUS_WORDS[filter]}${subject} match “${q}”.` : `No ${STATUS_WORDS[filter]}${subject} yet.`}
          action={
            <div className="flex flex-wrap gap-2">
              {q && filter !== 'all' && (
                <Link href={marketsHref({ q, mine })} className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
                  Search all markets
                </Link>
              )}
              <Link href={clearHref} className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
                {clearLabel}
              </Link>
            </div>
          }
        >
          {q ? (filter === 'all' ? 'Check the spelling, or try fewer words.' : 'Check the spelling, or search all markets.') : 'Bet on a market, or make one, and it shows up here.'}
        </EmptyState>
      )
    }
    // The count is only known when the whole list is on screen; past one page it's "newest first".
    const complete = !matches.next && !matches.windowed
    const lead = complete ? `${cards.length} ${cards.length === 1 ? subject.replace(/^markets/, 'market') : subject}` : `Newest ${subject}`
    return (
      <section aria-labelledby="markets-matches-heading" className="flex flex-col gap-3">
        <h2 id="markets-matches-heading" className="sr-only">
          Matching markets
        </h2>
        <p id="markets-matches-caption" className="text-sm text-ink2">
          {q ? `${lead} ${complete && cards.length === 1 ? 'matches' : 'match'} “${q}”. ` : `${lead}. `}
          <Link href={clearHref}>{clearLabel}</Link>
        </p>
        {matchesWindowTop}
        <div className="grid items-start gap-5 lg:grid-cols-3">
          {cards.map((market) => (
            <MarketCard key={market.id} {...market} />
          ))}
        </div>
        {matches.next && (
          <ShowMore
            href={showMoreHref('/markets', searchParams, 'match', matches.next)}
            fresh={matches.next.kind === 'window'}
            focusId={rowDomId(MATCH_ROW_ID_PREFIX, matches.next.firstId)}
          />
        )}
      </section>
    )
  }

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
      <div className="flex flex-col gap-5 md:flex-row md:flex-wrap md:items-center">
        <MarketSearch key={q} q={q} status={filter} mine={mine} />
        <FilterChips
          className="order-3 md:order-2"
          label="Whose markets"
          items={([null, 'bet', 'made'] as const).map((m) => ({
            href: marketsHref({ status: filter, q, mine: m }),
            label: MINE_LABELS[m ?? 'all'],
            current: m === mine,
          }))}
        />
        <div className="order-2 flex flex-col md:order-3 md:basis-full">
          <SubNav
            label="Filter markets"
            items={MARKET_FILTERS.map((f) => ({
              href: marketsHref({ status: f, q, mine }),
              label: MARKET_FILTER_LABELS[f],
              current: f === filter,
            }))}
          />
        </div>
      </div>
      <LiveTables subscriptions={pageSubscriptions.markets()} />
      <ShowMoreFocus />
      {narrowed ? (
        renderMatches()
      ) : groups.length === 0 && !open.windowed && !resolved.windowed ? (
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
          {windowTop(open, 'open')}
          {openGroups.map(renderGroup)}
          {open.next && (
            <ShowMore
              href={showMoreHref('/markets', searchParams, 'open', open.next)}
              fresh={open.next.kind === 'window'}
              focusId={rowDomId(OPEN_ROW_ID_PREFIX, open.next.firstId)}
              description={OPEN_LIST_DESCRIPTIONS[filter === 'resolved' ? 'all' : filter]}
            />
          )}
          {windowTop(resolved, 'resolved')}
          {resolvedGroups.map(renderGroup)}
          {resolved.next && (
            <ShowMore
              href={showMoreHref('/markets', searchParams, 'resolved', resolved.next)}
              fresh={resolved.next.kind === 'window'}
              focusId={rowDomId(RESOLVED_ROW_ID_PREFIX, resolved.next.firstId)}
              description="Resolved markets"
            />
          )}
        </>
      )}
    </Page>
  )
}
