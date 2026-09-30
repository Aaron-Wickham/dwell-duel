import { Suspense } from 'react'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { LiveTables } from '@/components/live/live-tables'
import { ContentReveal } from '@/components/nav/page-transition'
import { ParlayDetailSkeleton } from '@/components/parlays/parlay-detail-skeleton'
import { LegPill, ParlayProgress, ParlayStatusChip, outcomeFigure } from '@/components/parlays/parlay-parts'
import { BackLink } from '@/components/ui/back-link'
import { LoadingStatus } from '@/components/ui/loading-status'
import { LocalTime } from '@/components/ui/local-time'
import { Page, PageHeader } from '@/components/ui/page'
import { SectionCard } from '@/components/ui/section-card'
import { requireUser } from '@/lib/auth/require-user'
import { pageSubscriptions } from '@/lib/live/page-subscriptions'
import { getParlayDetail, getParlayHead, type ParlayLegDetail } from '@/lib/parlays/get-parlay'
import { formatOdds, MAX_MULTIPLIER } from '@/lib/parlays/odds'
import { cardClass } from '@/components/ui/card'
import { cn } from '@/lib/utils'

// No loading.tsx for this route: the parlay must be found before anything streams, so an unknown
// or unreadable id still gets a real 404 status. The header comes from a cheap read of the parlay's
// own row; the summary, picks and maths stream in behind their skeletons, as the market page's
// sections do.
function legDetail(leg: ParlayLegDetail) {
  if (leg.marketStatus === 'voided') return 'Market voided. This pick drops out and the rest carry on.'
  if (leg.marketStatus === 'resolved') return `Resolved: ${leg.winningLabel ?? 'unknown'}`
  return null
}

export default async function ParlayPage(props: PageProps<'/parlays/[id]'>) {
  const { id } = await props.params
  const { supabase, user } = await requireUser()
  if (!user) redirect('/sign-in')

  const head = await getParlayHead(supabase, id)
  if (!head) notFound()

  const mine = head.ownerId === user.id

  return (
    <Page transition="drill-down">
      <BackLink href="/bets">My bets</BackLink>
      <LiveTables subscriptions={pageSubscriptions.parlay(head.id)} />
      <PageHeader
        title={`Parlay · ${head.legCount} picks`}
        description={
          <>
            {mine ? 'Placed' : `${head.ownerName} placed it`} <LocalTime iso={head.createdAt} format="dateTime" />
          </>
        }
      />

      {/* At lg the picks take the wide column, with the summary and the maths beside them, as on the
          market page; on a phone they keep the summary-first order. The fallbacks carry the same grid
          placement as the sections and announce nothing themselves; LoadingStatus wraps them in one
          status for as long as any of them is showing. */}
      <LoadingStatus>
        <div className="flex flex-col gap-5 md:gap-7 lg:grid lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:grid-rows-[auto_1fr] lg:items-start">
          <Suspense fallback={<ParlayDetailSkeleton legs={head.legCount} />}>
            <ParlayBody id={head.id} />
          </Suspense>
        </div>
      </LoadingStatus>
    </Page>
  )
}

// Exported so tests can render the streamed sections directly: it's an async Server Component
// inside a <Suspense>, which jsdom can't render in place.
export async function ParlayBody({ id }: { id: string }) {
  const { supabase } = await requireUser()
  const parlay = await getParlayDetail(supabase, id)
  // The head read found it a moment ago; only a delete in between gets here.
  if (!parlay) notFound()

  const figure = outcomeFigure(parlay)
  const counted = parlay.legs.filter((leg) => leg.status !== 'voided')
  const dropped = parlay.legs.length - counted.length

  return (
    <ContentReveal>
      <section aria-labelledby="parlay-summary" className={cn(cardClass, 'flex flex-col gap-4 bg-hero p-[18px] text-on-hero md:p-6 lg:col-start-2 lg:row-start-1')}>
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

      <SectionCard title="Picks" titleId="parlay-picks" className="lg:col-start-1 lg:row-span-2 lg:row-start-1">
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
                      {leg.status === 'awaiting' ? 'Closed' : 'Closes'} <LocalTime iso={leg.closeAt} format="dateTime" />
                    </>
                  )}
                </p>
              </li>
            )
          })}
        </ul>
      </SectionCard>

      <SectionCard title="How it adds up" titleId="parlay-maths" className="lg:col-start-2 lg:row-start-2">
        <dl className="flex flex-col gap-2 tabular-nums">
          <div className="flex justify-between gap-3">
            <dt>Stake</dt>
            <dd className="font-bold">{parlay.stake} DC</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="min-w-0 break-words">{counted.map((leg) => `${formatOdds(leg.lockedOddsBp)}×`).join(' · ')}</dt>
            <dd className="shrink-0 font-bold whitespace-nowrap">= {formatOdds(parlay.multiplierBp)}×</dd>
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
    </ContentReveal>
  )
}
