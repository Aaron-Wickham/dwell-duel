import { addToSlipAction, removeFromSlipAction } from '@/lib/parlays/slip-actions'

export function SlipControl({ outcomeId, inSlip, canAdd }: { outcomeId: string; inSlip: boolean; canAdd: boolean }) {
  if (inSlip) {
    return (
      <>
        {' '}
        <span className="text-sm">In your slip</span>{' '}
        <form action={removeFromSlipAction.bind(null, outcomeId)} className="inline">
          <button type="submit" className="text-sm underline">
            Remove
          </button>
        </form>
      </>
    )
  }

  if (!canAdd) return null

  return (
    <>
      {' '}
      <form action={addToSlipAction.bind(null, outcomeId)} className="inline">
        <button type="submit" className="text-sm underline">
          Add to parlay
        </button>
      </form>
    </>
  )
}
