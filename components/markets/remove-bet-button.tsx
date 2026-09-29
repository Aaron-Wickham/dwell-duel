'use client'

import { ConfirmActionButton } from '@/components/ui/confirm-action-button'
import { removeBetAction } from '@/lib/admin/owner-actions'

export function RemoveBetButton({
  betId,
  amount,
  outcomeLabel,
  bettorName,
}: {
  betId: number
  amount: number
  outcomeLabel: string
  bettorName: string
}) {
  return (
    <ConfirmActionButton
      id={`remove-bet-${betId}`}
      trigger="Remove"
      triggerLabel={`Remove ${bettorName}’s ${amount} DC bet on ${outcomeLabel}`}
      triggerVariant="secondary"
      triggerSize="chip"
      title={`Remove ${bettorName}’s bet?`}
      description={`Their ${amount} DC on ${outcomeLabel} goes back to their balance.`}
      confirmLabel="Remove bet"
      successMessage={`Bet removed. ${amount} DC refunded to ${bettorName}.`}
      action={removeBetAction.bind(null, betId)}
    />
  )
}
