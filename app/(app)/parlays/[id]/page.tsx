import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { LiveTables } from '@/components/live/live-tables'
import { LegPill, ParlayProgress, ParlayStatusChip, outcomeFigure } from '@/components/parlays/parlay-parts'
import { BackLink } from '@/components/ui/back-link'
import { LocalTime } from '@/components/ui/local-time'
import { Page, PageHeader } from '@/components/ui/page'
import { SectionCard } from '@/components/ui/section-card'
import { requireUser } from '@/lib/auth/require-user'
import { pageSubscriptions } from '@/lib/live/page-subscriptions'
import { getParlayDetail, type ParlayLegDetail } from '@/lib/parlays/get-parlay'
import { formatOdds, MAX_MULTIPLIER } from '@/lib/parlays/odds'
import { cardClass } from '@/components/ui/card'
import { cn } from '@/lib/utils'

// No loading.tsx for this route: the parlay must be found before anything streams, so an unknown
// or unreadable id still gets a real 404 status.
function legDetail(leg: ParlayLegDetail) {
  if (leg.marketStatus === 'voided') return 'Market voided. This pick drops out and the rest carry on.'
  if (leg.marketStatus === 'resolved') return `Resolved: ${leg.winningLabel ?? 'unknown'}`
  return null
}

export default async function ParlayPage(props: PageProps<'/parlays/[id]'>) {
  const { id } = await props.params
  const { supabase, user } = await requireUser()
  if (!user) redirect('/sign-in')

  const parlay = await getParlayDetail(supabase, id)
  if (!parlay) notFound()

  const mine = parlay.ownerId === user.id
  const figure = outcomeFigure(parlay)
  const counted = parlay.legs.filter((leg) => leg.status !== 'voided')
  const dropped = parlay.legs.length - counted.length

  return (
    <Page transition="drill-down" className="max-w-[820px]">
      <BackLink href="/bets">My bets</BackLink>
      <LiveTables subscriptions={pageSubscriptions.parlay(parlay.id)} />
      <PageHeader
        title={`Parlay · ${parlay.legs.length} picks`}
        description={
          <>
            {mine ? 'Placed' : `${parlay.ownerName} placed it`} <LocalTime iso={parlay.createdAt} format="dateTime" />
          </>
        }
      />

      <section aria-labelledby="parlay-summary" className={cn(cardClass, 'flex flex-col gap-4 bg-hero p-[18px] text-on-hero md:p-6')}>
        <h2 id="parlay-summary" className="sr-only">
          Summary
        </h2>
        <div className="flex items-center justify-between gap-3">
          <ParlayStatusChip parlay={parlay} className="bg-surface text-ink" />
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-sm text-hero-2">{figure.label}</span>
          <span className={cn('text-[34px] leading-none font-extrabold tabular-nums', figure.tone === 'win' ? 'text-hero-num' : '')}>
            {figure.value}
          </span>
          <span className="text-sm text-hero-2">
            {parlay.stake} DC stake · {formatOdds(parlay.multiplierBp)}× multiplier
            {parlay.capped ? ` (capped at ${MAX_MULTIPLIER}×)` : ''}
          </span>
        </div>
        <ParlayProgress legs={parlay.legs} />
      </section>

      <SectionCard title="Picks" titleId="parlay-picks">
        <ul className="flex flex-col divide-y divide-line">
          {parlay.legs.map((leg) => {
            const note = legDetail(leg)
            return (
              <li key={leg.marketId} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0">
                <div className="flex items-start justify-between gap-3">
                  <Link
                    href={`/markets/${leg.marketId}`}
                    transitionTypes={['nav-forward']}
                    className="hit-area min-w-0 font-bold break-words"
                  >
                    {leg.marketTitle}
                  </Link>
                  <LegPill status={leg.status} />
                </div>
                <p className="text-sm text-ink2">
                  Pick: <strong className="text-ink">{leg.outcomeLabel}</strong> · locked at {formatOdds(leg.lockedOddsBp)}×
                </p>
                <p className="text-sm text-ink2">
                  {note ?? (
                    <>
                      Closes <LocalTime iso={leg.closeAt} format="dateTime" />
                    </>
                  )}
                </p>
              </li>
            )
          })}
        </ul>
      </SectionCard>

      <SectionCard title="How it adds up" titleId="parlay-maths">
        <dl className="flex flex-col gap-2 tabular-nums">
          <div className="flex justify-between gap-3">
            <dt>Stake</dt>
            <dd className="font-bold">{parlay.stake} DC</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="min-w-0 break-words">{counted.map((leg) => `${formatOdds(leg.lockedOddsBp)}×`).join(' · ')}</dt>
            <dd className="font-bold">= {formatOdds(parlay.multiplierBp)}×</dd>
          </div>
          <div className="flex justify-between gap-3 border-t border-line pt-2">
            <dt className="font-bold">{parlay.status === 'pending' ? 'Pays if every pick wins' : figure.label}</dt>
            <dd className="font-bold">{parlay.status === 'lost' ? 'Nothing' : figure.value}</dd>
          </div>
        </dl>
        <p className="text-sm text-ink2">
          Each pick’s odds were locked when the parlay was placed, and they multiply together
          {parlay.capped ? `, up to a ${MAX_MULTIPLIER}× cap` : ''}.
          {dropped > 0 ? ` ${dropped} voided ${dropped === 1 ? 'pick was' : 'picks were'} left out and the rest carried on.` : ''}
        </p>
      </SectionCard>
    </Page>
  )
}
