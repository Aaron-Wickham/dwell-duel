import { lmsrQuote } from '@/lib/markets/pricing'
import type { LmsrPick } from './get-slip'

// The stake an open outcome row quotes ("10 DC wins 16"), one of the slip's quick stakes.
export const EXAMPLE_STAKE = 10

// What a Solo stake on a pick pays if it wins, exactly as place_lmsr_bet will (0102). The slip and
// the market page's outcome rows both read it, so a row never quotes a number the slip wouldn't.
// Null on a pool market, which takes no bets.
export function soloPays(lmsr: LmsrPick | undefined, stake: number): number | null {
  return lmsr ? lmsrQuote(lmsr.q, lmsr.liquidity, lmsr.index, stake).payout : null
}
