import { redirect, notFound } from 'next/navigation'
import { requireUser } from '@/lib/auth/require-user'
import { isAdmin } from '@/lib/auth/is-admin'
import { getMarket, getOwnBets } from '@/lib/markets/get-market'
import { computeOdds } from '@/lib/markets/odds'
import { readSlip } from '@/lib/parlays/slip'
import { MAX_PICKS } from '@/lib/parlays/odds'
import { BetForm } from './bet-form'
import { ResolveForm } from './resolve-form'
import { VoidButton } from './void-button'
import { SlipControl } from './slip-control'

export default async function MarketDetailPage(props: PageProps<'/markets/[id]'>) {
  const { id } = await props.params
  const { supabase, user } = await requireUser()
  if (!user) redirect('/sign-in')

  const market = await getMarket(supabase, id)
  if (!market) notFound()

  const ownBets = await getOwnBets(supabase, id, user.id)
  const admin = await isAdmin(supabase)
  const odds = computeOdds(market.outcomes.map((o) => ({ id: o.id, label: o.label, pool_total: o.poolTotal })))

  const isCreator = market.createdBy === user.id
  // Server Components render once per request with no re-render/
  // reconciliation cycle for React to keep consistent across -- the
  // purity rule protects Client Components from that, which doesn't
  // apply here, and this page already does non-deterministic async DB
  // reads (getMarket, getOwnBets, isAdmin) on every invocation regardless.
  // eslint-disable-next-line react-hooks/purity
  const isPastClose = new Date(market.closeAt).getTime() <= Date.now()
  const canBet = market.status === 'open' && !isPastClose
  const canResolve = market.status === 'open' && ((isCreator && isPastClose) || admin)
  const canOverride = market.status === 'resolved' && admin
  const canVoid = market.status === 'open' && (isCreator || admin)

  const slip = await readSlip()
  const marketInSlip = market.outcomes.some((o) => slip.includes(o.id))
  const slipFull = slip.length >= MAX_PICKS && !marketInSlip

  return (
    <div className="mx-auto max-w-2xl p-8">
      <h1 className="text-xl font-semibold">{market.title}</h1>
      {market.description && <p className="mt-1 text-sm text-foreground/70">{market.description}</p>}
      <p className="mt-1 text-sm">Status: {market.status}</p>
      {market.status === 'resolved' && market.resolvedOutcomeLabel && (
        <p className="mt-1 text-sm font-medium">Winning outcome: {market.resolvedOutcomeLabel}</p>
      )}

      <ul className="mt-4 space-y-1">
        {odds.map((o) => (
          <li key={o.outcomeId}>
            {o.label} — {o.impliedProbability === null ? 'no bets yet' : `${Math.round(o.impliedProbability * 100)}%`} (
            {o.poolTotal} DC)
            <SlipControl
              outcomeId={o.outcomeId}
              inSlip={slip.includes(o.outcomeId)}
              canAdd={canBet && o.poolTotal > 0 && !slipFull}
            />
          </li>
        ))}
      </ul>
      {canBet && slipFull && <p className="mt-2 text-sm">Your slip is full (6 picks).</p>}

      {canBet && <BetForm marketId={market.id} outcomes={market.outcomes} />}

      {ownBets.length > 0 && (
        <div className="mt-4">
          <h2 className="text-sm font-semibold">Your bets</h2>
          <ul className="text-sm">
            {ownBets.map((b) => {
              const outcome = market.outcomes.find((o) => o.id === b.outcomeId)
              return (
                <li key={b.id}>
                  {b.amount} DC on {outcome?.label ?? 'unknown outcome'}
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {(canResolve || canOverride) && (
        <div className="mt-4">
          <h2 className="text-sm font-semibold">{canOverride ? 'Override resolution' : 'Resolve market'}</h2>
          <ResolveForm marketId={market.id} outcomes={market.outcomes} />
        </div>
      )}

      {canVoid && <VoidButton marketId={market.id} />}
    </div>
  )
}
