'use client'

import { createContext, useContext, useOptimistic, type ReactNode } from 'react'

type SlipCount = { count: number; adjust: (delta: number) => void }

// Outside the signed-in layout (unit tests of a lone slip control) there's no badge to move.
const SlipCountContext = createContext<SlipCount>({ count: 0, adjust: () => {} })

// `adjust` is a useOptimistic setter, so it must be called inside the action that changes the
// slip. The adjusted count shows at once and gives way to the layout's fresh `initial` in the
// same render that the action's server result lands in.
export function SlipCountProvider({ initial, children }: { initial: number; children: ReactNode }) {
  const [count, adjust] = useOptimistic(initial, (current: number, delta: number) => Math.max(0, current + delta))
  return <SlipCountContext value={{ count, adjust }}>{children}</SlipCountContext>
}

export function useSlipCount(): SlipCount {
  return useContext(SlipCountContext)
}
