// place_slip (0039) prefixes a failure with the pick or the parlay it came from.
const PICK_ERROR = /^pick ([0-9a-f-]{36}): (.+)$/i
const PARLAY_ERROR = /^parlay: (.+)$/i
// place_lmsr_bet (0102): the payout at commit is more than 2% under the one the slip showed.
const PRICE_MOVED = /^price_moved:(\d+)$/

function sentence(message: string): string {
  const text = message.charAt(0).toUpperCase() + message.slice(1)
  return /[.!?]$/.test(text) ? text : `${text}.`
}

export function parseSlipError(message: string): {
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
          [pick[1]]: `The price moved, so this bet now pays ${moved[1]} DC if it wins. Tap Place again to bet at the new price.`,
        },
        priceMoved: true,
      }
    }
    return { pickErrors: { [pick[1]]: sentence(pick[2]) } }
  }
  const parlay = PARLAY_ERROR.exec(message)
  if (parlay) return { parlayError: sentence(parlay[1]) }
  return { formError: sentence(message) }
}
