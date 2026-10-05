import { describe, it, expect } from 'vitest'
import { readOrdered } from '@/lib/pagination/keyset'
import {
  compareByValue,
  decodeValueCursor,
  encodeValueCursor,
  readValuePageParams,
  valueOrder,
  valueOrderInMemory,
  type ValueCursor,
} from '@/lib/pagination/value-cursor'

const ID = '3f2a0c1e-8d8b-4c43-9f0f-0a7c5b1d2e3f'

type Row = { value: number; display_name: string; id: string }

// Evaluates a filter the way PostgREST's `or=(…)` does, over the columns valueOrder names.
function matches(filter: string, row: Row): boolean {
  let i = 0
  function term(): boolean {
    const group = /^(and|or)\(/.exec(filter.slice(i))
    if (group) {
      i += group[0].length
      const parts = [term()]
      while (filter[i] === ',') {
        i++
        parts.push(term())
      }
      i++
      return group[1] === 'and' ? parts.every(Boolean) : parts.some(Boolean)
    }
    const leaf = /^(value|display_name|id)\.(lt|lte|gt|gte|eq)\."/.exec(filter.slice(i))
    if (!leaf) throw new Error(`unparsed filter at ${i}: ${filter.slice(i)}`)
    i += leaf[0].length
    let text = ''
    while (filter[i] !== '"') {
      if (filter[i] === '\\') i++
      text += filter[i]
      i++
    }
    i++
    const value = row[leaf[1] as keyof Row]
    const other = leaf[1] === 'value' ? Number(text) : text
    switch (leaf[2]) {
      case 'lt':
        return value < other
      case 'lte':
        return value <= other
      case 'gt':
        return value > other
      case 'gte':
        return value >= other
      default:
        return value === other
    }
  }
  const result = term()
  if (i !== filter.length) throw new Error(`trailing filter text: ${filter.slice(i)}`)
  return result
}

// 130 members in a few tiers of value, so ties span names, and names repeat, so ties fall to the id.
const MEMBERS: Row[] = Array.from({ length: 130 }, (_, i) => ({
  value: [500, 100, 100, 0, -20][i % 5],
  display_name: ['Ann', 'O"Brien, (Jr.)', 'Zoë', 'Ann'][i % 4],
  id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
}))
const keyOf = (r: Row): ValueCursor => ({ value: r.value, name: r.display_name, id: r.id })

// Reads the first page, then "Show more" until the end, and returns the ids on screen at the end.
async function readAll(ascending: boolean, inMemory: boolean): Promise<string[]> {
  const sorted = [...MEMBERS].sort((a, b) => compareByValue(ascending)(keyOf(a), keyOf(b)))
  let page: { top: ValueCursor | null; bottom: ValueCursor | null } = { top: null, bottom: null }
  for (let n = 0; n < 10; n++) {
    const result = inMemory
      ? await readOrdered(page, valueOrderInMemory(ascending), async (keep, limit) => sorted.filter((r) => !keep || keep(keyOf(r))).slice(0, limit), keyOf, undefined, 1000, 25)
      : await readOrdered(page, valueOrder('value', ascending), async (filter, limit) => sorted.filter((r) => !filter || matches(filter, r)).slice(0, limit), keyOf, undefined, 1000, 25)
    if (!result.next) return result.rows.map((r) => r.id)
    page = { top: null, bottom: decodeValueCursor(result.next.cursor, 'integer') }
  }
  throw new Error('never reached the end')
}

describe('value cursor', () => {
  it('round-trips a figure or a timestamp with any name', () => {
    for (const name of ['Ben', 'O"Brien, (Jr.)', 'Zoë 🎲']) {
      expect(decodeValueCursor(encodeValueCursor({ value: -40, name, id: ID }), 'integer')).toEqual({ value: -40, name, id: ID })
    }
    const ts = '2026-09-01T12:00:00.123456+00:00'
    expect(decodeValueCursor(encodeValueCursor({ value: ts, name: 'Ben', id: ID }), 'timestamp')).toEqual({ value: ts, name: 'Ben', id: ID })
  })

  it('drops a cursor of the wrong kind, or a tampered one', () => {
    expect(decodeValueCursor(encodeValueCursor({ value: 10, name: 'Ben', id: ID }), 'timestamp')).toBeNull()
    expect(decodeValueCursor(encodeValueCursor({ value: '2026-02-30T00:00:00Z', name: 'Ben', id: ID }), 'timestamp')).toBeNull()
    expect(decodeValueCursor(encodeValueCursor({ value: 1.5, name: 'Ben', id: ID }), 'integer')).toBeNull()
    expect(decodeValueCursor(encodeValueCursor({ value: 1, name: 'Ben', id: 'nope' }), 'integer')).toBeNull()
    expect(readValuePageParams({ after: 'nope' }, 'after', 'integer')).toEqual({ top: null, bottom: null })
  })

  it('reads after a key in either direction, ties by name then id, every value quoted', () => {
    expect(valueOrder('balance', false).after({ value: 10, name: 'O"B', id: ID })).toBe(
      `or(balance.lt."10",and(balance.eq."10",or(display_name.gt."O\\"B",and(display_name.eq."O\\"B",id.gt."${ID}"))))`,
    )
    expect(valueOrder('joined_at', true).range({ top: null, bottom: { value: '2026-09-01T00:00:00Z', name: 'Ben', id: ID } })).toBe(
      `or(joined_at.lt."2026-09-01T00:00:00Z",and(joined_at.eq."2026-09-01T00:00:00Z",or(display_name.lt."Ben",and(display_name.eq."Ben",id.lte."${ID}"))))`,
    )
    expect(valueOrder('balance', true).range({ top: null, bottom: null })).toBeNull()
  })

  for (const ascending of [false, true]) {
    for (const inMemory of [false, true]) {
      it(`pages through every member exactly once, ${ascending ? 'lowest' : 'highest'} first${inMemory ? ', sorted in memory' : ''}`, async () => {
        const expected = [...MEMBERS].sort((a, b) => compareByValue(ascending)(keyOf(a), keyOf(b))).map((r) => r.id)
        expect(await readAll(ascending, inMemory)).toEqual(expected)
      })
    }
  }
})
