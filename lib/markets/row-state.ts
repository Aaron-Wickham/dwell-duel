export type OutcomeRowState = 'add' | 'inslip' | 'disabled' | 'none'

export function rowState(
  outcomeId: string,
  poolTotal: number,
  opts: { slip: string[]; canBet: boolean; slipFull: boolean },
): OutcomeRowState {
  if (opts.slip.includes(outcomeId)) return 'inslip'
  if (!opts.canBet || poolTotal === 0) return 'none'
  return opts.slipFull ? 'disabled' : 'add'
}
