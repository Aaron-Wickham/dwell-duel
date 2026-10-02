import { Suspense } from 'react'
import Link from 'next/link'
import { redirect, notFound } from 'next/navigation'
import { ChevronDown, CopyPlus, Trophy } from 'lucide-react'
import { requireUser } from '@/lib/auth/require-user'
import { LiveTables } from '@/components/live/live-tables'
import { pageSubscriptions } from '@/lib/live/page-subscriptions'
import { atLeast, getRole } from '@/lib/auth/roles'
import { getMarket, type MarketDetail } from '@/lib/markets/get-market'
import { getResolutionProof } from '@/lib/markets/resolution-proof'
import { ProofList } from '@/components/proof/proof-list'
import { getChartSeries } from '@/lib/markets/chart-series'
import type { OutcomeOdds } from '@/lib/markets/odds'
import { marketOdds } from '@/lib/markets/pricing'
import { outcomeSeries } from '@/lib/markets/outcome-series'
import { chartClosedAt, marketCardStatus } from '@/lib/markets/market-status'
import { readPageParams } from '@/lib/pagination/cursor'
import { isUuid } from '@/lib/uuid'
import { readSlip } from '@/lib/parlays/slip'
import { BackLink } from '@/components/ui/back-link'
import { buttonVariants } from '@/components/ui/button'
import { LoadingStatus } from '@/components/ui/loading-status'
import { LocalTime } from '@/components/ui/local-time'
import { Message } from '@/components/ui/message'
import { Page, h1Class } from '@/components/ui/page'
import { SectionCard } from '@/components/ui/section-card'
import { StatusChip } from '@/components/ui/status-chip'
import { ContentReveal } from '@/components/nav/page-transition'
import { cn } from '@/lib/utils'
import {
  MarketActionsSkeleton,
  actionsPlacement,
  MarketBetsSkeleton,
  MarketChartSkeleton,
  MarketCommentsSkeleton,
  MarketOutcomesSkeleton,
  MarketPositionSkeleton,
} from '@/components/markets/market-detail-skeletons'
import { STATUS_LABEL, STATUS_TONE } from '@/components/markets/market-card'
import { ProbabilityChart } from '@/components/markets/probability-chart-lazy'
import { MarketBets } from './market-bets'
import { MarketComments } from './market-comments'
import { MarketOutcomes } from './market-outcomes'
import { MarketPosition } from './market-position'
import { getPositionKeys } from '@/lib/markets/position'
import { ResolveForm } from './resolve-form'
import { describeCreatorStake, getCreatorStakes } from '@/lib/markets/creator-stakes'
import { DeleteMarketButton } from './delete-market-button'
import { hasBetHistory } from '@/lib/markets/bet-history'
import { EditMarketDialog } from './edit-market-dialog'
import { ShareButton } from './share-button'
import { listMarketEdits } from '@/lib/markets/market-edits'
import { formatLine } from '@/lib/markets/kind'
import { listCategoryCounts, mostUsedCategories } from '@/lib/markets/categories'
import { CategoryChip } from '@/components/markets/category-chip'
import { VoidForm } from './void-form'

// No loading.tsx for this route (and the markets list's own loading.tsx sits in the (list)
// group, so it doesn't wrap this one): the market must be found before anything streams, so an
// unknown id still gets a real 404 status. Your position, the chart, the outcomes, the bet column,
// the bets and the comments each stream in behind their own skeleton.
export default async function MarketDetailPage(props: PageProps<'/markets/[id]'>) {
  const { id } = await props.params
  const searchParams = await props.searchParams
  const { supabase, user } = await requireUser()
  if (!user) redirect('/sign-in')
  if (!isUuid(id)) notFound()

  // The slip is only a cookie, so reading it here costs nothing.
  const [market, slipEntries] = await Promise.all([getMarket(supabase, id), readSlip()])
  if (!market) notFound()
  // The position keys are read before anything streams, so a viewer with nothing on the market gets
  // no card and no skeleton for one: a placeholder that then vanished would shift the page.
  const [resolution, edits, role, creatorStakes, positionKeys] = await Promise.all([
    market.status === 'resolved' ? getResolutionProof(supabase, market.id) : null,
    market.editedAt ? listMarketEdits(supabase, market.id) : [],
    getRole(supabase),
    getCreatorStakes(supabase, [{ id: market.id, createdBy: market.createdBy }]),
    getPositionKeys(supabase, market.id),
  ])
  const positionRows = positionKeys.betIds.length + positionKeys.parlayIds.length
  const creatorStake = describeCreatorStake(creatorStakes.get(market.id), market.status === 'open' ? 'has' : 'had')

  const odds = marketOdds(market)

  const isCreator = market.createdBy === user.id
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
  const canReopen = market.status === 'open' && isPastClose && (isCreator || admin)
  const canEditCategory = canEditWording || admin
  const categoryCounts = canEditCategory ? await listCategoryCounts(supabase) : []

  const cardStatus = marketCardStatus(market.status, market.closeAt, new Date(now))

  const when =
    market.status === 'resolved' && market.resolvedAt ? (
      <>
        Resolved <LocalTime iso={market.resolvedAt} format="day" /> ·{' '}
      </>
    ) : market.status === 'voided' && market.settledAt ? (
      <>
        Voided <LocalTime iso={market.settledAt} format="day" /> ·{' '}
      </>
    ) : market.status === 'open' ? (
      <>
        {isPastClose ? 'Closed' : 'Closes'} <LocalTime iso={market.closeAt} format="dateTime" /> ·{' '}
      </>
    ) : null

  return (
    <Page transition="drill-down">
      <LiveTables subscriptions={pageSubscriptions.marketDetail(market.id, user.id)} />
      <BackLink href="/markets">Markets</BackLink>

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <StatusChip tone={STATUS_TONE[cardStatus]}>{STATUS_LABEL[cardStatus]}</StatusChip>
          {market.kind === 'over_under' && market.line !== null && (
            <StatusChip tone="void">Over/Under {formatLine(market.line)}</StatusChip>
          )}
          {market.category && <CategoryChip name={market.category.name} />}
          <span className="text-sm text-ink2">
            {when}Created by {isCreator ? 'you' : market.creatorName}
          </span>
        </div>
        <h1 className={`${h1Class} break-words`}>{market.title}</h1>
        {creatorStake && (
          <p className="text-sm font-bold text-ink2">
            {isCreator ? creatorStake.replace('Creator has', 'You have').replace('Creator had', 'You had') : creatorStake}
          </p>
        )}
        {market.description && <p className="max-w-[68ch] whitespace-pre-line break-words text-ink2">{market.description}</p>}
        {edits.length > 0 && (
          <details className="group max-w-[68ch] text-sm text-ink2">
            {/* inline-flex drops the browser's disclosure marker, so the chevron says this opens. */}
            <summary className="pressable inline-flex min-h-11 cursor-pointer items-center gap-1 font-bold">
              <span>
                Edited <LocalTime iso={edits[0].editedAt} format="dateTime" />
              </span>
              <ChevronDown
                aria-hidden="true"
                className="size-4 shrink-0 transition-transform duration-(--duration-fast) group-open:rotate-180 motion-reduce:transition-none"
              />
            </summary>
            <ol className="mt-1 flex flex-col gap-3">
              {edits.map((e) => (
                <li key={e.id} className="flex flex-col gap-1 border-l-2 border-line pl-3">
                  <span>
                    {e.editorName}, <LocalTime iso={e.editedAt} format="dateTime" />
                  </span>
                  {e.oldTitle !== e.newTitle && (
                    <span className="break-words">
                      Title was: <span className="text-ink">“{e.oldTitle}”</span>
                    </span>
                  )}
                  {e.oldCategory !== null && (
                    <span className="break-words">
                      Category was: <span className="text-ink">{e.oldCategory}</span>
                    </span>
                  )}
                  {e.oldCloseAt !== null && e.newCloseAt !== null && (
                    <span>
                      Close time moved from <span className="text-ink"><LocalTime iso={e.oldCloseAt} format="dateTime" /></span> to{' '}
                      <span className="text-ink"><LocalTime iso={e.newCloseAt} format="dateTime" /></span>
                    </span>
                  )}
                  {e.oldDescription !== e.newDescription && (
                    <span className="whitespace-pre-line break-words">
                      Description was: <span className="text-ink">{e.oldDescription ? `“${e.oldDescription}”` : '(none)'}</span>
                    </span>
                  )}
                </li>
              ))}
            </ol>
          </details>
        )}
        <div className="flex flex-wrap gap-2">
          {canEditCategory && (
            <EditMarketDialog
              marketId={market.id}
              title={market.title}
              description={market.description}
              category={market.category?.name ?? ''}
              closeAt={market.closeAt}
              mode={canEditWording ? 'edit' : 'category'}
              suggestions={categoryCounts.map((c) => c.name)}
              popular={mostUsedCategories(categoryCounts).map((c) => c.name)}
            />
          )}
          {canReopen && (
            <EditMarketDialog
              marketId={market.id}
              title={market.title}
              description={market.description}
              category={market.category?.name ?? ''}
              closeAt={market.closeAt}
              mode="reopen"
              suggestions={[]}
              popular={[]}
            />
          )}
          <ShareButton marketId={market.id} title={market.title} />
          {/* Every member can create markets, so anyone can start a copy; nothing exists until it's submitted. */}
          <Link
            href={`/markets/new?from=${market.id}`}
            transitionTypes={['nav-forward']}
            className={buttonVariants({ variant: 'secondary', size: 'sm' })}
          >
            <CopyPlus aria-hidden="true" className="size-[18px]" />
            Duplicate
          </Link>
        </div>
        {market.status === 'resolved' && market.resolvedOutcomeLabel && (
          <Message tone="ok" icon={Trophy} className="self-start">
            {market.actualValue !== null && <>Actual: {market.actualValue} · </>}
            Winning outcome: {market.resolvedOutcomeLabel}
          </Message>
        )}
        {resolution && (resolution.note || resolution.proof.length > 0 || resolution.previous) && (
          <section aria-label="Why it resolved this way" className="flex max-w-[68ch] flex-col gap-3">
            {resolution.note && <p className="whitespace-pre-line break-words">{resolution.note}</p>}
            <ProofList proof={resolution.proof} label="Resolution proof" />
            {resolution.previous && (
              <div className="flex flex-col gap-2 text-sm text-ink2">
                <p>
                  Changed from <strong className="text-ink">{resolution.previous.outcomeLabel}</strong>
                  {resolution.previous.note ? <>. Earlier reason: “{resolution.previous.note}”</> : '.'}
                </p>
                <ProofList proof={resolution.previous.proof} label="Earlier resolution proof" />
              </div>
            )}
          </section>
        )}
        {market.status === 'voided' && market.voidReason && (
          <section aria-label="Why it was voided" className="flex max-w-[68ch] flex-col gap-3">
            <p className="whitespace-pre-line break-words">{market.voidReason}</p>
          </section>
        )}
      </div>

      {/* Each section's fallback carries the same grid placement as the section itself. The
          fallbacks announce nothing themselves (SkeletonScreen announce={false});
          LoadingStatus wraps them in one combined status, scoped to just these, for as
          long as any of them is still showing.
          On a phone it's one column, Your position first. From lg the left column stacks the chart
          and outcomes (rows 1-2) over bets and comments (row 3). On the right, Your position takes
          row 1 and the bet column rows 2-3; with no card the bet column takes rows 1-3 instead,
          since an empty row 1 would get half the chart's height. Spacing is margins, not a row
          gap. Rows are shared, so a card taller than the chart and outcomes together pushes the
          bets down to its bottom; a member rarely has that many bets on one market. */}
      <LoadingStatus>
        <div className="flex flex-col gap-5 lg:grid lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:grid-rows-[auto_auto_1fr] lg:items-start lg:gap-x-7 lg:gap-y-0">
          {positionRows > 0 && (
            <Suspense fallback={<MarketPositionSkeleton rows={positionRows} />}>
              <MarketPosition market={market} keys={positionKeys} now={now} />
            </Suspense>
          )}
          <div className="flex flex-col gap-5 lg:col-start-1 lg:row-span-2 lg:row-start-1 lg:mb-7 lg:gap-7">
            <Suspense fallback={<MarketChartSkeleton />}>
              <MarketChart market={market} odds={odds} now={now} />
            </Suspense>
            <Suspense fallback={<MarketOutcomesSkeleton outcomes={market.outcomes.length} />}>
              <MarketOutcomes market={market} odds={odds} slip={slip} canBet={canBet} />
            </Suspense>
          </div>
          <Suspense fallback={<MarketActionsSkeleton hasPosition={positionRows > 0} />}>
            <MarketActions market={market} odds={odds} isCreator={isCreator} canBet={canBet} hasPosition={positionRows > 0} />
          </Suspense>
          <div className="flex flex-col gap-5 lg:col-start-1 lg:row-start-3 lg:gap-7">
            <Suspense fallback={<MarketBetsSkeleton />}>
              <MarketBets
                market={market}
                viewerId={user.id}
                canBet={canBet}
                page={readPageParams(searchParams, 'bets')}
                searchParams={searchParams}
              />
            </Suspense>
            <Suspense fallback={<MarketCommentsSkeleton />}>
              <MarketComments
                marketId={market.id}
                viewerId={user.id}
                page={readPageParams(searchParams, 'comments')}
                searchParams={searchParams}
              />
            </Suspense>
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
      <SectionCard title="Chance over time" titleId="chart-title" className="gap-3">
        <ProbabilityChart
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

async function MarketActions({
  market,
  odds,
  isCreator,
  canBet,
  hasPosition,
}: {
  market: MarketDetail
  odds: OutcomeOdds[]
  isCreator: boolean
  canBet: boolean
  hasPosition: boolean
}) {
  const { supabase, user } = await requireUser()
  const [role, resolvable, voidable, stake] = await Promise.all([
    getRole(supabase),
    supabase.rpc('can_resolve_market', { p_market_id: market.id }),
    supabase.rpc('can_void_market', { p_market_id: market.id }),
    supabase.rpc('has_stake_in_market', { p_market_id: market.id, p_profile_id: user!.id }),
  ])
  if (resolvable.error) throw resolvable.error
  if (voidable.error) throw voidable.error
  if (stake.error) throw stake.error
  const admin = atLeast(role, 'admin')
  const hasStake = stake.data === true

  const totalPool = odds.reduce((sum, o) => sum + o.poolTotal, 0)
  // can_resolve_market (0046) is the same rule resolve_market enforces: after close, the creator or
  // a reviewer with no stake in the market; an admin at any time.
  const canResolve = market.status === 'open' && resolvable.data === true
  const canOverride = market.status === 'resolved' && admin
  // can_void_market (0105) is the same rule void_market enforces: an admin at any time; the creator
  // until the market closes, and only with no stake in it (0104).
  const canVoid = market.status === 'open' && voidable.data === true
  // delete_market (0040) refuses a market with bets, cancelled bets or parlay legs. An empty pool is
  // the cheap first check; only the owner of an empty market pays for the other two (#221).
  const canDelete = role === 'owner' && totalPool === 0 && !(await hasBetHistory(supabase, market.id))
  const showResolve = canResolve || canOverride
  const hasControls = showResolve || canVoid || canDelete
  // A creator with a stake can neither resolve nor void, so the card stays only to say who will.
  const explainStake = market.status === 'open' && isCreator && hasStake && !admin

  const closedCopy =
    market.status === 'resolved' ? (
      <>
        This market resolved
        {market.resolvedAt && (
          <>
            {' '}
            on <LocalTime iso={market.resolvedAt} format="day" />
          </>
        )}
        . Solo bets have been paid; parlays pay once every pick has settled.
      </>
    ) : market.status === 'voided' ? (
      'This market was voided. Every bet was refunded, and parlays dropped this leg and carried on with the rest (a parlay with no legs left was refunded).'
    ) : (
      <>
        This market closed <LocalTime iso={market.closeAt} format="dateTime" /> and is awaiting resolution.
      </>
    )

  // Explains why this card shows, and anything it can't do yet.
  const youAre = role === 'owner' ? 'You’re the owner.' : admin ? 'You’re an admin.' : 'You’re a reviewer.'
  const manageHint = canOverride
    ? `${youAre} A new outcome reverses the payouts and pays the new winners.`
    : market.status !== 'open'
      ? `${youAre} This market can only be deleted now.`
      : canResolve
        ? hasStake
          ? `${youAre} You have a stake in this market, but an admin can still resolve it.`
          : canBet
            ? `${youAre} An admin can resolve a market before it closes.`
            : isCreator
              ? 'You created this market, and it has closed. Reviewers and admins can resolve it too.'
              : `${youAre} This market has closed and is awaiting resolution.`
        : isCreator && hasStake
          ? 'You have a stake in this market, so a reviewer or an admin resolves it, and only an admin can void it.'
          : isCreator
            ? 'You created this market. You can resolve it once it closes.'
            : `${youAre} You can resolve it once it closes.`

  return (
    <ContentReveal>
      <div className={cn('flex flex-col gap-5 lg:col-start-2 lg:gap-7', actionsPlacement(hasPosition))}>
        {canBet ? (
          <SectionCard title="Place a bet" titleId="bet-title" className="gap-2">
            <p className="text-ink2">
              Add an outcome to your slip, then set your stake and place it from the slip. Picks from
              different markets can be combined into one parlay there.
            </p>
          </SectionCard>
        ) : (
          <SectionCard title="No more bets" titleId="closed-title" className="gap-2">
            <p className="text-ink2">{closedCopy}</p>
          </SectionCard>
        )}

        {(hasControls || explainStake) && (
          <SectionCard
            title={canOverride ? 'Override resolution' : showResolve ? 'Resolve market' : 'Manage market'}
            titleId="manage-title"
            className="gap-1"
          >
            <p className="text-sm text-ink2">{manageHint}</p>
            {hasControls && (
              <div className="mt-3 flex flex-col gap-4">
                {showResolve && (
                  <ResolveForm
                    marketId={market.id}
                    outcomes={market.outcomes}
                    line={market.kind === 'over_under' ? market.line : null}
                    override={canOverride}
                    currentOutcomeId={market.resolvedOutcomeId}
                  />
                )}
                {canVoid && (
                  <VoidForm marketId={market.id} className={showResolve ? 'border-t border-line pt-4' : undefined} />
                )}
                {canDelete && (
                  <div className={showResolve || canVoid ? 'border-t border-line pt-4' : undefined}>
                    <DeleteMarketButton marketId={market.id} />
                  </div>
                )}
              </div>
            )}
          </SectionCard>
        )}
      </div>
    </ContentReveal>
  )
}
