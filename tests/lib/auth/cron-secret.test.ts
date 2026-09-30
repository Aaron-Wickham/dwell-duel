import { describe, it, expect } from 'vitest'
import { cronAuthorized } from '@/lib/auth/cron-secret'

describe('cronAuthorized (#203)', () => {
  it('accepts exactly the bearer header for the secret', () => {
    expect(cronAuthorized('Bearer s3cret', 's3cret')).toBe(true)
  })

  it('refuses a wrong, longer, shorter or missing header', () => {
    expect(cronAuthorized('Bearer s3cres', 's3cret')).toBe(false)
    expect(cronAuthorized('Bearer s3cret ', 's3cret')).toBe(false)
    expect(cronAuthorized('Bearer s3cre', 's3cret')).toBe(false)
    expect(cronAuthorized('bearer s3cret', 's3cret')).toBe(false)
    expect(cronAuthorized('s3cret', 's3cret')).toBe(false)
    expect(cronAuthorized(null, 's3cret')).toBe(false)
  })

  it('refuses everything when no secret is set, "Bearer undefined" included', () => {
    expect(cronAuthorized('Bearer undefined', undefined)).toBe(false)
    expect(cronAuthorized('Bearer ', '')).toBe(false)
    expect(cronAuthorized(null, undefined)).toBe(false)
  })

  it('compares bytes, not characters', () => {
    expect(cronAuthorized('Bearer é', 'é')).toBe(false)
    expect(cronAuthorized('Bearer é', 'é')).toBe(true)
  })
})
