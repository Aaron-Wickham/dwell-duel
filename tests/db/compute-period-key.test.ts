import { describe, it, expect, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { seedMembers, clientFor, type Member } from './fixtures'

// Periods run midnight to midnight in America/New_York (0054, #82). Instants below are UTC;
// Eastern is UTC-4 in summer (EDT) and UTC-5 in winter (EST). In 2026 the clocks go forward on
// 8 March and back on 1 November.
let alice: Member
let client: SupabaseClient

beforeEach(async () => {
  ;[alice] = await seedMembers()
  client = await clientFor(alice)
})

async function key(period: 'daily' | 'weekly' | 'monthly' | 'yearly' | null, at?: string): Promise<string> {
  const { data, error } = await client.rpc('compute_period_key', at ? { p_period: period, p_at: at } : { p_period: period })
  if (error) throw error
  return data
}

describe('group_time_zone', () => {
  it('is US Eastern', async () => {
    const { data, error } = await client.rpc('group_time_zone')
    expect(error).toBeNull()
    expect(data).toBe('America/New_York')
  })
})

describe('compute_period_key', () => {
  it('returns "once" for a null period regardless of timestamp', async () => {
    expect(await key(null)).toBe('once')
  })

  it('puts 23:30 and 00:30 Eastern in different days', async () => {
    expect(await key('daily', '2026-09-24T03:30:00Z')).toBe('2026-09-23')
    expect(await key('daily', '2026-09-24T04:30:00Z')).toBe('2026-09-24')
  })

  it('keeps 20:00 Eastern, after midnight UTC, in the same day as 09:00 Eastern', async () => {
    const morning = await key('daily', '2026-09-23T13:00:00Z')
    const evening = await key('daily', '2026-09-24T00:00:00Z')
    expect(morning).toBe('2026-09-23')
    expect(evening).toBe(morning)
  })

  it('turns the day at Eastern midnight either side of the spring-forward change', async () => {
    expect(await key('daily', '2026-03-08T04:59:59Z')).toBe('2026-03-07') // 23:59:59 EST
    expect(await key('daily', '2026-03-08T05:00:00Z')).toBe('2026-03-08') // 00:00 EST
    expect(await key('daily', '2026-03-09T03:59:59Z')).toBe('2026-03-08') // 23:59:59 EDT
    expect(await key('daily', '2026-03-09T04:00:00Z')).toBe('2026-03-09') // 00:00 EDT
  })

  it('turns the day at Eastern midnight either side of the fall-back change', async () => {
    expect(await key('daily', '2026-11-01T03:59:59Z')).toBe('2026-10-31') // 23:59:59 EDT
    expect(await key('daily', '2026-11-01T04:00:00Z')).toBe('2026-11-01') // 00:00 EDT
    expect(await key('daily', '2026-11-02T04:59:59Z')).toBe('2026-11-01') // 23:59:59 EST, a 25-hour day
    expect(await key('daily', '2026-11-02T05:00:00Z')).toBe('2026-11-02') // 00:00 EST
  })

  it('starts the ISO week at Monday 00:00 Eastern', async () => {
    const monday = await key('weekly', '2026-09-21T04:00:00Z') // Mon 21 Sep 00:00 EDT
    const sundayNight = await key('weekly', '2026-09-28T03:59:59Z') // Sun 27 Sep 23:59:59 EDT
    const nextMonday = await key('weekly', '2026-09-28T04:00:00Z')
    expect(monday).toBe('2026-W39')
    expect(sundayNight).toBe(monday)
    expect(nextMonday).toBe('2026-W40')
  })

  it('starts the week after the fall-back change at Monday 00:00 EST', async () => {
    expect(await key('weekly', '2026-11-02T04:59:59Z')).toBe('2026-W44')
    expect(await key('weekly', '2026-11-02T05:00:00Z')).toBe('2026-W45')
  })

  it('turns the month at Eastern midnight on the 1st', async () => {
    expect(await key('monthly', '2026-09-01T04:00:00Z')).toBe('2026-09')
    expect(await key('monthly', '2026-10-01T03:59:59Z')).toBe('2026-09') // 30 Sep 23:59:59 EDT
    expect(await key('monthly', '2026-10-01T04:00:00Z')).toBe('2026-10')
  })

  it('turns the year at Eastern midnight on 1 January', async () => {
    expect(await key('yearly', '2027-01-01T04:59:59Z')).toBe('2026') // 31 Dec 23:59:59 EST
    expect(await key('yearly', '2027-01-01T05:00:00Z')).toBe('2027')
  })

  it('is not affected by a client-supplied session timezone', async () => {
    // A PostgREST client can set the DB session's TimeZone for a single
    // request via `Prefer: timezone=<zone>`. If compute_period_key ever
    // formats using that ambient session timezone again instead of a
    // pinned zone, the same instant would produce two different
    // period_keys depending on which zone the caller asked for -- letting
    // a member bypass the once-per-period cap by simply varying this header.
    const fixedInstant = '2026-09-23T05:00:00Z'

    const { data: underUtc, error: utcError } = await client
      .rpc('compute_period_key', { p_period: 'daily', p_at: fixedInstant })
      .setHeader('Prefer', 'timezone=UTC')
    const { data: underSamoa, error: samoaError } = await client
      .rpc('compute_period_key', { p_period: 'daily', p_at: fixedInstant })
      .setHeader('Prefer', 'timezone=Etc/GMT+12')

    expect(utcError).toBeNull()
    expect(samoaError).toBeNull()
    expect(underUtc).toBe('2026-09-23')
    expect(underSamoa).toBe(underUtc)
  })
})
