import Link from 'next/link'
import type { ReactNode } from 'react'
import { SectionCard } from '@/components/ui/section-card'
import { LocalTime } from '@/components/ui/local-time'
import type { WeeklyRecap } from '@/lib/home/recap'
import { weekRangeLabel } from '@/lib/home/recap-week'
import { signedDc } from '@/lib/social/season'
import { cn } from '@/lib/utils'
import { formatDcAmount } from '@/lib/format/dc'

function Row({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 py-2.5 first:pt-0 last:pb-0">
      <dt className="text-sm text-ink2">{term}</dt>
      <dd>{children}</dd>
    </div>
  )
}

function MarketLink({ id, title, className }: { id: string; title: string; className?: string }) {
  return (
    <Link href={`/markets/${id}`} transitionTypes={['nav-forward']} className={cn('break-words font-extrabold', className)}>
      {title}
    </Link>
  )
}

function percent(chance: number): string {
  return chance < 0.01 ? 'under 1%' : `${Math.round(chance * 100)}%`
}

// Sunday is the group's rhythm, so Home recaps the week on Sunday (so far) and Monday (finished).
// Each line shows only when the week has something for it; a week with nothing is no card at all.
export function WeeklyRecapCard({ recap }: { recap: WeeklyRecap | null }) {
  if (!recap) return null
  const { me, bestCall, upset, topTasker, closing } = recap
  const more = closing.total - closing.markets.length
  return (
    <SectionCard
      title={recap.mode === 'so-far' ? 'This week so far' : 'Last week'}
      titleId="weekly-recap-title"
      description={weekRangeLabel(recap)}
    >
      <dl className="flex flex-col divide-y divide-line">
        {me && me.bettingMoves > 0 && (
          <Row term="Your betting">
            <span className={cn('font-extrabold', me.betting > 0 && 'text-win', me.betting < 0 && 'text-loss')}>
              {signedDc(me.betting)}
            </span>
          </Row>
        )}
        {me && me.tasks > 0 && (
          <Row term="Your task rewards">
            <span className="font-extrabold">{signedDc(me.tasks)}</span>
          </Row>
        )}
        {bestCall && (
          <Row term="Best call">
            {bestCall.memberName} turned {formatDcAmount(bestCall.stake)} into {formatDcAmount(bestCall.payout)} on{' '}
            <MarketLink id={bestCall.marketId} title={bestCall.marketTitle} />
          </Row>
        )}
        {upset && (
          <Row term="Biggest upset">
            <MarketLink id={upset.marketId} title={upset.marketTitle} />: {upset.outcomeLabel} won with a{' '}
            {percent(upset.chance)} chance
          </Row>
        )}
        {topTasker && (
          <Row term="Most tasks done">
            {topTasker.memberName}, {topTasker.count === 1 ? '1 task' : `${topTasker.count} tasks`} approved
          </Row>
        )}
        {closing.total > 0 && (
          <Row term={recap.mode === 'so-far' ? 'Closing next week' : 'Closing this week'}>
            <ul className="flex flex-col gap-1">
              {closing.markets.map((market) => (
                <li key={market.id} className="flex flex-col">
                  <MarketLink id={market.id} title={market.title} className="hit-area" />
                  <span className="text-sm text-ink2">
                    Closes <LocalTime iso={market.closeAt} format="dateTime" />
                  </span>
                </li>
              ))}
            </ul>
            {more > 0 && (
              <p className="mt-1 text-sm text-ink2">
                And {more} more on <Link href="/markets">Markets</Link>.
              </p>
            )}
          </Row>
        )}
      </dl>
    </SectionCard>
  )
}
