import { redirect } from 'next/navigation'
import Link from 'next/link'
import { requireUser } from '@/lib/auth/require-user'
import { readSlip } from '@/lib/parlays/slip'
import { getSlipView } from '@/lib/parlays/get-slip'
import { listMyParlays, type ParlayView } from '@/lib/parlays/list-parlays'
import { removeFromSlipAction } from '@/lib/parlays/slip-actions'
import { SlipForm } from './slip-form'

function describeParlay(p: ParlayView): string {
  const odds = `${p.multiplier.toFixed(2)}×`
  switch (p.status) {
    case 'pending':
      return `Pending — ${p.stake} DC at ${odds} — pays ${p.potentialPayout} DC if every pick wins`
    case 'won':
      return `Won — ${p.stake} DC at ${odds} — paid ${p.credited} DC`
    case 'lost':
      return `Lost — ${p.stake} DC at ${odds}`
    case 'refunded':
      return `Refunded — ${p.stake} DC returned`
  }
}

export default async function ParlaysPage() {
  const { supabase, user } = await requireUser()
  if (!user) redirect('/sign-in')

  const slip = await getSlipView(supabase, await readSlip())
  const parlays = await listMyParlays(supabase, user.id)

  return (
    <div className="mx-auto max-w-2xl p-8">
      <h1 className="text-xl font-semibold">Parlays</h1>
      <Link href="/markets" className="text-sm underline">
        Markets
      </Link>

      <h2 className="mt-6 text-lg font-semibold">Your slip</h2>
      {slip.picks.length === 0 ? (
        <p className="mt-2 text-sm text-foreground/70">Your slip is empty. Add picks from any market&apos;s page.</p>
      ) : (
        <>
          <ul className="mt-2 space-y-2">
            {slip.picks.map((pick) => (
              <li key={pick.outcomeId} className="border p-3">
                <p>
                  <Link href={`/markets/${pick.marketId}`} className="underline">
                    {pick.marketTitle}
                  </Link>
                  : {pick.outcomeLabel} —{' '}
                  {pick.available && pick.odds !== null ? `${pick.odds.toFixed(2)}×` : 'No longer available'}
                </p>
                <form action={removeFromSlipAction.bind(null, pick.outcomeId)}>
                  <button type="submit" className="text-sm underline">
                    Remove
                  </button>
                </form>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-sm">
            Combined: {slip.multiplier.toFixed(2)}×{slip.capped && ' (capped at 20×)'}
          </p>
          {!slip.canPlace && (
            <p className="text-sm text-foreground/70">A parlay needs at least 2 picks, all still available.</p>
          )}
        </>
      )}
      <SlipForm multiplier={slip.multiplier} canPlace={slip.canPlace} hasPicks={slip.picks.length > 0} />

      <h2 className="mt-8 text-lg font-semibold">My parlays</h2>
      {parlays.length === 0 ? (
        <p className="mt-2 text-sm text-foreground/70">No parlays yet.</p>
      ) : (
        <ul className="mt-2 space-y-3">
          {parlays.map((p) => (
            <li key={p.id} className="border p-3">
              <p className="font-medium">
                {describeParlay(p)}
                {p.capped && ' (capped at 20×)'}
              </p>
              <ul className="mt-1 text-sm">
                {p.legs.map((l) => (
                  <li key={l.marketId}>
                    {l.marketTitle}: {l.outcomeLabel} @ {l.lockedOdds.toFixed(2)}× — {l.status}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
