import { describe, it, expect } from 'vitest'
import { legStatus } from '@/lib/parlays/leg-status'

const CLOSE = '2026-10-01T12:00:00Z'
const BEFORE = Date.parse(CLOSE) - 1
const AFTER = Date.parse(CLOSE) + 1

describe('legStatus', () => {
  it('is voided when the market was voided', () => {
    expect(legStatus('voided', null, 'pick', CLOSE, AFTER)).toBe('voided')
  })

  it('is won when the market resolved to the pick', () => {
    expect(legStatus('resolved', 'pick', 'pick', CLOSE, BEFORE)).toBe('won')
  })

  it('is lost when the market resolved to anything else', () => {
    expect(legStatus('resolved', 'other', 'pick', CLOSE, AFTER)).toBe('lost')
  })

  it('is open until the market closes', () => {
    expect(legStatus('open', null, 'pick', CLOSE, BEFORE)).toBe('open')
  })

  it('is awaiting once the market has closed with no result', () => {
    expect(legStatus('open', null, 'pick', CLOSE, Date.parse(CLOSE))).toBe('awaiting')
    expect(legStatus('open', null, 'pick', CLOSE, AFTER)).toBe('awaiting')
  })
})
