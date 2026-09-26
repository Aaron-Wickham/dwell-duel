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
  it("names the member's balance in the approved copy", () => {
    expect(insufficientBalanceMessage(120)).toBe('Insufficient balance — you have 120 DC. Try a smaller amount.')
    expect(insufficientBalanceMessage(0)).toBe('Insufficient balance — you have 0 DC. Try a smaller amount.')
  })
})
