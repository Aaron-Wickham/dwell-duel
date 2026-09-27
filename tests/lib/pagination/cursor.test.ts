import { describe, it, expect } from 'vitest'
import {
  decodeCursor,
  encodeCursor,
  newestHref,
  readPageParams,
  showMoreHref,
  type Cursor,
} from '@/lib/pagination/cursor'

// What an arbitrary string encodes to, so a test can hand-craft a tampered cursor.
function encodeRaw(text: string): string {
  return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

describe('encodeCursor / decodeCursor', () => {
  it.each<Cursor>([
    { ts: '2026-09-26T10:15:30.123456+00:00', id: '4242' },
    { ts: '2026-09-26T10:15:30Z', id: '0b9c3f5e-8a1d-4c2b-9e7f-1a2b3c4d5e6f' },
    { ts: '2026-09-26T10:15:30.5-05:30', id: 'bet:99' },
    { ts: '2028-02-29T00:00:00+00:00', id: 'win:12:0b9c3f5e-8a1d-4c2b-9e7f-1a2b3c4d5e6f' },
    { ts: '2024-02-29T23:59:59.999999+15:00', id: 'task_completed-1' },
  ])('round-trips $ts / $id, keeping every microsecond', (cursor) => {
    const encoded = encodeCursor(cursor)
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(decodeCursor(encoded)).toEqual(cursor)
  })

  it('never uses +, / or = padding, whatever the input length', () => {
    const encoded = Array.from({ length: 300 }, (_, i) =>
      encodeCursor({ ts: `2026-09-26T10:15:30.${String(i).slice(0, 6)}Z`, id: `bet:${'~'.repeat(i % 7)}${i}`.replace(/~/g, '_') }),
    )
    expect(encoded.join('')).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(new Set(encoded.map((e) => e.length % 4)).size).toBeGreaterThan(1)
  })

  it.each([undefined, null, '', ' ', 'not a cursor', '!!!', 'a'.repeat(401)])('decodes %j to null', (raw) => {
    expect(decodeCursor(raw)).toBeNull()
  })

  it('decodes a repeated query param (an array) to null', () => {
    const one = encodeCursor({ ts: '2026-09-26T10:15:30Z', id: '1' })
    expect(decodeCursor([one, one])).toBeNull()
  })

  it.each([
    ['a JSON object', '{"ts":"2026-09-26T10:15:30Z","id":"1"}'],
    ['three elements', '["2026-09-26T10:15:30Z","1","x"]'],
    ['one element', '["2026-09-26T10:15:30Z"]'],
    ['a numeric id', '["2026-09-26T10:15:30Z",1]'],
    ['a date without a time', '["2026-09-26","1"]'],
    ['a timestamp without a zone', '["2026-09-26T10:15:30","1"]'],
    ['seven fractional digits', '["2026-09-26T10:15:30.1234567Z","1"]'],
    ['a month 13', '["2026-13-01T00:00:00Z","1"]'],
    ['30 February', '["2026-02-30T00:00:00Z","1"]'],
    ['29 February in a common year', '["2025-02-29T00:00:00Z","1"]'],
    ['year 0000', '["0000-01-01T00:00:00Z","1"]'],
    ['hour 25', '["2026-01-01T25:00:00Z","1"]'],
    ['an offset past Postgres’s ±15:59', '["2026-01-01T00:00:00+23:00","1"]'],
    ['an id with a quote', '["2026-09-26T10:15:30Z","1\\"),id.gt.(0"]'],
    ['an id with a comma', '["2026-09-26T10:15:30Z","1,2"]'],
    ['an id with a space', '["2026-09-26T10:15:30Z","1 2"]'],
    ['an empty id', '["2026-09-26T10:15:30Z",""]'],
    ['an id over 100 characters', `["2026-09-26T10:15:30Z","${'a'.repeat(101)}"]`],
    ['not JSON', '[2026-09-26'],
  ])('decodes a tampered cursor with %s to null', (_label, text) => {
    expect(decodeCursor(encodeRaw(text))).toBeNull()
  })

  it('decodes a cursor with a character flipped to null or to a still-valid cursor, never throwing', () => {
    const encoded = encodeCursor({ ts: '2026-09-26T10:15:30.123456+00:00', id: '4242' })
    for (let i = 0; i < encoded.length; i++) {
      const flipped = encoded.slice(0, i) + (encoded[i] === 'A' ? 'B' : 'A') + encoded.slice(i + 1)
      const decoded = decodeCursor(flipped)
      if (decoded) expect(decodeCursor(encodeCursor(decoded))).toEqual(decoded)
    }
  })
})

describe('readPageParams', () => {
  const bottom = { ts: '2026-09-26T10:00:00.000001+00:00', id: '10' }
  const top = { ts: '2026-09-26T12:00:00+00:00', id: '90' }

  it('reads the range end from the param and the window start from param_from', () => {
    expect(readPageParams({ before: encodeCursor(bottom), before_from: encodeCursor(top) }, 'before')).toEqual({ top, bottom })
  })

  it('treats missing, garbage and repeated params as absent', () => {
    expect(readPageParams({}, 'before')).toEqual({ top: null, bottom: null })
    expect(readPageParams({ before: 'junk', before_from: [encodeCursor(top), encodeCursor(top)] }, 'before')).toEqual({
      top: null,
      bottom: null,
    })
  })

  it("reads only its own list's params", () => {
    expect(readPageParams({ bets: encodeCursor(bottom), resolved: encodeCursor(top) }, 'bets')).toEqual({ top: null, bottom })
  })
})

describe('showMoreHref', () => {
  it('extends the range: sets the param and keeps the window start and every other param', () => {
    expect(
      showMoreHref('/markets', { resolved_from: 'TOP', tab: 'x', resolved: 'OLD' }, 'resolved', { kind: 'extend', cursor: 'NEW' }),
    ).toBe('/markets?resolved_from=TOP&tab=x&resolved=NEW')
  })

  it('starts a window: sets param_from and drops the range end', () => {
    expect(
      showMoreHref('/admin/ledger', { before: 'OLD', before_from: 'TOP', q: 'a' }, 'before', { kind: 'window', cursor: 'NEW' }),
    ).toBe('/admin/ledger?before_from=NEW&q=a')
  })

  it('keeps a repeated param and skips an undefined one', () => {
    expect(showMoreHref('/feed', { tag: ['a', 'b'], gone: undefined }, 'before', { kind: 'extend', cursor: 'C' })).toBe(
      '/feed?tag=a&tag=b&before=C',
    )
  })
})

describe('newestHref', () => {
  it('drops both of its params and keeps the rest', () => {
    expect(newestHref('/markets/m1', { bets: 'A', bets_from: 'B', other: 'C' }, 'bets')).toBe('/markets/m1?other=C')
  })

  it('leaves no trailing ? when nothing else remains', () => {
    expect(newestHref('/admin/ledger', { before: 'A', before_from: 'B' }, 'before')).toBe('/admin/ledger')
  })
})
