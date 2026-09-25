import type { OutcomeRowState } from '@/components/markets/outcome-row'

export function rowState(
  outcomeId: string,
  poolTotal: number,
  opts: { slip: string[]; canBet: boolean; slipFull: boolean },
): OutcomeRowState {
  if (opts.slip.includes(outcomeId)) return 'inslip'
  if (!opts.canBet || poolTotal === 0) return 'none'
  return opts.slipFull ? 'disabled' : 'add'
}
