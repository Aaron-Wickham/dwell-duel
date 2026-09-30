'use client'

import { ConfirmActionButton } from '@/components/ui/confirm-action-button'
import { voidMarketAction } from '@/lib/markets/void-market'

export function VoidButton({ marketId, className }: { marketId: string; className?: string }) {
  return (
    <ConfirmActionButton
      id="void"
      trigger="Void this market"
      block
      className={className}
      hint="Voiding refunds every bet and parlay leg."
      title="Void this market?"
      description="Every bet and parlay leg is refunded. This can’t be undone."
      confirmLabel="Void market"
      successMessage="Market voided."
      action={voidMarketAction.bind(null, marketId)}
    />
  )
}
