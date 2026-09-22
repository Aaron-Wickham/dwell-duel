import { redirect } from 'next/navigation'
import Link from 'next/link'
import { requireUser } from '@/lib/auth/require-user'
import { listMarkets } from '@/lib/markets/list-markets'
import { computeOdds } from '@/lib/markets/odds'

export default async function MarketsPage() {
  const { supabase, user } = await requireUser()
  if (!user) redirect('/sign-in')

  const markets = await listMarkets(supabase)

  return (
    <div className="mx-auto max-w-2xl p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Markets</h1>
        <Link href="/markets/new" className="text-sm underline">
          New market
        </Link>
      </div>
      <ul className="mt-6 space-y-4">
        {markets.map((market) => {
          const odds = computeOdds(market.outcomes.map((o) => ({ id: o.id, label: o.label, pool_total: o.poolTotal })))
          return (
            <li key={market.id} className="border p-4">
              <Link href={`/markets/${market.id}`} className="font-medium underline">
                {market.title}
              </Link>
              <p className="text-sm text-foreground/70">{market.status}</p>
              <ul className="mt-2 text-sm">
                {odds.map((o) => (
                  <li key={o.outcomeId}>
                    {o.label}: {o.impliedProbability === null ? 'no bets yet' : `${Math.round(o.impliedProbability * 100)}%`}
                  </li>
                ))}
              </ul>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
