import { describe, it, expect, beforeEach } from 'vitest'
import { seedMembers, clientFor, type Member } from './fixtures'

let alice: Member

beforeEach(async () => {
  ;[alice] = await seedMembers()
})

describe('compute_period_key', () => {
  it('returns "once" for a null period regardless of timestamp', async () => {
    const client = await clientFor(alice)
    const { data, error } = await client.rpc('compute_period_key', { p_period: null })
    expect(error).toBeNull()
    expect(data).toBe('once')
  })

  it('groups the same calendar day together and separates the next one', async () => {
    const client = await clientFor(alice)
    const { data: a } = await client.rpc('compute_period_key', {
      p_period: 'daily',
      p_at: '2026-09-23T00:00:00Z',
    })
    const { data: b } = await client.rpc('compute_period_key', {
      p_period: 'daily',
      p_at: '2026-09-23T23:59:59Z',
    })
    const { data: c } = await client.rpc('compute_period_key', {
      p_period: 'daily',
      p_at: '2026-09-24T00:00:00Z',
    })
    expect(a).toBe(b)
    expect(a).not.toBe(c)
  })

  it('groups the same ISO week (Monday-Sunday) together and separates the next one', async () => {
    const client = await clientFor(alice)
    const { data: monday } = await client.rpc('compute_period_key', {
      p_period: 'weekly',
      p_at: '2026-09-21T00:00:00Z',
    })
    const { data: sunday } = await client.rpc('compute_period_key', {
      p_period: 'weekly',
      p_at: '2026-09-27T23:59:59Z',
    })
    const { data: nextMonday } = await client.rpc('compute_period_key', {
      p_period: 'weekly',
      p_at: '2026-09-28T00:00:01Z',
    })
    expect(monday).toBe(sunday)
    expect(monday).not.toBe(nextMonday)
  })

  it('groups the same calendar month together and separates the next one', async () => {
    const client = await clientFor(alice)
    const { data: start } = await client.rpc('compute_period_key', {
      p_period: 'monthly',
      p_at: '2026-09-01T00:00:00Z',
    })
    const { data: end } = await client.rpc('compute_period_key', {
      p_period: 'monthly',
      p_at: '2026-09-30T23:59:59Z',
    })
    const { data: nextMonth } = await client.rpc('compute_period_key', {
      p_period: 'monthly',
      p_at: '2026-10-01T00:00:00Z',
    })
    expect(start).toBe(end)
    expect(start).not.toBe(nextMonth)
  })

  it('groups the same calendar year together and separates the next one', async () => {
    const client = await clientFor(alice)
    const { data: start } = await client.rpc('compute_period_key', {
      p_period: 'yearly',
      p_at: '2026-01-01T00:00:00Z',
    })
    const { data: end } = await client.rpc('compute_period_key', {
      p_period: 'yearly',
      p_at: '2026-12-31T23:59:59Z',
    })
    const { data: nextYear } = await client.rpc('compute_period_key', {
      p_period: 'yearly',
      p_at: '2027-01-01T00:00:00Z',
    })
    expect(start).toBe(end)
    expect(start).not.toBe(nextYear)
  })
})
