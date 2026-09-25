import Link from 'next/link'
import { redirect, notFound } from 'next/navigation'
import { requireUser } from '@/lib/auth/require-user'
import { isAdmin } from '@/lib/auth/is-admin'
import { getMarket, getMarketBets } from '@/lib/markets/get-market'
import { computeOdds } from '@/lib/markets/odds'
import { outcomeSeries } from '@/lib/markets/outcome-series'
import { readSlip } from '@/lib/parlays/slip'
import { MAX_PICKS, legOddsBp } from '@/lib/parlays/odds'
import { addToSlipAction, removeFromSlipAction } from '@/lib/parlays/slip-actions'
import { BackLink } from '@/components/ui/back-link'
import { LocalTime } from '@/components/ui/local-time'
import { Message } from '@/components/ui/message'
import { Page, h1Class } from '@/components/ui/page'
import { SectionCard } from '@/components/ui/section-card'
import { StatusChip } from '@/components/ui/status-chip'
import { BetList } from '@/components/markets/bet-list'
import { OutcomeRow, type OutcomeRowState } from '@/components/markets/outcome-row'
import { BetForm } from './bet-form'
import { ResolveForm } from './resolve-form'
import { VoidButton } from './void-button'

export default async function MarketDetailPage(props: PageProps<'/markets/[id]'>) {
  const { id } = await props.params
  const { supabase, user } = await requireUser()
  if (!user) redirect('/sign-in')

  const market = await getMarket(supabase, id)
  if (!market) notFound()

  const bets = await getMarketBets(supabase, id)
  const admin = await isAdmin(supabase)
  const odds = computeOdds(market.outcomes.map((o) => ({ id: o.id, label: o.label, pool_total: o.poolTotal })))
  const totalPool = odds.reduce((sum, o) => sum + o.poolTotal, 0)

  const isCreator = market.createdBy === user.id
  // Server Components render once per request with no re-render/
  // reconciliation cycle for React to keep consistent across -- the
  // purity rule protects Client Components from that, which doesn't
  // apply here, and this page already does non-deterministic async DB
  // reads (getMarket, getMarketBets, isAdmin) on every invocation regardless.
  // eslint-disable-next-line react-hooks/purity
  const isPastClose = new Date(market.closeAt).getTime() <= Date.now()
  const canBet = market.status === 'open' && !isPastClose
  const canResolve = market.status === 'open' && ((isCreator && isPastClose) || admin)
  const canOverride = market.status === 'resolved' && admin
  const canVoid = market.status === 'open' && (isCreator || admin)
  const showResolve = canResolve || canOverride

  const slip = await readSlip()
  const marketInSlip = market.outcomes.some((o) => slip.includes(o.id))
  const slipFull = slip.length >= MAX_PICKS && !marketInSlip

  function rowState(outcomeId: string, poolTotal: number): OutcomeRowState {
    if (slip.includes(outcomeId)) return 'inslip'
    if (!canBet || poolTotal === 0) return 'none'
    return slipFull ? 'disabled' : 'add'
  }

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
    <Page>
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
          <Message tone="ok" className="self-start">
            Winning outcome: {market.resolvedOutcomeLabel}
          </Message>
        )}
      </div>

      <div className="flex flex-col gap-5 lg:grid lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:grid-rows-[auto_1fr] lg:items-start lg:gap-7">
        <SectionCard
          title="Outcomes"
          titleId="outcomes-title"
          action={<span className="text-sm text-ink2 tabular-nums">{totalPool} DC in the pool</span>}
          className="gap-1 lg:col-start-1 lg:row-start-1"
        >
          {canBet && slipFull && (
            <Message tone="gold" id="slip-full-note" className="mt-2">
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
                  label={o.label}
                  poolTotal={o.poolTotal}
                  probability={o.impliedProbability}
                  oddsBp={legOddsBp(totalPool, o.poolTotal)}
                  series={outcomeSeries(market.kind, o.label, index)}
                  state={rowState(o.outcomeId, o.poolTotal)}
                  winner={market.status === 'resolved' && o.label === market.resolvedOutcomeLabel}
                  addAction={addToSlipAction.bind(null, o.outcomeId)}
                  removeAction={removeFromSlipAction.bind(null, o.outcomeId)}
                  disabledReasonId={slipFull ? 'slip-full-note' : undefined}
                />
              </li>
            ))}
          </ul>
        </SectionCard>

        <div className="flex flex-col gap-5 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:gap-7">
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

        <SectionCard title="Bets" titleId="bets-title" className="gap-1 lg:col-start-1 lg:row-start-2">
          <BetList bets={bets} outcomes={market.outcomes} viewerId={user.id} canBet={canBet} />
        </SectionCard>
      </div>
    </Page>
  )
}
