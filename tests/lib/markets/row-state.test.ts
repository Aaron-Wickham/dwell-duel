import { describe, it, expect } from 'vitest'
import { rowState } from '@/lib/markets/row-state'

describe('rowState', () => {
  it('is inslip when the outcome is in the slip, even when the market is closed', () => {
    expect(rowState('o1', { slip: ['o1'], canBet: false, slipFull: false })).toBe('inslip')
  })

  it('is none when betting is closed and the outcome is not in the slip', () => {
    expect(rowState('o1', { slip: [], canBet: false, slipFull: false })).toBe('none')
  })

  it('is disabled when the slip is full and this outcome is not already in it', () => {
    expect(rowState('o1', { slip: ['o2', 'o3'], canBet: true, slipFull: true })).toBe('disabled')
  })

  it('is add otherwise, even for an outcome nobody has bet on yet', () => {
    expect(rowState('o1', { slip: [], canBet: true, slipFull: false })).toBe('add')
  })
})
