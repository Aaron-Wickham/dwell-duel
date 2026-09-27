import { describe, it, expect } from 'vitest'
import { CLAWBACK_PREFIX, clawbackMessage, parseClawbackError } from '@/lib/markets/clawback'

const bob = { display_name: 'Bob', owed: 60, balance: 20 }
const carol = { display_name: 'Carol', owed: 30, balance: 15 }
const dan = { display_name: 'Dan', owed: 10, balance: 5 }

describe('parseClawbackError', () => {
  it('reads the members from the message resolve_market raises', () => {
    // jsonb prints its keys in its own order, with spaces.
    const message = `${CLAWBACK_PREFIX}[{"owed": 60, "balance": 20, "display_name": "Bob"}, {"owed": 30, "balance": 15, "display_name": "Carol"}]`
    expect(parseClawbackError(message)).toEqual([bob, carol])
  })

  it('drops any extra fields', () => {
    expect(parseClawbackError(`${CLAWBACK_PREFIX}[{"display_name":"Bob","owed":60,"balance":20,"id":"x"}]`)).toEqual([bob])
  })

  it.each([
    ['no message', undefined],
    ['a null message', null],
    ['an empty message', ''],
    ['any other database error', 'new row for relation "profiles" violates check constraint "profiles_balance_check"'],
    ['the prefix somewhere other than the start', `oops ${CLAWBACK_PREFIX}[{"display_name":"Bob","owed":60,"balance":20}]`],
    ['JSON that does not parse', `${CLAWBACK_PREFIX}[{"display_name":`],
    ['an empty list', `${CLAWBACK_PREFIX}[]`],
    ['an object, not a list', `${CLAWBACK_PREFIX}{"display_name":"Bob","owed":60,"balance":20}`],
    ['a member without a name', `${CLAWBACK_PREFIX}[{"owed":60,"balance":20}]`],
    ['an amount that is not a whole number', `${CLAWBACK_PREFIX}[{"display_name":"Bob","owed":"60","balance":20}]`],
    ['a null entry', `${CLAWBACK_PREFIX}[null]`],
  ])('returns null for %s', (_case, message) => {
    expect(parseClawbackError(message)).toBeNull()
  })
})

describe('clawbackMessage', () => {
  it('names one member, with what they spent and what they won', () => {
    expect(clawbackMessage([bob])).toBe(
      'Can’t override: Bob has already spent 40 of 60 DC won on this market. Adjust their balances first if you still want to override.',
    )
  })

  it('joins a second member with ", and"', () => {
    expect(clawbackMessage([bob, carol])).toBe(
      'Can’t override: Bob has already spent 40 of 60 DC won on this market, and Carol 15 of 30. Adjust their balances first if you still want to override.',
    )
  })

  it('lists three or more with a comma before the last', () => {
    expect(clawbackMessage([bob, carol, dan])).toBe(
      'Can’t override: Bob has already spent 40 of 60 DC won on this market, Carol 15 of 30, and Dan 5 of 10. Adjust their balances first if you still want to override.',
    )
  })

  it('keeps the order it was given', () => {
    expect(clawbackMessage([carol, bob])).toMatch(/^Can’t override: Carol has already spent 15 of 30 DC won on this market, and Bob 40 of 60\./)
  })

  it('returns null for an empty list, rather than throwing', () => {
    expect(clawbackMessage([])).toBeNull()
  })
})
