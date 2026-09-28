export type OutcomeRowState = 'add' | 'inslip' | 'disabled' | 'none'

// Any open outcome can go in the slip, even one nobody has bet on yet: it can still be a Solo pick.
export function rowState(
  outcomeId: string,
  opts: { slip: string[]; canBet: boolean; slipFull: boolean },
): OutcomeRowState {
  if (opts.slip.includes(outcomeId)) return 'inslip'
  if (!opts.canBet) return 'none'
  return opts.slipFull ? 'disabled' : 'add'
}
