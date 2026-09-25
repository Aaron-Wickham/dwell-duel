'use client'

import { useActionState, useState } from 'react'
import { placeParlayAction, type PlaceParlayState } from '@/lib/parlays/place-parlay'
import { formatOdds, potentialPayout } from '@/lib/parlays/odds'

export function SlipForm({ legBps, canPlace, hasPicks }: { legBps: number[]; canPlace: boolean; hasPicks: boolean }) {
  const [state, formAction] = useActionState<PlaceParlayState, FormData>(placeParlayAction, undefined)
  const [stake, setStake] = useState('')
  const stakeNumber = Number(stake)
  const showPayout = Number.isInteger(stakeNumber) && stakeNumber > 0

  return (
    <div className="mt-3">
      {hasPicks && (
        <form action={formAction} className="flex flex-col gap-2">
          <label className="flex flex-col gap-1">
            Stake (DC)
            <input
              name="stake"
              type="number"
              min="1"
              step="1"
              required
              value={stake}
              onChange={(e) => setStake(e.target.value)}
              className="border px-2 py-1"
            />
          </label>
          {showPayout && <p className="text-sm">Potential payout: {potentialPayout(stakeNumber, legBps)} DC</p>}
          <button type="submit" disabled={!canPlace}>
            Place parlay
          </button>
        </form>
      )}
      {state?.formError && <p className="text-sm text-red-600">{state.formError}</p>}
      {state?.placed && (
        <p className="text-sm">
          Parlay placed at {formatOdds(state.placed.multiplierBp)}× — potential payout {state.placed.potentialPayout} DC.
        </p>
      )}
    </div>
  )
}
