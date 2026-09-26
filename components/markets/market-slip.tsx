'use client'

import { createContext, useContext, useOptimistic, type ReactNode } from 'react'

type MarketSlip = { pick: string | null; choose: (outcomeId: string | null) => void }

const MarketSlipContext = createContext<MarketSlip | null>(null)

// A market has at most one pick in the slip, and a new pick replaces the old one. Holding the
// pick here, above every outcome row, lets an add flip the replaced row off in the same commit
// that flips the new one on. `choose` is a useOptimistic setter, so it must be called inside the
// action that changes the slip; the server's `pick` takes over when that action settles.
export function MarketSlipProvider({ pick, children }: { pick: string | null; children: ReactNode }) {
  const [shown, choose] = useOptimistic(pick)
  return <MarketSlipContext value={{ pick: shown, choose }}>{children}</MarketSlipContext>
}

export function useMarketSlip(): MarketSlip | null {
  return useContext(MarketSlipContext)
}
