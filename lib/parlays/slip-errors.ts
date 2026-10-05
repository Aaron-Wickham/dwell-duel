import { formatDcAmount } from '@/lib/format/dc'
import { GENERIC_ERROR } from '@/lib/errors/friendly-error'

// place_slip (0039) prefixes a failure with the pick or the parlay it came from.
const PICK_ERROR = /^pick ([0-9a-f-]{36}): (.+)$/i
const PARLAY_ERROR = /^parlay: (.+)$/i
// place_lmsr_bet (0102) and place_lmsr_parlay (0104): the payout at commit is more than 2% under
// the one the slip showed.
const PRICE_MOVED = /^price_moved:(\d+)$/

const REMOVE_PICK = 'Remove it from your slip to place the rest.'

// The engine's own wording, from place_lmsr_bet, place_lmsr_parlay and place_slip_v4, rewritten so
// it says what to do next.
const KNOWN: Record<string, string> = {
  'market is not open for betting': `This market has closed. ${REMOVE_PICK}`,
  'market not found': `This market is gone. ${REMOVE_PICK}`,
  'outcome not found': `This pick is gone. ${REMOVE_PICK}`,
  'outcome does not belong to this market': `This pick is gone. ${REMOVE_PICK}`,
  'this market doesn’t sell shares': `This market no longer takes bets. ${REMOVE_PICK}`,
  "this market doesn't sell shares": `This market no longer takes bets. ${REMOVE_PICK}`,
  'bet amount must be positive': 'Enter a whole number of DC greater than 0.',
  'stake must be positive': 'Enter a whole number of DC greater than 0.',
  'a bet can stake at most 1,000,000 dc': 'A bet can stake at most 1,000,000 DC. Try a smaller stake.',
  'a parlay can stake at most 1,000,000 dc': 'A parlay can stake at most 1,000,000 DC. Try a smaller stake.',
  'that bet would pay more than dwellduel can hold': 'That bet would pay more than DwellDuel can hold. Try a smaller stake.',
  'that parlay would pay more than dwellduel can hold': 'That parlay would pay more than DwellDuel can hold. Try a smaller stake.',
  'your slip is empty': 'Your slip is empty.',
  'not invited': 'This account isn’t on the invite list. Sign in with the account you were invited with.',
}

// Refusals the SQL already writes for members (a market's title, a limit, a next step), shown as
// they are, with a next step added where they lack one.
const WRITTEN_FOR_MEMBERS: readonly [RegExp, string?][] = [
  [/^'.+' is no longer open$/, REMOVE_PICK],
  [/^'.+' is your own market, so it can't be a parlay pick$/, 'Bet it solo instead.'],
  [/^'.+' needs at least .+ before it can be a parlay pick$/, 'Bet it solo instead.'],
  [/^your parlays with '.+' in them could already pay/],
  [/^a parlay pays at most \d+ DC/],
  [/^a parlay needs 2 to \d+ picks$/],
  [/^each pick must be from a different market$/, 'Remove one of them, or switch it to Solo.'],
  [/^DwellDuel just updated\. Refresh to bet\.$/],
  [/^a pick on a market with fixed payouts can't be in a parlay yet/],
  [/^a parlay can't mix markets with fixed payouts and older markets/],
]

function sentence(message: string): string {
  const text = message.charAt(0).toUpperCase() + message.slice(1)
  return /[.!?]$/.test(text) ? text : `${text}.`
}

// Nothing from Postgres reaches a member unmapped: an unknown text becomes GENERIC_ERROR, and
// `onUnknown` lets the caller log the raw one.
function memberMessage(raw: string, onUnknown?: (raw: string) => void): string {
  const known = KNOWN[raw.toLowerCase().replace(/\.$/, '')]
  if (known) return known
  for (const [pattern, next] of WRITTEN_FOR_MEMBERS) {
    if (pattern.test(raw)) return next ? `${sentence(raw)} ${next}` : sentence(raw)
  }
  onUnknown?.(raw)
  return GENERIC_ERROR
}

export function parseSlipError(
  message: string,
  onUnknown?: (raw: string) => void,
): {
  formError?: string
  pickErrors?: Record<string, string>
  parlayError?: string
  priceMoved?: boolean
} {
  const pick = PICK_ERROR.exec(message)
  if (pick) {
    const moved = PRICE_MOVED.exec(pick[2])
    if (moved) {
      return {
        pickErrors: {
          [pick[1]]: `The price moved, so this bet now pays ${formatDcAmount(Number(moved[1]))} if it wins. Tap Place again to bet at the new price.`,
        },
        priceMoved: true,
      }
    }
    return { pickErrors: { [pick[1]]: memberMessage(pick[2], onUnknown) } }
  }
  const parlay = PARLAY_ERROR.exec(message)
  if (parlay) {
    const moved = PRICE_MOVED.exec(parlay[1])
    if (moved) {
      return {
        parlayError: `The price moved, so this parlay now pays ${formatDcAmount(Number(moved[1]))} if every pick wins. Tap Place again to bet at the new price.`,
        priceMoved: true,
      }
    }
    return { parlayError: memberMessage(parlay[1], onUnknown) }
  }
  return { formError: memberMessage(message, onUnknown) }
}
