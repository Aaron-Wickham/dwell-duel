import { describe, it, expect } from 'vitest'
import { MAX_SLIP_PICKS, parseSlip, serializeSlip } from '@/lib/parlays/parse-slip'

const ids = Array.from({ length: 12 }, (_, i) => `000000${String(i).padStart(2, '0')}-0000-4000-8000-000000000000`)

describe('parseSlip', () => {
  it('returns an empty slip for a missing, empty, or malformed cookie', () => {
    expect(parseSlip(undefined)).toEqual([])
    expect(parseSlip('')).toEqual([])
    expect(parseSlip('not json')).toEqual([])
    expect(parseSlip('{"a":1}')).toEqual([])
  })

  it('reads each pick with its Solo / Parlay switch, in order', () => {
    expect(parseSlip(JSON.stringify([{ o: ids[0], p: 0 }, { o: ids[1], p: 1 }]))).toEqual([
      { outcomeId: ids[0], parlay: false },
      { outcomeId: ids[1], parlay: true },
    ])
  })

  it('reads a slip saved before solo picks existed as all parlay picks', () => {
    expect(parseSlip(JSON.stringify([ids[0], ids[1]]))).toEqual([
      { outcomeId: ids[0], parlay: true },
      { outcomeId: ids[1], parlay: true },
    ])
  })

  it('drops anything that is not a uuid, and duplicates', () => {
    expect(parseSlip(JSON.stringify([{ o: ids[0], p: 0 }, 'x', 42, null, { o: 'y' }, { o: ids[0], p: 1 }, ids[1]]))).toEqual([
      { outcomeId: ids[0], parlay: false },
      { outcomeId: ids[1], parlay: true },
    ])
  })

  it(`keeps at most ${MAX_SLIP_PICKS} picks`, () => {
    expect(parseSlip(JSON.stringify(ids.map((o) => ({ o, p: 0 }))))).toHaveLength(MAX_SLIP_PICKS)
  })

  it('round-trips through serializeSlip', () => {
    const entries = [
      { outcomeId: ids[0], parlay: false },
      { outcomeId: ids[1], parlay: true },
    ]
    expect(parseSlip(serializeSlip(entries))).toEqual(entries)
  })
})
