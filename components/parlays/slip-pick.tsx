import Link from 'next/link'
import NumberFlow from '@number-flow/react'
import { AnimatedText } from '@/components/ui/animated-text'
import { FormSubmitButton } from '@/components/ui/form-submit-button'
import { StatusChip } from '@/components/ui/status-chip'
import type { SlipPick as SlipPickView } from '@/lib/parlays/get-slip'
import { formatOdds } from '@/lib/parlays/odds'

export function SlipPick({
  pick,
  removeAction,
}: {
  pick: SlipPickView
  removeAction: (formData: FormData) => void | Promise<void>
}) {
  return (
    <div className="flex items-center gap-3 py-3.5">
      <div className="flex min-w-0 grow flex-col gap-1">
        <Link href={`/markets/${pick.marketId}`} className="text-sm">
          {pick.marketTitle}
        </Link>
        <span className="text-[17px] font-extrabold leading-[1.3]">{pick.outcomeLabel}</span>
      </div>
      {pick.available && pick.oddsBp !== null ? (
        <span className="whitespace-nowrap text-lg font-extrabold tabular-nums">
          <AnimatedText plainText={`${formatOdds(pick.oddsBp)}×`}>
            <NumberFlow
              value={Number(formatOdds(pick.oddsBp))}
              format={{ minimumFractionDigits: 2, maximumFractionDigits: 2 }}
              suffix="×"
            />
          </AnimatedText>
        </span>
      ) : (
        <StatusChip tone="lost">No longer available</StatusChip>
      )}
      <form action={removeAction}>
        <FormSubmitButton variant="quiet" size="sm">
          Remove{' '}
          <span className="sr-only">{`${pick.outcomeLabel}, ${pick.marketTitle}`}</span>
        </FormSubmitButton>
      </form>
    </div>
  )
}
