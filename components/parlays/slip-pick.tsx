import Link from 'next/link'
import NumberFlow from '@number-flow/react'
import { AnimatedText } from '@/components/ui/animated-text'
import { FormSubmitButton } from '@/components/ui/form-submit-button'
import { StatusChip } from '@/components/ui/status-chip'
import { ToastActionForm } from '@/components/ui/toast-action-form'
import type { SlipPick as SlipPickView } from '@/lib/parlays/get-slip'
import { formatOdds } from '@/lib/parlays/odds'

export function SlipPick({
  pick,
  removeAction,
  optimisticRemove,
}: {
  pick: SlipPickView
  removeAction: (formData: FormData) => void | boolean | Promise<void | boolean>
  optimisticRemove?: () => void
}) {
  return (
    <div className="flex items-center gap-3 py-3.5">
      <div className="flex min-w-0 grow flex-col gap-1">
        <Link
          href={`/markets/${pick.marketId}`}
          transitionTypes={['nav-forward']}
          className="hit-area text-sm"
        >
          {pick.marketTitle}
        </Link>
        <span className="text-[17px] font-extrabold leading-[1.3]">{pick.outcomeLabel}</span>
      </div>
      {pick.available && pick.oddsBp !== null ? (
        <span className="whitespace-nowrap text-lg font-extrabold tabular-nums">
          <AnimatedText plainText={`${formatOdds(pick.oddsBp)}×`}>
            <NumberFlow
              value={Number(formatOdds(pick.oddsBp))}
              locales="en-US"
              format={{ minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false }}
              suffix="×"
            />
          </AnimatedText>
        </span>
      ) : (
        <StatusChip tone="lost">No longer available</StatusChip>
      )}
      <ToastActionForm action={removeAction} successMessage="Removed from your slip." optimistic={optimisticRemove}>
        <FormSubmitButton variant="quiet" size="sm">
          Remove{' '}
          <span className="sr-only">{`${pick.outcomeLabel}, ${pick.marketTitle}`}</span>
        </FormSubmitButton>
      </ToastActionForm>
    </div>
  )
}
