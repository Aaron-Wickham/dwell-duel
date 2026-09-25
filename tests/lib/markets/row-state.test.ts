import { describe, it, expect } from 'vitest'
import { rowState } from '@/lib/markets/row-state'

describe('rowState', () => {
  it('is inslip when the outcome is in the slip, even when the market is closed', () => {
    expect(rowState('o1', 40, { slip: ['o1'], canBet: false, slipFull: false })).toBe('inslip')
  })

  it('is none when betting is closed and the outcome is not in the slip', () => {
    expect(rowState('o1', 40, { slip: [], canBet: false, slipFull: false })).toBe('none')
  })

  it('is none when the pool is empty, even while betting is open', () => {
    expect(rowState('o1', 0, { slip: [], canBet: true, slipFull: false })).toBe('none')
  })

  it('is disabled when the slip is full and this outcome is not already in it', () => {
    expect(rowState('o1', 40, { slip: ['o2', 'o3'], canBet: true, slipFull: true })).toBe('disabled')
  })

  it('is add otherwise', () => {
    expect(rowState('o1', 40, { slip: [], canBet: true, slipFull: false })).toBe('add')
  })
})
