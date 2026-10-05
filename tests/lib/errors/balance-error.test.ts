import { describe, it, expect } from 'vitest'
import { insufficientBalanceMessage, isBalanceCheckViolation } from '@/lib/errors/balance-error'

describe('isBalanceCheckViolation', () => {
  it('matches the profiles balance check violation', () => {
    expect(
      isBalanceCheckViolation({
        code: '23514',
        message: 'new row for relation "profiles" violates check constraint "profiles_balance_check"',
      }),
    ).toBe(true)
  })

  it('ignores a violation of some other check constraint', () => {
    expect(
      isBalanceCheckViolation({
        code: '23514',
        message: 'new row for relation "bets" violates check constraint "bets_amount_check"',
      }),
    ).toBe(false)
  })

  it('ignores a raised exception that merely mentions the constraint', () => {
    expect(isBalanceCheckViolation({ code: 'P0001', message: 'profiles_balance_check' })).toBe(false)
  })

  it('ignores no error and errors without a code or message', () => {
    expect(isBalanceCheckViolation(null)).toBe(false)
    expect(isBalanceCheckViolation({})).toBe(false)
    expect(isBalanceCheckViolation({ code: '23514' })).toBe(false)
  })
})

describe('insufficientBalanceMessage', () => {
  it("names the member's balance and how far short the stake is", () => {
    expect(insufficientBalanceMessage(120, 150)).toBe('You have 120 DC, 30 DC short. Try a smaller stake.')
    expect(insufficientBalanceMessage(0, 1_500)).toBe('You have 0 DC, 1,500 DC short. Try a smaller stake.')
  })

  it('names only the balance when the stake is unknown or covered', () => {
    expect(insufficientBalanceMessage(120)).toBe('You only have 120 DC. Try a smaller stake.')
    expect(insufficientBalanceMessage(120, 100)).toBe('You only have 120 DC. Try a smaller stake.')
  })
})
