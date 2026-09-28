'use client'

import { useRouter } from 'next/navigation'
import { ConfirmActionButton } from '@/components/ui/confirm-action-button'
import { deleteMarketAction } from '@/lib/admin/owner-actions'

// The market page 404s once its market is gone, so a successful delete goes back to the list.
export function DeleteMarketButton({ marketId }: { marketId: string }) {
  const router = useRouter()
  return (
    <ConfirmActionButton
      id="delete-market"
      trigger="Delete this market"
      block
      title="Delete this market?"
      description="It’s removed for everyone. Only a market nobody has bet on can be deleted."
      confirmLabel="Delete market"
      successMessage="Market deleted."
      action={deleteMarketAction.bind(null, marketId)}
      onDone={() => router.replace('/markets')}
    />
  )
}
