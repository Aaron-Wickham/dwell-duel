// resolve_market (migration 0033) blocks an override that would claw back more than a past
// winner still has, raising this prefix and a JSON list of who's short. This turns it into the
// resolve form's message. A plain module, beside the 'use server' action that uses it.
export const CLAWBACK_PREFIX = 'clawback_short:'

export type ClawbackShort = { display_name: string; owed: number; balance: number }

function isShort(value: unknown): value is ClawbackShort {
  if (typeof value !== 'object' || value === null) return false
  const { display_name, owed, balance } = value as Record<string, unknown>
  return typeof display_name === 'string' && Number.isInteger(owed) && Number.isInteger(balance)
}

export function parseClawbackError(message: string | undefined | null): ClawbackShort[] | null {
  if (!message?.startsWith(CLAWBACK_PREFIX)) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(message.slice(CLAWBACK_PREFIX.length))
  } catch {
    return null
  }
  if (!Array.isArray(parsed) || parsed.length === 0 || !parsed.every(isShort)) return null
  return parsed.map(({ display_name, owed, balance }) => ({ display_name, owed, balance }))
}

export function clawbackMessage(short: ClawbackShort[]): string | null {
  if (short.length === 0) return null
  const [first, ...rest] = short.map(({ display_name, owed, balance }) => ({ name: display_name, spent: owed - balance, won: owed }))
  const lead = `${first.name} has already spent ${first.spent} of ${first.won} DC won on this market`
  const others = rest.map(({ name, spent, won }) => `${name} ${spent} of ${won}`)
  const list = others.length === 0 ? lead : `${[lead, ...others.slice(0, -1)].join(', ')}, and ${others.at(-1)}`
  return `Can’t override: ${list}. Adjust their balances first if you still want to override.`
}
