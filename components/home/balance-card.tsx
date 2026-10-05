import { AnimatedNumber } from '@/components/ui/animated-number'
import { AnimatedText } from '@/components/ui/animated-text'
import { eyebrowClass, figureHeroClass } from '@/components/ui/page'
import { formatDcAmount } from '@/lib/format/dc'
import { standingLine } from '@/lib/home/copy'
import { cn } from '@/lib/utils'

// Desktop only (#388): on a phone the top bar's chip carries the balance and the greeting's line the
// rest, so the balance shows once above the fold at every width.
export function BalanceCard({
  balance,
  rank,
  memberCount,
  ridingDc,
  ridingWagers,
}: {
  balance: number
  rank: number | null
  memberCount: number
  ridingDc: number
  ridingWagers: number
}) {
  return (
    <section aria-labelledby="home-balance-title" className="hidden flex-col gap-1 rounded-card bg-acc-soft p-6 lg:flex">
      <h2 id="home-balance-title" className={eyebrowClass}>
        Balance
      </h2>
      <p>
        <AnimatedText plainText={formatDcAmount(balance)} className={cn(figureHeroClass, 'whitespace-nowrap text-acc-text')}>
          <AnimatedNumber value={balance} locales="en-US" suffix=" DC" />
        </AnimatedText>
      </p>
      <p className="text-sm text-ink2">{standingLine({ rank, memberCount, dc: ridingDc, wagers: ridingWagers })}</p>
    </section>
  )
}
