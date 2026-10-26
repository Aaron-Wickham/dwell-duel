'use client'

import type { ReactNode } from 'react'
import { useSearchParams } from 'next/navigation'

// A route's loading state gets no searchParams, but the tab it's loading is in the URL, so this
// picks the skeleton the tab will render: Coins' rows at the reading width, or the bet tabs' cards,
// with all four tabs on Cancelled, which only a member with a cancelled bet sees (D-10).
export function TabSkeleton({ coins, bets, cancelled }: { coins: ReactNode; bets: ReactNode; cancelled: ReactNode }) {
  const tab = useSearchParams()?.get('tab')
  return tab === 'coins' ? coins : tab === 'cancelled' ? cancelled : bets
}
