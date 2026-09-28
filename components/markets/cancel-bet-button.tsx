'use client'

import { ConfirmActionButton } from '@/components/ui/confirm-action-button'
import { cancelBetAction } from '@/lib/markets/cancel-bet'

export function CancelBetButton({ betId, amount, outcomeLabel }: { betId: number; amount: number; outcomeLabel: string }) {
  return (
    <ConfirmActionButton
      id={`cancel-bet-${betId}`}
      trigger="Cancel"
      triggerLabel={`Cancel your ${amount} DC bet on ${outcomeLabel}`}
      triggerVariant="secondary"
      triggerSize="sm"
      className="shrink-0 items-end gap-1"
      title="Cancel this bet?"
      description={`Your ${amount} DC on ${outcomeLabel} comes back to your balance.`}
      confirmLabel="Cancel bet"
      dismissLabel="Keep bet"
      successMessage={`Bet cancelled. ${amount} DC refunded.`}
      action={cancelBetAction.bind(null, betId)}
    />
  )
}
