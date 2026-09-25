import { describe, it, expect } from 'vitest'
import { parseSlip } from '@/lib/parlays/parse-slip'

const ids = Array.from({ length: 8 }, (_, i) => `0000000${i}-0000-4000-8000-000000000000`)

describe('parseSlip', () => {
  it('returns an empty slip for a missing, empty, or malformed cookie', () => {
    expect(parseSlip(undefined)).toEqual([])
    expect(parseSlip('')).toEqual([])
    expect(parseSlip('not json')).toEqual([])
    expect(parseSlip('{"a":1}')).toEqual([])
  })

  it('keeps well-formed outcome ids in order', () => {
    expect(parseSlip(JSON.stringify([ids[0], ids[1]]))).toEqual([ids[0], ids[1]])
  })

  it('drops anything that is not a uuid string', () => {
    expect(parseSlip(JSON.stringify([ids[0], 'x', 42, null, ids[1]]))).toEqual([ids[0], ids[1]])
  })

  it('drops duplicates', () => {
    expect(parseSlip(JSON.stringify([ids[0], ids[0], ids[1]]))).toEqual([ids[0], ids[1]])
  })

  it('keeps at most 6 picks', () => {
    expect(parseSlip(JSON.stringify(ids))).toEqual(ids.slice(0, 6))
  })
})
