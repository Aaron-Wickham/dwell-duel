import { describe, it, expect, vi } from 'vitest'
import { ALWAYS_REQUIRED, PRODUCTION_REQUIRED, PRODUCTION_WARNED, assertRequiredEnv, missingEnv, missingWarnedEnv, warnMissingEnv } from '@/lib/env/required'

const BASE = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'publishable-key',
}

const PRODUCTION = {
  ...BASE,
  SUPABASE_SECRET_KEY: 'secret-key',
  CRON_SECRET: 'cron-secret',
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: 'vapid-public-key',
  VAPID_PRIVATE_KEY: 'vapid-private-key',
  VERCEL_ENV: 'production',
}

describe('missingEnv', () => {
  it('is empty when every always-required var is set, outside production', () => {
    expect(missingEnv(BASE)).toEqual([])
  })

  it('names every missing always-required var', () => {
    expect(missingEnv({})).toEqual([...ALWAYS_REQUIRED])
    expect(missingEnv({ NEXT_PUBLIC_SUPABASE_URL: 'https://x.supabase.co' })).toEqual(['NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'])
  })

  it('also requires the production vars, but only when VERCEL_ENV is production', () => {
    expect(missingEnv({ ...BASE, VERCEL_ENV: 'preview' })).toEqual([])
    expect(missingEnv({ ...BASE, VERCEL_ENV: 'development' })).toEqual([])
    expect(missingEnv({ ...BASE, VERCEL_ENV: 'production' })).toEqual([...PRODUCTION_REQUIRED])
  })

  it('is empty in production once every var is set', () => {
    expect(missingEnv(PRODUCTION)).toEqual([])
  })

  it('treats an empty string the same as unset', () => {
    expect(missingEnv({ ...BASE, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: '' })).toEqual(['NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'])
  })
})

describe('assertRequiredEnv', () => {
  it('does not throw when nothing is missing', () => {
    expect(() => assertRequiredEnv(BASE)).not.toThrow()
    expect(() => assertRequiredEnv(PRODUCTION)).not.toThrow()
  })

  it('throws naming every missing var', () => {
    expect(() => assertRequiredEnv({ ...BASE, VERCEL_ENV: 'production', SUPABASE_SECRET_KEY: 'x' })).toThrow(
      'Missing required environment variables: CRON_SECRET',
    )
  })

  // #210: push degrades on its own without its keys, so they can't take the whole site down.
  it('boots production without the push keys, warning about each missing one instead', () => {
    const { VAPID_PRIVATE_KEY: _private, ...withoutPrivate } = PRODUCTION
    expect(missingEnv(withoutPrivate)).toEqual([])
    expect(missingWarnedEnv(withoutPrivate)).toEqual(['VAPID_PRIVATE_KEY'])
    const { NEXT_PUBLIC_VAPID_PUBLIC_KEY: _public, VAPID_PRIVATE_KEY: _key, ...withoutBoth } = PRODUCTION
    expect(missingWarnedEnv(withoutBoth)).toEqual([...PRODUCTION_WARNED])
    expect(missingWarnedEnv({ ...BASE, VERCEL_ENV: 'preview' })).toEqual([])

    const warn = vi.fn()
    warnMissingEnv(withoutPrivate, warn)
    expect(warn).toHaveBeenCalledWith('Missing environment variables: VAPID_PRIVATE_KEY. Push notifications are off until they are set.')
    warnMissingEnv(PRODUCTION, warn)
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it("never includes a variable's value in the message", () => {
    expect.assertions(1)
    try {
      assertRequiredEnv({ ...BASE, VERCEL_ENV: 'production', SUPABASE_SECRET_KEY: 'super-secret-value' })
    } catch (error) {
      expect((error as Error).message).not.toContain('super-secret-value')
    }
  })
})
