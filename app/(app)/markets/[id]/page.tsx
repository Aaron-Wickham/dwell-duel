import { Suspense } from 'react'
import Link from 'next/link'
import { redirect, notFound } from 'next/navigation'
import { CopyPlus, Ticket, Trophy } from 'lucide-react'
import { requireUser } from '@/lib/auth/require-user'
import { LiveTables } from '@/components/live/live-tables'
import { pageSubscriptions } from '@/lib/live/page-subscriptions'
import { atLeast, getRole } from '@/lib/auth/roles'
import { getMarket, type MarketDetail } from '@/lib/markets/get-market'
import { getResolutionProof } from '@/lib/markets/resolution-proof'
import { ProofList } from '@/components/proof/proof-list'
import { getChartSeries } from '@/lib/markets/chart-series'
import { computeOdds, effectivePools, type OutcomeOdds } from '@/lib/markets/odds'
import { outcomeSeries } from '@/lib/markets/outcome-series'
import { chartClosedAt } from '@/lib/markets/market-status'
import { rowState } from '@/lib/markets/row-state'
import { readPageParams } from '@/lib/pagination/cursor'
import { isUuid } from '@/lib/uuid'
import { readSlip } from '@/lib/parlays/slip'
import { legOddsBp } from '@/lib/parlays/odds'
import { MAX_SLIP_PICKS, SLIP_FULL_MESSAGE } from '@/lib/parlays/parse-slip'
import { addToSlipAction, removeFromSlipAction } from '@/lib/parlays/slip-actions'
import { BackLink } from '@/components/ui/back-link'
import { buttonVariants } from '@/components/ui/button'
import { LoadingStatus } from '@/components/ui/loading-status'
import { LocalTime } from '@/components/ui/local-time'
import { Message } from '@/components/ui/message'
import { Page, h1Class } from '@/components/ui/page'
import { SectionCard } from '@/components/ui/section-card'
import { StatusChip } from '@/components/ui/status-chip'
import { ContentReveal } from '@/components/nav/page-transition'
import {
  MarketActionsSkeleton,
  MarketBetsSkeleton,
  MarketChartSkeleton,
  MarketCommentsSkeleton,
} from '@/components/markets/market-detail-skeletons'
import { OutcomeRow } from '@/components/markets/outcome-row'
import { ProbabilityChart } from '@/components/markets/probability-chart'
import { MarketBets } from './market-bets'
import { MarketComments } from './market-comments'
import { ResolveForm } from './resolve-form'
import { describeCreatorStake, getCreatorStakes } from '@/lib/markets/creator-stakes'
import { DeleteMarketButton } from './delete-market-button'
import { hasBetHistory } from '@/lib/markets/bet-history'
import { EditMarketDialog } from './edit-market-dialog'
import { ShareButton } from './share-button'
import { listMarketEdits } from '@/lib/markets/market-edits'
import { formatLine } from '@/lib/markets/kind'
import { VoidButton } from './void-button'

// No loading.tsx for this route (and the markets list's own loading.tsx sits in the (list)
// group, so it doesn't wrap this one): the market must be found before anything streams, so an
// unknown id still gets a real 404 status. The chart, the outcomes and bet column, the bets and
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
  const [resolution, edits, role, creatorStakes] = await Promise.all([
    market.status === 'resolved' ? getResolutionProof(supabase, market.id) : null,
    market.editedAt ? listMarketEdits(supabase, market.id) : [],
    getRole(supabase),
    getCreatorStakes(supabase, [{ id: market.id, createdBy: market.createdBy }]),
  ])
  const creatorStake = describeCreatorStake(creatorStakes.get(market.id), market.status === 'open' ? 'has' : 'had')

  const odds = computeOdds(
    market.outcomes.map((o) => ({ id: o.id, label: o.label, pool_total: o.poolTotal })),
    market.seedPerOutcome,
  )

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
  // update_market (0043): the creator or an admin, while the market still takes bets.
  const canEdit = canBet && (isCreator || atLeast(role, 'admin'))

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
      <LiveTables subscriptions={pageSubscriptions.marketDetail(market.id)} />
      <BackLink href="/markets">Markets</BackLink>

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <StatusChip tone={statusTone}>
            Status: {market.status === 'open' && isPastClose ? 'awaiting resolution' : market.status}
          </StatusChip>
          {market.kind === 'over_under' && market.line !== null && (
            <StatusChip tone="void">Over/Under {formatLine(market.line)}</StatusChip>
          )}
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
        {market.description && <p className="max-w-[68ch] whitespace-pre-line text-ink2">{market.description}</p>}
        {edits.length > 0 && (
          <details className="max-w-[68ch] text-sm text-ink2">
            <summary className="pressable inline-flex min-h-11 cursor-pointer items-center font-bold">
              Edited <LocalTime iso={edits[0].editedAt} format="dateTime" />
            </summary>
            <ol className="mt-1 flex flex-col gap-3">
              {edits.map((e) => (
                <li key={e.id} className="flex flex-col gap-1 border-l-2 border-line pl-3">
                  <span>
                    {e.editorName}, <LocalTime iso={e.editedAt} format="dateTime" />
                  </span>
                  {e.oldTitle !== e.newTitle && (
                    <span>
                      Title was: <span className="text-ink">“{e.oldTitle}”</span>
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
          {canEdit && <EditMarketDialog marketId={market.id} title={market.title} description={market.description} />}
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
      </div>

      {/* Each section's fallback carries the same grid placement as the section itself. The
          fallbacks announce nothing themselves (SkeletonScreen announce={false});
          LoadingStatus wraps them in one combined status, scoped to just these, for as
          long as any of them is still showing. */}
      <LoadingStatus>
        <div className="flex flex-col gap-5 lg:grid lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:grid-rows-[auto_auto_auto_1fr] lg:items-start lg:gap-7">
          <Suspense fallback={<MarketChartSkeleton />}>
            <MarketChart market={market} odds={odds} now={now} />
          </Suspense>
          <Suspense fallback={<MarketActionsSkeleton outcomes={market.outcomes.length} />}>
            <MarketActions
              market={market}
              odds={odds}
              slip={slip}
              isCreator={isCreator}
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
          <Suspense fallback={<MarketCommentsSkeleton />}>
            <MarketComments
              marketId={market.id}
              viewerId={user.id}
              page={readPageParams(searchParams, 'comments')}
              searchParams={searchParams}
            />
          </Suspense>
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
    createdAt: market.createdAt,
    outcomeIds: chartOutcomes.map((o) => o.id),
  })

  return (
    <ContentReveal>
      <SectionCard title="Chance over time" titleId="chart-title" className="gap-3 lg:col-start-1 lg:row-start-1">
        <ProbabilityChart
          outcomes={chartOutcomes}
          points={chart.points}
          betCount={chart.betCount}
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
  canBet,
}: {
  market: MarketDetail
  odds: OutcomeOdds[]
  slip: string[]
  isCreator: boolean
  canBet: boolean
}) {
  const { supabase, user } = await requireUser()
  const [role, resolvable, stake] = await Promise.all([
    getRole(supabase),
    supabase.rpc('can_resolve_market', { p_market_id: market.id }),
    supabase.rpc('has_stake_in_market', { p_market_id: market.id, p_profile_id: user!.id }),
  ])
  if (resolvable.error) throw resolvable.error
  if (stake.error) throw stake.error
  const admin = atLeast(role, 'admin')
  const hasStake = stake.data === true

  const totalPool = odds.reduce((sum, o) => sum + o.poolTotal, 0)
  // can_resolve_market (0046) is the same rule resolve_market enforces: after close, the creator or
  // a reviewer with no stake in the market; an admin at any time.
  const canResolve = market.status === 'open' && resolvable.data === true
  const canOverride = market.status === 'resolved' && admin
  const canVoid = market.status === 'open' && (isCreator || admin)
  // delete_market (0040) refuses a market with bets, cancelled bets or parlay legs. An empty pool is
  // the cheap first check; only the owner of an empty market pays for the other two (#221).
  const canDelete = role === 'owner' && totalPool === 0 && !(await hasBetHistory(supabase, market.id))
  const showResolve = canResolve || canOverride

  const marketInSlip = market.outcomes.some((o) => slip.includes(o.id))
  const slipFull = slip.length >= MAX_SLIP_PICKS && !marketInSlip

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
          ? 'You bet on this market, so a reviewer or an admin resolves it.'
          : isCreator
            ? 'You created this market. You can resolve it once it closes.'
            : `${youAre} You can resolve it once it closes.`

  return (
    <ContentReveal>
      <SectionCard
        title="Outcomes"
        titleId="outcomes-title"
        action={<span className="text-sm text-ink2 tabular-nums">{totalPool} DC in the pool</span>}
        className="gap-1 lg:col-start-1 lg:row-start-2"
      >
        {canBet && slipFull && (
          <Message tone="gold" icon={Ticket} id="slip-full-note" className="mt-2">
            {SLIP_FULL_MESSAGE}
          </Message>
        )}
        <ul className="flex flex-col divide-y divide-line">
          {odds.map((o, index) => {
            const effective = effectivePools(o.poolTotal, totalPool, market.seedPerOutcome, odds.length)
            const oddsBp = legOddsBp(effective.total, effective.pool)
            return (
            <li key={o.outcomeId}>
              <OutcomeRow
                label={o.label}
                poolTotal={o.poolTotal}
                probability={o.impliedProbability}
                oddsBp={oddsBp}
                series={outcomeSeries(market.kind, o.label, index)}
                state={rowState(o.outcomeId, { slip, canBet, slipFull })}
                winner={market.status === 'resolved' && o.label === market.resolvedOutcomeLabel}
                slipPick={{
                  outcomeId: o.outcomeId,
                  outcomeLabel: o.label,
                  marketId: market.id,
                  marketTitle: market.title,
                  parlay: false,
                  open: canBet,
                  oddsBp,
                  outcomePool: effective.pool,
                  totalPool: effective.total,
                }}
                addAction={addToSlipAction.bind(null, o.outcomeId)}
                removeAction={removeFromSlipAction.bind(null, o.outcomeId)}
                disabledReasonId={slipFull ? 'slip-full-note' : undefined}
              />
            </li>
            )
          })}
        </ul>
      </SectionCard>

      <div className="flex flex-col gap-5 lg:col-start-2 lg:row-span-4 lg:row-start-1 lg:gap-7">
        {canBet ? (
          <SectionCard title="Place a bet" titleId="bet-title" className="gap-2">
            <p className="text-ink2">
              Add an outcome to your slip, then set your stake and place it from the slip. Picks from
              different markets can be combined into one parlay there.
            </p>
          </SectionCard>
        ) : (
          <SectionCard title="Betting closed" titleId="closed-title" className="gap-2">
            <p className="text-ink2">{closedCopy}</p>
          </SectionCard>
        )}

        {(showResolve || canVoid || canDelete) && (
          <SectionCard
            title={canOverride ? 'Override resolution' : showResolve ? 'Resolve market' : 'Manage market'}
            titleId="manage-title"
            className="gap-1"
          >
            <p className="text-sm text-ink2">{manageHint}</p>
            <div className="mt-3 flex flex-col gap-4">
              {showResolve && (
                <ResolveForm
                  marketId={market.id}
                  outcomes={market.outcomes}
                  line={market.kind === 'over_under' ? market.line : null}
                  override={canOverride}
                />
              )}
              {canVoid && (
                <VoidButton marketId={market.id} className={showResolve ? 'border-t border-line pt-4' : undefined} />
              )}
              {canDelete && (
                <div className={showResolve || canVoid ? 'border-t border-line pt-4' : undefined}>
                  <DeleteMarketButton marketId={market.id} />
                </div>
              )}
            </div>
          </SectionCard>
        )}
      </div>
    </ContentReveal>
  )
}
