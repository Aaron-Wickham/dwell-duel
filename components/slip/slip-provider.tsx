'use client'

import { createContext, startTransition, useContext, useMemo, useOptimistic, useRef, useState, type ReactNode, type RefObject } from 'react'
import type { SlipPick, SlipView } from '@/lib/parlays/get-slip'
import { setPickModeAction } from '@/lib/parlays/slip-actions'

type Change =
  | { type: 'add'; pick: SlipPick }
  | { type: 'remove'; outcomeId: string }
  | { type: 'mode'; outcomeId: string; parlay: boolean }

function applyChange(picks: SlipPick[], change: Change): SlipPick[] {
  switch (change.type) {
    case 'add':
      // One pick per market: a new pick replaces that market's old one, as addToSlipAction does.
      return [...picks.filter((p) => p.marketId !== change.pick.marketId), change.pick]
    case 'remove':
      return picks.filter((p) => p.outcomeId !== change.outcomeId)
    case 'mode':
      return picks.map((p) => (p.outcomeId === change.outcomeId ? { ...p, parlay: change.parlay } : p))
  }
}

type SlipPicks = {
  picks: SlipPick[]
  // The member's balance as the layout last read it, for the quick-stake chips' Max.
  balance: number
  // `add` and `remove` are useOptimistic updates, so they must be called inside the action that
  // changes the slip (ToastActionForm's `optimistic`); the layout's fresh slip takes over when it
  // settles. `setMode` starts its own transition.
  add: (pick: SlipPick) => void
  remove: (outcomeId: string) => void
  setMode: (outcomeId: string, parlay: boolean) => void
  open: boolean
  setOpen: (open: boolean) => void
}

type SlipStakes = {
  stakes: Record<string, string>
  setStake: (outcomeId: string, value: string) => void
  parlayStake: string
  setParlayStake: (value: string) => void
  // One key per slip, kept across retries until a place succeeds: if a place commits but its
  // response is lost, tapping again returns that result instead of placing twice (#61). It lives
  // here, not in the panel, because the sheet unmounts the panel when it closes (#192).
  attemptKeyRef: RefObject<string | null>
  // Whether the last place's answer was lost, so the panel can still say so after reopening.
  lostResponse: boolean
  setLostResponse: (lost: boolean) => void
  clearStakes: () => void
}

type Slip = SlipPicks & SlipStakes

// Two contexts, so a stake keystroke re-renders only what reads the stakes (the slip's panel), not
// every market card's quick picks (#457). Outside the signed-in layout (unit tests of a lone
// control) there's no slip to change.
const SlipPicksContext = createContext<SlipPicks>({
  picks: [],
  balance: 0,
  add: () => {},
  remove: () => {},
  setMode: () => {},
  open: false,
  setOpen: () => {},
})

const SlipStakesContext = createContext<SlipStakes>({
  stakes: {},
  setStake: () => {},
  parlayStake: '',
  setParlayStake: () => {},
  attemptKeyRef: { current: null },
  lostResponse: false,
  setLostResponse: () => {},
  clearStakes: () => {},
})

// Lives in the signed-in layout, which stays mounted across navigations, so stakes typed into
// the slip survive moving between pages (though not a reload: only the picks are in the cookie).
export function SlipProvider({ view, balance = 0, children }: { view: SlipView; balance?: number; children: ReactNode }) {
  const [picks, change] = useOptimistic(view.picks, applyChange)
  const [stakes, setStakes] = useState<Record<string, string>>({})
  const [parlayStake, setParlayStake] = useState('')
  const attemptKeyRef = useRef<string | null>(null)
  const [lostResponse, setLostResponse] = useState(false)
  const [open, setOpen] = useState(false)

  const slipPicks = useMemo<SlipPicks>(
    () => ({
      picks,
      balance,
      add: (pick) => change({ type: 'add', pick }),
      remove: (outcomeId) => change({ type: 'remove', outcomeId }),
      setMode: (outcomeId, parlay) =>
        startTransition(async () => {
          change({ type: 'mode', outcomeId, parlay })
          await setPickModeAction(outcomeId, parlay)
        }),
      open,
      setOpen,
    }),
    [picks, balance, change, open],
  )

  const slipStakes = useMemo<SlipStakes>(
    () => ({
      stakes,
      setStake: (outcomeId, value) => setStakes((prev) => ({ ...prev, [outcomeId]: value })),
      parlayStake,
      setParlayStake,
      attemptKeyRef,
      lostResponse,
      setLostResponse,
      clearStakes: () => {
        setStakes({})
        setParlayStake('')
        attemptKeyRef.current = null
        setLostResponse(false)
      },
    }),
    [stakes, parlayStake, lostResponse],
  )

  return (
    <SlipPicksContext value={slipPicks}>
      <SlipStakesContext value={slipStakes}>{children}</SlipStakesContext>
    </SlipPicksContext>
  )
}

// Everything but the stakes: what a control that only adds, removes or counts picks needs, without
// re-rendering as a stake is typed.
export function useSlipPicks(): SlipPicks {
  return useContext(SlipPicksContext)
}

export function useSlip(): Slip {
  return { ...useContext(SlipPicksContext), ...useContext(SlipStakesContext) }
}
