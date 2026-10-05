'use client'

import type { ReactNode } from 'react'
import { useSearchParams } from 'next/navigation'

// A route's loading state gets no searchParams, but the tab it's loading is in the URL, so this
// picks the skeleton the tab will render: Coins' rows at the reading width, or the bet tabs' cards.
export function TabSkeleton({ coins, bets }: { coins: ReactNode; bets: ReactNode }) {
  return useSearchParams()?.get('tab') === 'coins' ? coins : bets
}
