export const SLIP_COOKIE = 'parlay_slip'

// The same cap as a parlay's MAX_PICKS; solo picks count toward it too.
export const MAX_SLIP_PICKS = 10

// The market page shows this beside a full slip, and addToSlipAction returns it when the slip
// filled up elsewhere (another tab, say) since the page was drawn.
export const SLIP_FULL_MESSAGE = `Your slip is full (${MAX_SLIP_PICKS} picks). Place or remove some to add more.`

// One pick per outcome. `parlay` is the pick's Solo / Parlay switch; a new pick starts as Solo.
export type SlipEntry = { outcomeId: string; parlay: boolean }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Stored as [{ o: <outcome id>, p: 0 | 1 }]. A cookie from before solo picks existed is a bare
// list of ids, all of them parlay picks, so each reads back as one.
export function parseSlip(raw: string | undefined): SlipEntry[] {
  if (!raw) return []
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) return []
  const entries = parsed.flatMap((v): SlipEntry[] => {
    if (typeof v === 'string') return UUID.test(v) ? [{ outcomeId: v, parlay: true }] : []
    if (v && typeof v === 'object' && typeof v.o === 'string' && UUID.test(v.o)) {
      return [{ outcomeId: v.o, parlay: v.p === 1 }]
    }
    return []
  })
  const seen = new Set<string>()
  return entries.filter((e) => !seen.has(e.outcomeId) && seen.add(e.outcomeId)).slice(0, MAX_SLIP_PICKS)
}

export function serializeSlip(entries: SlipEntry[]): string {
  return JSON.stringify(entries.slice(0, MAX_SLIP_PICKS).map((e) => ({ o: e.outcomeId, p: e.parlay ? 1 : 0 })))
}
