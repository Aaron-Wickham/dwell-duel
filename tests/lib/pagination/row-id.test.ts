import { describe, it, expect } from 'vitest'
import { focusTarget, rowDomId } from '@/lib/pagination/row-id'

describe('rowDomId', () => {
  it('prefixes a plain id as it is, whether a number or a string', () => {
    expect(rowDomId('ledger', 4242)).toBe('ledger-4242')
    expect(rowDomId('market-closed', '0b9c3f5e-8a1d-4c2b-9e7f-1a2b3c4d5e6f')).toBe(
      'market-closed-0b9c3f5e-8a1d-4c2b-9e7f-1a2b3c4d5e6f',
    )
  })

  it('escapes every character outside letters, digits and hyphens', () => {
    expect(rowDomId('feed', 'win:12:ab')).toBe('feed-win_003a12_003aab')
    expect(rowDomId('feed', 'a b"c')).toBe('feed-a_0020b_0022c')
    expect(rowDomId('feed', 'task_1')).toBe('feed-task_005f1')
  })

  it('never maps two different ids to one DOM id', () => {
    const ids = ['bet:1', 'bet_1', 'bet-1', 'bet_003a1', 'bet:1:', 'é', 'éx']
    expect(new Set(ids.map((id) => rowDomId('feed', id))).size).toBe(ids.length)
  })
})

describe('focusTarget', () => {
  it('makes the row focusable by script only, and names it from its own content', () => {
    expect(focusTarget('ledger-7')).toEqual({ id: 'ledger-7', tabIndex: -1, 'aria-labelledby': 'ledger-7' })
  })

  it('names the row from a given label id instead, when its own content would be too verbose', () => {
    expect(focusTarget('market-closed-m7', 'market-closed-m7-title')).toEqual({
      id: 'market-closed-m7',
      tabIndex: -1,
      'aria-labelledby': 'market-closed-m7-title',
    })
  })

  it('adds nothing for a row with no id, even with a label id given', () => {
    expect(focusTarget(undefined)).toEqual({})
    expect(focusTarget('')).toEqual({})
    expect(focusTarget(undefined, 'some-title')).toEqual({})
  })
})
