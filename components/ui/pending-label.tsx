import type { ReactNode } from 'react'
import { LeafLoader } from '@/components/brand/leaf-loader'
import { cn } from '@/lib/utils'

const layerClass = 'col-start-1 row-start-1 inline-flex items-center justify-center gap-2'

// A busy button says what it's doing ("Placing…") beside the leaf loader, the way sign-in does,
// rather than only greying out like an unavailable one. Both labels share one grid cell, so the
// button is as wide as the longer and doesn't jump when it switches. The resting label only fades
// out, so it stays the button's name; the words are announced by PendingStatus beside the button.
export function PendingLabel({ pending, pendingLabel, children }: { pending: boolean; pendingLabel: string; children: ReactNode }) {
  return (
    <span className="inline-grid">
      <span className={cn(layerClass, pending && 'opacity-0')}>{children}</span>
      <span aria-hidden="true" className={cn(layerClass, !pending && 'opacity-0')}>
        <LeafLoader />
        {pendingLabel}
      </span>
    </span>
  )
}

// Outside the button, since a button's contents are presentational and a live region inside one
// may never be read, and mounted throughout, since one inserted with its text isn't always read.
export function PendingStatus({ pending, pendingLabel }: { pending: boolean; pendingLabel: string }) {
  return (
    <span role="status" className="sr-only">
      {pending ? pendingLabel : ''}
    </span>
  )
}
