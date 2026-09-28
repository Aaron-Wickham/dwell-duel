'use client'

import { createContext, startTransition, useContext, useOptimistic, useState, type ReactNode } from 'react'
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

type Slip = {
  picks: SlipPick[]
  // `add` and `remove` are useOptimistic updates, so they must be called inside the action that
  // changes the slip (ToastActionForm's `optimistic`); the layout's fresh slip takes over when it
  // settles. `setMode` starts its own transition.
  add: (pick: SlipPick) => void
  remove: (outcomeId: string) => void
  setMode: (outcomeId: string, parlay: boolean) => void
  stakes: Record<string, string>
  setStake: (outcomeId: string, value: string) => void
  parlayStake: string
  setParlayStake: (value: string) => void
  clearStakes: () => void
  open: boolean
  setOpen: (open: boolean) => void
}

// Outside the signed-in layout (unit tests of a lone control) there's no slip to change.
const SlipContext = createContext<Slip>({
  picks: [],
  add: () => {},
  remove: () => {},
  setMode: () => {},
  stakes: {},
  setStake: () => {},
  parlayStake: '',
  setParlayStake: () => {},
  clearStakes: () => {},
  open: false,
  setOpen: () => {},
})

// Lives in the signed-in layout, which stays mounted across navigations, so stakes typed into
// the slip survive moving between pages (though not a reload: only the picks are in the cookie).
export function SlipProvider({ view, children }: { view: SlipView; children: ReactNode }) {
  const [picks, change] = useOptimistic(view.picks, applyChange)
  const [stakes, setStakes] = useState<Record<string, string>>({})
  const [parlayStake, setParlayStake] = useState('')
  const [open, setOpen] = useState(false)

  const slip: Slip = {
    picks,
    add: (pick) => change({ type: 'add', pick }),
    remove: (outcomeId) => change({ type: 'remove', outcomeId }),
    setMode: (outcomeId, parlay) =>
      startTransition(async () => {
        change({ type: 'mode', outcomeId, parlay })
        await setPickModeAction(outcomeId, parlay)
      }),
    stakes,
    setStake: (outcomeId, value) => setStakes((prev) => ({ ...prev, [outcomeId]: value })),
    parlayStake,
    setParlayStake,
    clearStakes: () => {
      setStakes({})
      setParlayStake('')
    },
    open,
    setOpen,
  }
  return <SlipContext value={slip}>{children}</SlipContext>
}

export function useSlip(): Slip {
  return useContext(SlipContext)
}
