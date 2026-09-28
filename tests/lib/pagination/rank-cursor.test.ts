import { describe, it, expect } from 'vitest'
import {
  RANK_ORDER,
  aheadOfRankFilter,
  decodeRankCursor,
  encodeRankCursor,
  readRankPageParams,
  type RankCursor,
} from '@/lib/pagination/rank-cursor'

const ID = '0b9c3f5e-8a1d-4c2b-9e7f-1a2b3c4d5e6f'

// What arbitrary bytes or text encode to, so a test can hand-craft a tampered cursor.
function encodeBytes(bytes: number[]): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
const encodeText = (text: string) => encodeBytes([...new TextEncoder().encode(text)])

type Member = { balance: number; display_name: string; id: string }

// Evaluates a filter the way PostgREST's `or=(…)` does: nested and(…) / or(…) around
// `col.op."value"` leaves, where a backslash inside the quotes escapes the next character.
function matches(filter: string, row: Member): boolean {
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
      if (filter[i] !== ')') throw new Error(`expected ) at ${i}: ${filter.slice(i)}`)
      i++
      return group[1] === 'and' ? parts.every(Boolean) : parts.some(Boolean)
    }
    const leaf = /^(balance|display_name|id)\.(lt|lte|gt|gte|eq)\."/.exec(filter.slice(i))
    if (!leaf) throw new Error(`unparsed filter at ${i}: ${filter.slice(i)}`)
    i += leaf[0].length
    let text = ''
    while (filter[i] !== '"') {
      if (i >= filter.length) throw new Error('unterminated value')
      if (filter[i] === '\\') i++
      text += filter[i]
      i++
    }
    i++
    const column = leaf[1] as keyof Member
    const value = row[column]
    const other = column === 'balance' ? Number(text) : text
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

const NAMES = ['Ann', 'O"Brien, (Jr.)', 'Back\\slash', 'x"),id.gt.(0', 'Zoë 🎲', 'a,b.c:d', 'Ann']

// 49 members in tiers of balances, so ties span several names, and the last seven repeat the first
// seven's names, so a tie on balance and name falls back to the id.
const BOARD: Member[] = Array.from({ length: 49 }, (_, i) => ({
  balance: [300, 150, 150, 90, 90, 90, 0][i % 7],
  display_name: NAMES[Math.floor(i / 7) % NAMES.length] + (i % 3 === 0 ? '' : ` ${i % 3}`),
  id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
})).sort((a, b) =>
  a.balance !== b.balance ? b.balance - a.balance : a.display_name !== b.display_name ? (a.display_name < b.display_name ? -1 : 1) : a.id < b.id ? -1 : 1,
)

const keyOf = (m: Member): RankCursor => ({ balance: m.balance, name: m.display_name, id: m.id })
const select = (filter: string | null) => BOARD.filter((m) => filter === null || matches(filter, m))

describe('encodeRankCursor / decodeRankCursor', () => {
  it.each<RankCursor>([
    { balance: 150, name: 'Alice', id: ID },
    { balance: 0, name: '', id: ID },
    { balance: 2_147_483_647, name: 'O"Brien, (Jr.) \\ back', id: ID },
    { balance: 42, name: 'Zoë 🎲 — ünïcode', id: ID },
    { balance: 7, name: '🎲'.repeat(80), id: ID },
  ])('round-trips $balance / $name', (cursor) => {
    const encoded = encodeRankCursor(cursor)
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(decodeRankCursor(encoded)).toEqual(cursor)
  })

  it.each([undefined, null, '', ' ', 'not a cursor', '!!!', 'a'.repeat(1001)])('decodes %j to null', (raw) => {
    expect(decodeRankCursor(raw)).toBeNull()
  })

  it('decodes a repeated query param (an array) to null', () => {
    const one = encodeRankCursor({ balance: 1, name: 'A', id: ID })
    expect(decodeRankCursor([one, one])).toBeNull()
  })

  it.each([
    ['a JSON object', `{"balance":1,"name":"A","id":"${ID}"}`],
    ['two elements', `[1,"A"]`],
    ['four elements', `[1,"A","${ID}","x"]`],
    ['a string balance', `["1","A","${ID}"]`],
    ['a negative balance', `[-1,"A","${ID}"]`],
    ['a fractional balance', `[1.5,"A","${ID}"]`],
    ['an unsafe integer balance', `[9007199254740993,"A","${ID}"]`],
    ['a balance just past int4 max', `[2147483648,"A","${ID}"]`],
    ['a balance just past int4 min', `[-2147483649,"A","${ID}"]`],
    ['a numeric name', `[1,7,"${ID}"]`],
    ['a name past 80 characters', `[1,"${'a'.repeat(81)}","${ID}"]`],
    ['an id that is not a uuid', `[1,"A","42"]`],
    ['an id with filter syntax', `[1,"A","${ID}),id.gt.(0"]`],
    ['not JSON at all', `1,A,${ID}`],
  ])('decodes a tampered cursor with %s to null', (_label, text) => {
    expect(decodeRankCursor(encodeText(text))).toBeNull()
  })

  it('decodes bytes that are not UTF-8 to null', () => {
    expect(decodeRankCursor(encodeBytes([0x5b, 0x31, 0x2c, 0x22, 0xff, 0xfe, 0x22, 0x5d]))).toBeNull()
  })
})

describe('readRankPageParams', () => {
  it('reads the range end from the param and the window start from param_from', () => {
    const top: RankCursor = { balance: 90, name: 'Top', id: ID }
    const bottom: RankCursor = { balance: 10, name: 'Bottom', id: ID }
    expect(
      readRankPageParams({ before: encodeRankCursor(bottom), before_from: encodeRankCursor(top) }, 'before'),
    ).toEqual({ top, bottom })
    expect(readRankPageParams({ before: 'garbage' }, 'before')).toEqual({ top: null, bottom: null })
  })
})

describe('RANK_ORDER filters', () => {
  it('builds the strictly-after filter in the board order, with every value quoted', () => {
    expect(RANK_ORDER.after({ balance: 90, name: 'Bob', id: ID })).toBe(
      `or(balance.lt."90",and(balance.eq."90",or(display_name.gt."Bob",and(display_name.eq."Bob",id.gt."${ID}"))))`,
    )
  })

  it('escapes quotes and backslashes in a name, so it stays a literal', () => {
    const filter = RANK_ORDER.after({ balance: 1, name: 'x"),id.gt.(0\\', id: ID })
    expect(filter).toContain('display_name.gt."x\\"),id.gt.(0\\\\"')
    expect(select(filter)).toEqual(BOARD.filter((m) => m.balance < 1 || (m.balance === 1 && m.display_name > 'x"),id.gt.(0\\')))
  })

  it('selects exactly the members after each member on the board', () => {
    BOARD.forEach((member, index) => {
      expect(select(RANK_ORDER.after(keyOf(member)))).toEqual(BOARD.slice(index + 1))
    })
  })

  it('selects exactly the members ahead of each member on the board', () => {
    BOARD.forEach((member, index) => {
      expect(select(aheadOfRankFilter(keyOf(member)))).toEqual(BOARD.slice(0, index))
    })
  })

  it('reads a range from the top to its end, from a window start down, and between the two, both inclusive', () => {
    expect(RANK_ORDER.range({ top: null, bottom: null })).toBeNull()
    expect(select(RANK_ORDER.range({ top: null, bottom: keyOf(BOARD[20]) }))).toEqual(BOARD.slice(0, 21))
    expect(select(RANK_ORDER.range({ top: keyOf(BOARD[20]), bottom: null }))).toEqual(BOARD.slice(20))
    expect(select(RANK_ORDER.range({ top: keyOf(BOARD[5]), bottom: keyOf(BOARD[30]) }))).toEqual(BOARD.slice(5, 31))
  })

  it('encodes a next cursor that decodes to the same member', () => {
    expect(decodeRankCursor(RANK_ORDER.encode(keyOf(BOARD[3])))).toEqual(keyOf(BOARD[3]))
  })
})
