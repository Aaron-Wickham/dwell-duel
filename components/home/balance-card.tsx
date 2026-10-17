import { AnimatedNumber } from '@/components/ui/animated-number'
import { AnimatedText } from '@/components/ui/animated-text'
import { figureHeroClass } from '@/components/ui/page'
import { formatDcAmount } from '@/lib/format/dc'
import { standingLine } from '@/lib/home/copy'
import { cn } from '@/lib/utils'

// Home's anchor at every width (#438): the balance large on deep teal, then rank and what's riding.
// It sits under the greeting on a phone and in the right column from lg.
export function BalanceCard({
  balance,
  rank,
  memberCount,
  ridingDc,
  ridingWagers,
  className,
}: {
  balance: number
  rank: number | null
  memberCount: number
  ridingDc: number
  ridingWagers: number
  className?: string
}) {
  return (
    <section aria-labelledby="home-balance-title" className={cn('flex flex-col gap-1 rounded-card bg-hero p-5 text-on-hero md:p-6', className)}>
      <h2 id="home-balance-title" className="text-sm font-bold text-hero-2">
        Balance
      </h2>
      <p>
        <AnimatedText plainText={formatDcAmount(balance)} className={cn(figureHeroClass, 'whitespace-nowrap text-on-hero')}>
          <AnimatedNumber value={balance} locales="en-US" suffix=" DC" />
        </AnimatedText>
      </p>
      <p className="text-sm text-hero-2">{standingLine({ rank, memberCount, dc: ridingDc, wagers: ridingWagers })}</p>
    </section>
  )
}
