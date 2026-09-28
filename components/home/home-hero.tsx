import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { AnimatedNumber } from '@/components/ui/animated-number'
import { AnimatedText } from '@/components/ui/animated-text'
import { eyebrowClass } from '@/components/ui/page'
import { atStakeDetail, pendingDetail } from '@/lib/home/copy'

function StatTile({ href, label, value, detail }: { href: string; label: string; value: number; detail: string }) {
  return (
    <Link
      href={href}
      aria-label={`${label}: ${value} DC ${detail}`}
      className="pressable group flex min-h-11 min-w-0 items-center gap-2 rounded-[14px] bg-hero-inset px-3.5 py-2.5 text-on-hero no-underline md:px-4 md:py-3"
    >
      <span className="flex min-w-0 grow flex-col">
        <span className="text-xs font-extrabold tracking-[0.09em] text-hero-2 uppercase">{label}</span>
        <span className="flex flex-wrap items-baseline gap-x-1.5">
          <AnimatedText plainText={`${value} DC`} className="text-xl font-extrabold tabular-nums md:text-2xl">
            <AnimatedNumber value={value} locales="en-US" format={{ useGrouping: false }} suffix=" DC" />
          </AnimatedText>
          <span className="text-sm text-hero-2 group-hover:underline group-hover:underline-offset-[3px]">{detail}</span>
        </span>
      </span>
      <ChevronRight aria-hidden="true" className="size-5 shrink-0" />
    </Link>
  )
}

// The balance with the rank beside it, then what's riding and what's waiting on review. On a
// phone the stats sit under the balance; from lg they fill the rest of the row.
export function HomeHero({
  balance,
  rank,
  memberCount,
  atStakeDc,
  atStakeWagers,
  pendingCount,
  pendingDc,
}: {
  balance: number
  rank: number
  memberCount: number
  atStakeDc: number
  atStakeWagers: number
  pendingCount: number
  pendingDc: number
}) {
  return (
    <section
      aria-label="Your balance"
      className="flex flex-col gap-4 rounded-[22px] bg-hero p-[18px] text-on-hero md:p-7 lg:flex-row lg:items-center lg:gap-6"
    >
      <div className="flex items-end justify-between gap-3 lg:shrink-0 lg:flex-col lg:items-start lg:gap-2.5">
        <div className="flex flex-col gap-1">
          <p className={cn(eyebrowClass, 'text-hero-2')}>Dwell Coin</p>
          <p>
            <AnimatedText
              plainText={`${balance} DC`}
              className="text-[40px] leading-none font-extrabold tracking-[-0.03em] whitespace-nowrap tabular-nums text-hero-num md:text-[56px]"
            >
              <AnimatedNumber value={balance} locales="en-US" format={{ useGrouping: false }} suffix=" DC" />
            </AnimatedText>
          </p>
        </div>
        {rank > 0 && (
          <p className="inline-flex h-8 shrink-0 items-center rounded-full bg-hero-inset px-3 text-sm font-extrabold whitespace-nowrap tabular-nums">
            Rank {rank} of {memberCount}
          </p>
        )}
      </div>
      <div className={cn('grid gap-2.5 lg:grow', pendingCount > 0 ? 'grid-cols-2' : 'grid-cols-1')}>
        <StatTile href="/bets" label="At stake" value={atStakeDc} detail={atStakeDetail(atStakeWagers)} />
        {pendingCount > 0 && <StatTile href="/tasks" label="Pending" value={pendingDc} detail={pendingDetail(pendingCount)} />}
      </div>
    </section>
  )
}
