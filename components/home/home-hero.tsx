import NumberFlow from '@number-flow/react'
import { cn } from '@/lib/utils'
import { AnimatedText } from '@/components/ui/animated-text'
import { eyebrowClass } from '@/components/ui/page'
import { heroCaption } from '@/lib/home/copy'

export function HomeHero({
  balance,
  rank,
  memberCount,
  pendingCount,
  pendingDc,
}: {
  balance: number
  rank: number
  memberCount: number
  pendingCount: number
  pendingDc: number
}) {
  return (
    <section
      aria-label="Your balance"
      className="flex flex-col gap-2 rounded-[22px] bg-hero px-[22px] pt-[22px] pb-6 text-on-hero md:px-9 md:py-8"
    >
      <p className={cn(eyebrowClass, 'text-hero-2')}>Dwell Coin</p>
      <p className="text-xl font-bold md:text-2xl">
        Balance:{' '}
        <AnimatedText
          plainText={`${balance} DC`}
          className="text-[44px] leading-none font-extrabold tracking-[-0.03em] tabular-nums text-[#72DB2B] md:text-[60px]"
        >
          <NumberFlow value={balance} suffix=" DC" />
        </AnimatedText>
      </p>
      <p className="text-sm text-hero-2">{heroCaption(rank, memberCount, pendingCount, pendingDc)}</p>
    </section>
  )
}
