import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ChartColumn, Plus } from 'lucide-react'
import { requireUser } from '@/lib/auth/require-user'
import { listMarkets } from '@/lib/markets/list-markets'
import { computeOdds } from '@/lib/markets/odds'
import { marketCardStatus, type MarketCardStatus } from '@/lib/markets/market-status'
import { Page, PageHeader, h2Class } from '@/components/ui/page'
import { EmptyState } from '@/components/ui/empty-state'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { MarketCard } from '@/components/markets/market-card'

const GROUPS: { id: MarketCardStatus; heading: string }[] = [
  { id: 'open', heading: 'Open' },
  { id: 'awaiting', heading: 'Awaiting resolution' },
  { id: 'resolved', heading: 'Resolved' },
  { id: 'voided', heading: 'Voided' },
]

export default async function MarketsPage() {
  const { supabase, user } = await requireUser()
  if (!user) redirect('/sign-in')

  const markets = await listMarkets(supabase)
  const now = new Date()

  const cards = markets.map((market) => {
    const odds = computeOdds(market.outcomes.map((o) => ({ id: o.id, label: o.label, pool_total: o.poolTotal })))
    return {
      id: market.id,
      title: market.title,
      status: marketCardStatus(market.status, market.closeAt, now),
      closeAt: market.closeAt,
      resolvedAt: market.resolvedAt,
      outcomes: odds.map((o) => ({
        id: o.outcomeId,
        label: o.label,
        pct: o.impliedProbability === null ? null : Math.round(o.impliedProbability * 100),
      })),
      resolvedOutcomeLabel: market.resolvedOutcomeLabel,
    }
  })

  const groups = GROUPS.map((group) => ({
    ...group,
    markets: cards.filter((card) => card.status === group.id),
  })).filter((group) => group.markets.length > 0)

  return (
    <Page>
      <PageHeader
        title="Markets"
        action={
          <Link
            href="/markets/new"
            className={cn(buttonVariants({ variant: 'primary', size: 'sm' }), 'md:min-h-12 md:px-5 md:text-base')}
          >
            <Plus aria-hidden="true" className="size-5" />
            Create market
          </Link>
        }
      />
      {groups.length === 0 ? (
        <EmptyState
          icon={ChartColumn}
          title="No markets yet."
          action={
            <Link href="/markets/new" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
              Create market
            </Link>
          }
        >
          Open the first one and get the duel started.
        </EmptyState>
      ) : (
        groups.map((group) => (
          <section key={group.id} aria-labelledby={`markets-${group.id}-heading`} className="flex flex-col gap-3">
            <h2 id={`markets-${group.id}-heading`} className={h2Class}>
              {group.heading}
            </h2>
            <div className="grid gap-5 lg:grid-cols-3">
              {group.markets.map((market) => (
                <MarketCard key={market.id} {...market} />
              ))}
            </div>
          </section>
        ))
      )}
    </Page>
  )
}
