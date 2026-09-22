import { redirect, notFound } from 'next/navigation'
import { requireUser } from '@/lib/auth/require-user'
import { isAdmin } from '@/lib/auth/is-admin'
import { getMarket, getOwnBets } from '@/lib/markets/get-market'
import { computeOdds } from '@/lib/markets/odds'
import { BetForm } from './bet-form'
import { ResolveForm } from './resolve-form'
import { VoidButton } from './void-button'

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
  const isPastClose = new Date(market.closeAt).getTime() <= Date.now()
  const canBet = market.status === 'open' && !isPastClose
  const canResolve = market.status === 'open' && ((isCreator && isPastClose) || admin)
  const canOverride = market.status === 'resolved' && admin
  const canVoid = market.status === 'open' && (isCreator || admin)

  return (
    <div className="mx-auto max-w-2xl p-8">
      <h1 className="text-xl font-semibold">{market.title}</h1>
      {market.description && <p className="mt-1 text-sm text-foreground/70">{market.description}</p>}
      <p className="mt-1 text-sm">Status: {market.status}</p>

      <ul className="mt-4 space-y-1">
        {odds.map((o) => (
          <li key={o.outcomeId}>
            {o.label} — {o.impliedProbability === null ? 'no bets yet' : `${Math.round(o.impliedProbability * 100)}%`} (
            {o.poolTotal} DC)
          </li>
        ))}
      </ul>

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
