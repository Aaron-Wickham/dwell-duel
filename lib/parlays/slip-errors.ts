// place_slip (0039) prefixes a failure with the pick or the parlay it came from.
const PICK_ERROR = /^pick ([0-9a-f-]{36}): (.+)$/i
const PARLAY_ERROR = /^parlay: (.+)$/i

function sentence(message: string): string {
  const text = message.charAt(0).toUpperCase() + message.slice(1)
  return /[.!?]$/.test(text) ? text : `${text}.`
}

export function parseSlipError(message: string): {
  formError?: string
  pickErrors?: Record<string, string>
  parlayError?: string
} {
  const pick = PICK_ERROR.exec(message)
  if (pick) return { pickErrors: { [pick[1]]: sentence(pick[2]) } }
  const parlay = PARLAY_ERROR.exec(message)
  if (parlay) return { parlayError: sentence(parlay[1]) }
  return { formError: sentence(message) }
}
