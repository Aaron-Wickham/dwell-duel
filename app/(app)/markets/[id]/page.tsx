import { Suspense } from 'react'
import Link from 'next/link'
import { redirect, notFound } from 'next/navigation'
import { Layers, Trophy } from 'lucide-react'
import { requireUser } from '@/lib/auth/require-user'
import { LiveTables } from '@/components/live/live-tables'
import { pageSubscriptions } from '@/lib/live/page-subscriptions'
import { isAdmin } from '@/lib/auth/is-admin'
import { getMarket, getMarketBets, type MarketDetail } from '@/lib/markets/get-market'
import { getChartBets } from '@/lib/markets/chart-bets'
import { buildProbabilitySeries } from '@/lib/markets/probability-series'
import { computeOdds, type OutcomeOdds } from '@/lib/markets/odds'
import { outcomeSeries } from '@/lib/markets/outcome-series'
import { chartClosedAt } from '@/lib/markets/market-status'
import { rowState } from '@/lib/markets/row-state'
import { newestHref, readPageParams, showMoreHref, type PageParams, type SearchParams } from '@/lib/pagination/cursor'
import { isUuid } from '@/lib/uuid'
import { getSlipView } from '@/lib/parlays/get-slip'
import { readSlip } from '@/lib/parlays/slip'
import { MAX_PICKS, legOddsBp } from '@/lib/parlays/odds'
import { addToSlipAction, removeFromSlipAction } from '@/lib/parlays/slip-actions'
import { BackLink } from '@/components/ui/back-link'
import { LocalTime } from '@/components/ui/local-time'
import { Message } from '@/components/ui/message'
import { Page, h1Class } from '@/components/ui/page'
import { SectionCard } from '@/components/ui/section-card'
import { BackToNewest, ShowMore } from '@/components/ui/show-more'
import { StatusChip } from '@/components/ui/status-chip'
import { ContentReveal } from '@/components/nav/page-transition'
import { BetList } from '@/components/markets/bet-list'
import { MarketActionsSkeleton, MarketBetsSkeleton, MarketChartSkeleton } from '@/components/markets/market-detail-skeletons'
import { MarketSlipProvider } from '@/components/markets/market-slip'
import { OutcomeRow } from '@/components/markets/outcome-row'
import { ProbabilityChart } from '@/components/markets/probability-chart'
import { BetForm } from './bet-form'
import { ResolveForm } from './resolve-form'
import { SlipDrawer } from './slip-drawer'
import { VoidButton } from './void-button'

// No loading.tsx for this route (and the markets list's own loading.tsx sits in the (list)
// group, so it doesn't wrap this one): the market must be found before anything streams, so an
// unknown id still gets a real 404 status. The chart, the outcomes and bet column, and the bets
// each stream in behind their own skeleton.
export default async function MarketDetailPage(props: PageProps<'/markets/[id]'>) {
  const { id } = await props.params
  const searchParams = await props.searchParams
  const { supabase, user } = await requireUser()
  if (!user) redirect('/sign-in')
  if (!isUuid(id)) notFound()

  // The slip is only a cookie, so reading it here costs nothing. Its pick seeds
  // MarketSlipProvider, which has to sit above both the outcomes and the drawer.
  const [market, slip] = await Promise.all([getMarket(supabase, id), readSlip()])
  if (!market) notFound()

  const odds = computeOdds(market.outcomes.map((o) => ({ id: o.id, label: o.label, pool_total: o.poolTotal })))

  const isCreator = market.createdBy === user.id
  // Server Components render once per request with no re-render/
  // reconciliation cycle for React to keep consistent across -- the
  // purity rule protects Client Components from that, which doesn't
  // apply here, and this page already does non-deterministic async DB
  // reads (getMarket, getMarketBets, isAdmin) on every invocation regardless.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now()
  const isPastClose = new Date(market.closeAt).getTime() <= now
  const canBet = market.status === 'open' && !isPastClose
  const marketPick = market.outcomes.find((o) => slip.includes(o.id))?.id ?? null

  const statusTone =
    market.status === 'resolved' ? 'done' : market.status === 'voided' ? 'void' : isPastClose ? 'wait' : 'open'

  const when =
    market.status === 'resolved' && market.resolvedAt ? (
      <>
        Resolved <LocalTime iso={market.resolvedAt} format="day" /> ·{' '}
      </>
    ) : market.status === 'open' ? (
      <>
        {isPastClose ? 'Closed' : 'Closes'} <LocalTime iso={market.closeAt} format="dateTime" /> ·{' '}
      </>
    ) : null

  return (
    <Page transition="drill-down">
      {/* Wraps the drawer too (rendered below, outside the Outcomes section) so removing this
          market's pick from inside it flips the outcome row off in the same transition. */}
      <MarketSlipProvider pick={marketPick}>
        <LiveTables subscriptions={pageSubscriptions.marketDetail(market.id)} />
        <BackLink href="/markets">Markets</BackLink>

        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <StatusChip tone={statusTone}>
              Status: {market.status === 'open' && isPastClose ? 'awaiting resolution' : market.status}
            </StatusChip>
            <span className="text-sm text-ink2">
              {when}Created by {isCreator ? 'you' : market.creatorName}
            </span>
          </div>
          <h1 className={h1Class}>{market.title}</h1>
          {market.description && <p className="max-w-[68ch] text-ink2">{market.description}</p>}
          {market.status === 'resolved' && market.resolvedOutcomeLabel && (
            <Message tone="ok" icon={Trophy} className="self-start">
              Winning outcome: {market.resolvedOutcomeLabel}
            </Message>
          )}
        </div>

        {/* Each section's fallback carries the same grid placement as the section itself. */}
        <div className="flex flex-col gap-5 lg:grid lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:grid-rows-[auto_auto_1fr] lg:items-start lg:gap-7">
          <Suspense fallback={<MarketChartSkeleton />}>
            <MarketChart market={market} odds={odds} now={now} />
          </Suspense>
          <Suspense fallback={<MarketActionsSkeleton outcomes={market.outcomes.length} />}>
            <MarketActions
              market={market}
              odds={odds}
              slip={slip}
              isCreator={isCreator}
              isPastClose={isPastClose}
              canBet={canBet}
            />
          </Suspense>
          <Suspense fallback={<MarketBetsSkeleton />}>
            <MarketBets
              market={market}
              viewerId={user.id}
              canBet={canBet}
              page={readPageParams(searchParams, 'bets')}
              searchParams={searchParams}
            />
          </Suspense>
        </div>

        <Suspense fallback={null}>
          <MarketSlipDrawer slip={slip} />
        </Suspense>
      </MarketSlipProvider>
    </Page>
  )
}

async function MarketChart({ market, odds, now }: { market: MarketDetail; odds: OutcomeOdds[]; now: number }) {
  const { supabase } = await requireUser()
  const chartBets = await getChartBets(supabase, market.id)
  const chartOutcomes = odds.map((o, index) => ({
    id: o.outcomeId,
    label: o.label,
    series: outcomeSeries(market.kind, o.label, index),
  }))
  const chartPoints = buildProbabilitySeries(
    chartOutcomes.map((o) => o.id),
    chartBets,
  )

  return (
    <ContentReveal>
      <SectionCard title="Chance over time" titleId="chart-title" className="gap-3 lg:col-start-1 lg:row-start-1">
        <ProbabilityChart
          outcomes={chartOutcomes}
          points={chartPoints}
          now={now}
          closedAt={chartClosedAt(market.status, market.closeAt, market.resolvedAt)}
          resolvedLabel={market.status === 'resolved' ? market.resolvedOutcomeLabel : null}
        />
      </SectionCard>
    </ContentReveal>
  )
}

async function MarketActions({
  market,
  odds,
  slip,
  isCreator,
  isPastClose,
  canBet,
}: {
  market: MarketDetail
  odds: OutcomeOdds[]
  slip: string[]
  isCreator: boolean
  isPastClose: boolean
  canBet: boolean
}) {
  const { supabase } = await requireUser()
  const admin = await isAdmin(supabase)

  const totalPool = odds.reduce((sum, o) => sum + o.poolTotal, 0)
  const canResolve = market.status === 'open' && ((isCreator && isPastClose) || admin)
  const canOverride = market.status === 'resolved' && admin
  const canVoid = market.status === 'open' && (isCreator || admin)
  const showResolve = canResolve || canOverride

  const marketInSlip = market.outcomes.some((o) => slip.includes(o.id))
  const slipFull = slip.length >= MAX_PICKS && !marketInSlip

  const closedCopy =
    market.status === 'resolved' ? (
      <>
        This market resolved
        {market.resolvedAt && (
          <>
            {' '}
            on <LocalTime iso={market.resolvedAt} format="day" />
          </>
        )}{' '}
        and payouts have been sent.
      </>
    ) : market.status === 'voided' ? (
      'This market was voided, and every bet and parlay leg was refunded.'
    ) : (
      <>
        This market closed <LocalTime iso={market.closeAt} format="dateTime" /> and is awaiting resolution.
      </>
    )

  const manageHint = canOverride
    ? 'You’re an admin. A new outcome reverses the payouts and pays the new winners.'
    : !isCreator
      ? 'You’re an admin. Only admins and this market’s creator see this.'
      : canResolve
        ? 'You created this market. Only you and admins see this.'
        : 'You created this market. You can resolve it once it closes.'

  return (
    <ContentReveal>
      <SectionCard
        title="Outcomes"
        titleId="outcomes-title"
        action={<span className="text-sm text-ink2 tabular-nums">{totalPool} DC in the pool</span>}
        className="gap-1 lg:col-start-1 lg:row-start-2"
      >
        {canBet && slipFull && (
          <Message tone="gold" icon={Layers} id="slip-full-note" className="mt-2">
            Your slip is full ({MAX_PICKS} picks).{' '}
            <Link href="/parlays" className="text-inherit">
              Review slip
            </Link>
          </Message>
        )}
        <ul className="flex flex-col divide-y divide-line">
          {odds.map((o, index) => (
            <li key={o.outcomeId}>
              <OutcomeRow
                outcomeId={o.outcomeId}
                label={o.label}
                poolTotal={o.poolTotal}
                probability={o.impliedProbability}
                oddsBp={legOddsBp(totalPool, o.poolTotal)}
                series={outcomeSeries(market.kind, o.label, index)}
                state={rowState(o.outcomeId, o.poolTotal, { slip, canBet, slipFull })}
                winner={market.status === 'resolved' && o.label === market.resolvedOutcomeLabel}
                addAction={addToSlipAction.bind(null, o.outcomeId)}
                removeAction={removeFromSlipAction.bind(null, o.outcomeId)}
                disabledReasonId={slipFull ? 'slip-full-note' : undefined}
              />
            </li>
          ))}
        </ul>
      </SectionCard>

      <div className="flex flex-col gap-5 lg:col-start-2 lg:row-span-3 lg:row-start-1 lg:gap-7">
        {canBet ? (
          <SectionCard title="Place a bet" titleId="bet-title" className="gap-4">
            <BetForm marketId={market.id} outcomes={market.outcomes} />
          </SectionCard>
        ) : (
          <SectionCard title="Betting closed" titleId="closed-title" className="gap-2">
            <p className="text-ink2">{closedCopy}</p>
          </SectionCard>
        )}

        {(showResolve || canVoid) && (
          <SectionCard
            title={canOverride ? 'Override resolution' : 'Resolve market'}
            titleId="manage-title"
            className="gap-1"
          >
            <p className="text-sm text-ink2">{manageHint}</p>
            <div className="mt-3 flex flex-col gap-4">
              {showResolve && <ResolveForm marketId={market.id} outcomes={market.outcomes} />}
              {canVoid && (
                <VoidButton marketId={market.id} className={showResolve ? 'border-t border-line pt-4' : undefined} />
              )}
            </div>
          </SectionCard>
        )}
      </div>
    </ContentReveal>
  )
}

async function MarketBets({
  market,
  viewerId,
  canBet,
  page,
  searchParams,
}: {
  market: MarketDetail
  viewerId: string
  canBet: boolean
  page: PageParams
  searchParams: SearchParams
}) {
  const { supabase } = await requireUser()
  const betsPage = await getMarketBets(supabase, market.id, page)
  const pathname = `/markets/${market.id}`

  return (
    <ContentReveal>
      <SectionCard title="Bets" titleId="bets-title" className="gap-1 lg:col-start-1 lg:row-start-3">
        {betsPage.windowed && (
          <div className="flex flex-col py-2">
            <BackToNewest href={newestHref(pathname, searchParams, 'bets')} />
          </div>
        )}
        <BetList bets={betsPage.rows} outcomes={market.outcomes} viewerId={viewerId} canBet={canBet} />
        {betsPage.next && (
          <div className="flex flex-col border-t border-line pt-3">
            <ShowMore
              href={showMoreHref(pathname, searchParams, 'bets', betsPage.next)}
              fresh={betsPage.next.kind === 'window'}
            />
          </div>
        )}
      </SectionCard>
    </ContentReveal>
  )
}

async function MarketSlipDrawer({ slip }: { slip: string[] }) {
  const { supabase } = await requireUser()
  return <SlipDrawer slip={await getSlipView(supabase, slip)} />
}
