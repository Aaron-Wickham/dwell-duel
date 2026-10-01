import { describe, it, expect } from 'vitest'
import { NAME_ORDER, decodeNameCursor, encodeNameCursor, readNamePageParams } from '@/lib/pagination/name-cursor'

const ID = '3f2a0c1e-8d8b-4c43-9f0f-0a7c5b1d2e3f'

describe('name cursor', () => {
  it('round-trips any display name', () => {
    for (const name of ['Ben', 'O"Brien, (Jr.)', 'Back\\slash', 'Zoë 🎲']) {
      expect(decodeNameCursor(encodeNameCursor({ name, id: ID }))).toEqual({ name, id: ID })
    }
  })

  it('drops a tampered or malformed cursor', () => {
    expect(decodeNameCursor('not!base64')).toBeNull()
    expect(decodeNameCursor(encodeNameCursor({ name: 'Ben', id: 'not-a-uuid' }))).toBeNull()
    expect(decodeNameCursor(encodeNameCursor({ name: 'x'.repeat(81), id: ID }))).toBeNull()
    expect(decodeNameCursor(btoa(JSON.stringify([1, ID])))).toBeNull()
    expect(readNamePageParams({ after: 'nope' }, 'after')).toEqual({ top: null, bottom: null })
  })

  it('reads A–Z after a key, ties by id, with the name quoted', () => {
    expect(NAME_ORDER.after({ name: 'O"B', id: ID })).toBe(
      `or(display_name.gt."O\\"B",and(display_name.eq."O\\"B",id.gt."${ID}"))`,
    )
    expect(NAME_ORDER.range({ top: null, bottom: { name: 'Ben', id: ID } })).toBe(
      `or(display_name.lt."Ben",and(display_name.eq."Ben",id.lte."${ID}"))`,
    )
    expect(NAME_ORDER.range({ top: null, bottom: null })).toBeNull()
  })
})
