import { describe, it, expect } from 'vitest'
import { legStatus } from '@/lib/parlays/leg-status'

describe('legStatus', () => {
  it('is voided when the market was voided', () => {
    expect(legStatus('voided', null, 'pick')).toBe('voided')
  })

  it('is won when the market resolved to the pick', () => {
    expect(legStatus('resolved', 'pick', 'pick')).toBe('won')
  })

  it('is lost when the market resolved to anything else', () => {
    expect(legStatus('resolved', 'other', 'pick')).toBe('lost')
  })

  it('is pending while the market is open', () => {
    expect(legStatus('open', null, 'pick')).toBe('pending')
  })
})
