'use client'

import type { ReactNode } from 'react'
import { useSearchParams } from 'next/navigation'

// A route's loading state gets no searchParams, but the board it's loading is in the URL, so this
// picks the skeleton that board will render, as My bets' TabSkeleton does.
export function BoardSkeleton({ month, all }: { month: ReactNode; all: ReactNode }) {
  return useSearchParams()?.get('tab') === 'month' ? month : all
}
