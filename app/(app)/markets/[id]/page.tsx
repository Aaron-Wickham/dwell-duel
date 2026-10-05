import type { DbClient } from '@/lib/supabase/database'
import { Suspense } from 'react'
import { redirect, notFound } from 'next/navigation'
import { requireUser } from '@/lib/auth/require-user'
import { LiveTables } from '@/components/live/live-tables'
import { renderStamp } from '@/lib/live/render-stamp'
import { pageSubscriptions } from '@/lib/live/page-subscriptions'
import { atLeast, getRole } from '@/lib/auth/roles'
import { getMarket, type MarketDetail } from '@/lib/markets/get-market'
import { getResolutionProof } from '@/lib/markets/resolution-proof'
import { getChartSeries } from '@/lib/markets/chart-series'
import type { OutcomeOdds } from '@/lib/markets/odds'
import { marketOdds } from '@/lib/markets/pricing'
import { chartTitle, outcomeSeries } from '@/lib/markets/outcome-series'
import { chartClosedAt } from '@/lib/markets/market-status'
import { readPageParams } from '@/lib/pagination/cursor'
import { isUuid } from '@/lib/uuid'
import { readSlip } from '@/lib/parlays/slip'
import { BackLink } from '@/components/ui/back-link'
import { LoadingStatus } from '@/components/ui/loading-status'
import { LocalTime } from '@/components/ui/local-time'
import { Page, h1Class } from '@/components/ui/page'
import { SectionCard } from '@/components/ui/section-card'
import { ContentReveal } from '@/components/nav/page-transition'
import { cn } from '@/lib/utils'
import {
  MarketBetsSkeleton,
  MarketChartSkeleton,
  MarketCommentsSkeleton,
  MarketOutcomesSkeleton,
  MarketPositionSkeleton,
} from '@/components/markets/market-detail-skeletons'
import { ProbabilityChart } from '@/components/markets/probability-chart-lazy'
import { MarketBets } from './market-bets'
import { MarketComments } from './market-comments'
import { MarketManage, hasManageCards, type ManageRights } from './market-manage'
import { MarketMenu } from './market-menu'
import { MarketOutcomes } from './market-outcomes'
import { MarketPosition } from './market-position'
import { getPositionKeys } from '@/lib/markets/position'
import { describeMarketStake, getCreatorStakes } from '@/lib/markets/creator-stakes'
import { hasBetHistory } from '@/lib/markets/bet-history'
import { listMarketEdits } from '@/lib/markets/market-edits'
import { listCategoryCounts, mostUsedCategories } from '@/lib/markets/categories'

// No loading.tsx for this route (and the markets list's own loading.tsx sits in the (list)
// group, so it doesn't wrap this one): the market must be found before anything streams, so an
// unknown id still gets a real 404 status. Your position, the chart, the outcomes, the bets and
// the comments each stream in behind their own skeleton.
export default async function MarketDetailPage(props: PageProps<'/markets/[id]'>) {
  const { id } = await props.params
  const searchParams = await props.searchParams
  const { supabase, user } = await requireUser()
  if (!user) redirect('/sign-in')
  if (!isUuid(id)) notFound()

  // The slip is only a cookie, so reading it here costs nothing.
  const [market, slipEntries] = await Promise.all([getMarket(supabase, id), readSlip()])
  if (!market) notFound()
  const isCreator = market.createdBy === user.id
  // The position keys and the viewer's rights are read before anything streams, so a viewer with
  // nothing on the market gets no card and no skeleton for one, and the resolve and void cards
  // take their place straight away: a placeholder that then vanished would shift the page.
  const [resolution, edits, role, creatorStakes, positionKeys, categoryCounts, resolvable, voidable, stake] = await Promise.all([
    market.status === 'resolved' ? getResolutionProof(supabase, market.id) : null,
    market.editedAt ? listMarketEdits(supabase, market.id) : [],
    getRole(supabase),
    getCreatorStakes(supabase, [{ id: market.id, createdBy: market.createdBy }]),
    getPositionKeys(supabase, market.id),
    listCategoryCounts(supabase),
    rpcFlag(supabase.rpc('can_resolve_market', { p_market_id: market.id })),
    rpcFlag(supabase.rpc('can_void_market', { p_market_id: market.id })),
    rpcFlag(supabase.rpc('has_stake_in_market', { p_market_id: market.id, p_profile_id: user.id })),
  ])
  const positionRows = positionKeys.betIds.length + positionKeys.parlayIds.length

  const odds = marketOdds(market)

  // Server Components render once per request with no re-render/
  // reconciliation cycle for React to keep consistent across -- the
  // purity rule protects Client Components from that, which doesn't
  // apply here, and this page already does non-deterministic async DB
  // reads (getMarket, readSlip) on every invocation regardless.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now()
  const isPastClose = new Date(market.closeAt).getTime() <= now
  const canBet = market.status === 'open' && !isPastClose
  const slip = slipEntries.map((e) => e.outcomeId)
  // update_market (0043, 0103, 0106): the creator or an admin rewords a market, or moves its close,
  // while it still takes bets, and can reopen it once it has closed until it's settled; an admin can
  // change its category at any time.
  const admin = atLeast(role, 'admin')
  const canEditWording = canBet && (isCreator || admin)
  // can_move_market_close (0106) is update_market's close-time rule: a creator with a stake asks an admin.
  const canMoveClose = market.status === 'open' && (isCreator || admin) && (await canMoveMarketClose(supabase, market.id))
  const canReopen = isPastClose && canMoveClose
  const canEditCategory = canEditWording || admin

  const totalPool = odds.reduce((sum, o) => sum + o.poolTotal, 0)
  const rights: ManageRights = {
    canResolve: market.status === 'open' && resolvable,
    canOverride: market.status === 'resolved' && admin,
    canVoid: market.status === 'open' && voidable,
    // delete_market (0040) refuses a market with bets, cancelled bets or parlay legs. An empty pool
    // is the cheap first check; only the owner of an empty market pays for the other two (#221).
    canDelete: role === 'owner' && totalPool === 0 && !(await hasBetHistory(supabase, market.id)),
    hasStake: stake,
    admin,
  }
  const manage = hasManageCards(rights)
  // Waiting on its result, the viewer's one job here is to resolve it, so on a phone the cards come
  // straight after the outcomes and the position, not under every bet and comment (CR-A12).
  const manageFirst = market.status === 'open' && isPastClose
  // The rail holds still beside a long chart, bets and comments, unless it carries the resolve or
  // void forms, which could be taller than the screen and then never show their bottom.
  const stickyRail = !manage

  // What the creator has riding on it, shown to every member, since in a small group trust in the
  // result matters most (#84); to the creator, also who settles it when their stake stops them (0046, 0104).
  const creatorStake = describeMarketStake(
    creatorStakes.get(market.id),
    isCreator ? null : market.creatorName,
    market.status === 'open',
  )
  const stakeBlocks = isCreator && market.status === 'open' && stake && !admin
  // #387: a category is worth naming only when more than one holds markets.
  const severalCategories = categoryCounts.filter((c) => c.markets > 0).length > 1

  const when =
    market.status === 'resolved' && market.resolvedAt ? (
      <>
        Resolved <LocalTime iso={market.resolvedAt} format="day" />
      </>
    ) : market.status === 'voided' && market.settledAt ? (
      <>
        Called off <LocalTime iso={market.settledAt} format="day" />
      </>
    ) : market.status === 'open' ? (
      <>
        {isPastClose ? 'Closed' : 'Closes'} <LocalTime iso={market.closeAt} format="dateTime" />
      </>
    ) : null

  return (
    <Page transition="drill-down">
      <LiveTables subscriptions={pageSubscriptions.marketDetail(market.id, user.id, market.category?.id ?? null)} renderedAt={renderStamp()} />

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-x-3">
          <BackLink href="/markets">Markets</BackLink>
          <MarketMenu
            marketId={market.id}
            title={market.title}
            edit={{
              description: market.description,
              category: market.category?.name ?? '',
              closeAt: market.closeAt,
              mode: canEditWording ? 'edit' : canEditCategory ? 'category' : null,
              canMoveClose,
              canReopen,
              suggestions: categoryCounts.map((c) => c.name),
              popular: mostUsedCategories(categoryCounts).map((c) => c.name),
            }}
            edits={edits}
          />
        </div>
        <div className="flex flex-col gap-2">
          <h1 className={`${h1Class} break-words`}>{market.title}</h1>
          <p className="text-sm text-ink2">
            {when && <>{when} · </>}by {isCreator ? 'you' : market.creatorName}
            {severalCategories && market.category && <> · {market.category.name}</>}
          </p>
          {creatorStake && (
            <p className="text-sm font-bold text-ink2">
              {creatorStake}
              {stakeBlocks && ' A reviewer or an admin resolves it, and only an admin can call it off.'}
            </p>
          )}
          {market.description && <p className="max-w-[68ch] whitespace-pre-line break-words text-ink2">{market.description}</p>}
        </div>
      </div>

      {/* Each section's fallback holds its section's place. The fallbacks announce nothing
          themselves (SkeletonScreen announce={false}); LoadingStatus wraps them in one combined
          status, scoped to just these, for as long as any of them is still showing.
          From lg: the chart, comments and bets on the left; on the right a rail with the outcomes,
          Your position and any resolve or void cards. The rail comes first in the markup, since
          betting is the page's job (#390). On a phone both columns are display: contents, so every
          section is one flex column, ordered: outcomes, chart, position, (resolve and void while
          the market waits on a result), comments, bets, then any other cards. */}
      <LoadingStatus>
        <div className="flex flex-col gap-5 lg:grid lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-start lg:gap-7">
          <div
            className={cn(
              'contents lg:col-start-2 lg:row-start-1 lg:flex lg:flex-col lg:gap-7',
              stickyRail && 'lg:sticky lg:top-[calc(72px+var(--safe-top)+24px)]',
            )}
          >
            <div className="order-1 lg:order-none">
              <Suspense fallback={<MarketOutcomesSkeleton outcomes={market.outcomes.length} canBet={canBet} />}>
                <MarketOutcomes market={market} odds={odds} slip={slip} canBet={canBet} resolution={resolution} />
              </Suspense>
            </div>
            {positionRows > 0 && (
              <div className="order-3 lg:order-none">
                <Suspense fallback={<MarketPositionSkeleton rows={positionRows} />}>
                  <MarketPosition market={market} keys={positionKeys} now={now} />
                </Suspense>
              </div>
            )}
            {manage && (
              <div className={cn('flex flex-col gap-5 lg:order-none lg:gap-7', manageFirst ? 'order-4' : 'order-7')}>
                <MarketManage market={market} rights={rights} canBet={canBet} />
              </div>
            )}
          </div>
          <div className="contents lg:col-start-1 lg:row-start-1 lg:flex lg:flex-col lg:gap-7">
            <div className="order-2 lg:order-none">
              <Suspense fallback={<MarketChartSkeleton />}>
                <MarketChart market={market} odds={odds} now={now} />
              </Suspense>
            </div>
            <div className="order-5 lg:order-none">
              <Suspense fallback={<MarketCommentsSkeleton />}>
                <MarketComments
                  marketId={market.id}
                  viewerId={user.id}
                  page={readPageParams(searchParams, 'comments')}
                  searchParams={searchParams}
                />
              </Suspense>
            </div>
            <div className="order-6 lg:order-none">
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
          </div>
        </div>
      </LoadingStatus>
    </Page>
  )
}

async function MarketChart({ market, odds, now }: { market: MarketDetail; odds: OutcomeOdds[]; now: number }) {
  const { supabase } = await requireUser()
  const chartOutcomes = odds.map((o, index) => ({
    id: o.outcomeId,
    label: o.label,
    series: outcomeSeries(market.kind, o.label, index),
  }))
  const chart = await getChartSeries(supabase, {
    id: market.id,
    seedPerOutcome: market.seedPerOutcome,
    pricing: market.pricing,
    createdAt: market.createdAt,
    outcomeIds: chartOutcomes.map((o) => o.id),
  })

  return (
    <ContentReveal>
      <SectionCard title={chartTitle(market.kind, odds)} titleId="chart-title" className="gap-3">
        <ProbabilityChart
          kind={market.kind}
          outcomes={chartOutcomes}
          points={chart.points}
          betCount={chart.betCount}
          now={now}
          closedAt={chartClosedAt(market.status, market.closeAt, market.settledAt)}
          resolvedLabel={market.status === 'resolved' ? market.resolvedOutcomeLabel : null}
        />
      </SectionCard>
    </ContentReveal>
  )
}

async function rpcFlag(call: PromiseLike<{ data: boolean | null; error: unknown }>): Promise<boolean> {
  const { data, error } = await call
  if (error) throw error
  return data === true
}

async function canMoveMarketClose(supabase: DbClient, marketId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('can_move_market_close', { p_market_id: marketId })
  if (error) throw error
  return data === true
}
