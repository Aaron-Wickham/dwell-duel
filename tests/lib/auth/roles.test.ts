import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { adminHref, atLeast, getRole, isRole } from '@/lib/auth/roles'

function client(result: { data: unknown; error: unknown }) {
  return { rpc: async () => result } as unknown as SupabaseClient
}

describe('getRole', () => {
  it('returns the role the RPC reports', async () => {
    await expect(getRole(client({ data: 'reviewer', error: null }))).resolves.toBe('reviewer')
  })

  it('falls back to member for anything unexpected', async () => {
    await expect(getRole(client({ data: 'superuser', error: null }))).resolves.toBe('member')
    await expect(getRole(client({ data: null, error: null }))).resolves.toBe('member')
  })

  it('throws on an RPC error, instead of silently demoting to member', async () => {
    const error = new Error('connection reset')
    await expect(getRole(client({ data: null, error }))).rejects.toBe(error)
  })
})

describe('atLeast', () => {
  it('ranks owner > admin > reviewer > member', () => {
    expect(atLeast('owner', 'admin')).toBe(true)
    expect(atLeast('admin', 'admin')).toBe(true)
    expect(atLeast('reviewer', 'admin')).toBe(false)
    expect(atLeast('reviewer', 'reviewer')).toBe(true)
    expect(atLeast('member', 'reviewer')).toBe(false)
  })
})

describe('adminHref', () => {
  it('sends admins to invites, reviewers to the approval queue, and members nowhere', () => {
    expect(adminHref('owner')).toBe('/admin/invites')
    expect(adminHref('admin')).toBe('/admin/invites')
    expect(adminHref('reviewer')).toBe('/admin/tasks')
    expect(adminHref('member')).toBeNull()
  })

  // #385: Admin opens where the work is, task submissions first.
  it('opens the section with work waiting, task submissions first', () => {
    expect(adminHref('owner', { tasks: 2, markets: 3 })).toBe('/admin/tasks')
    expect(adminHref('admin', { tasks: 0, markets: 3 })).toBe('/admin/markets')
    expect(adminHref('admin', { tasks: 0, markets: 0 })).toBe('/admin/invites')
    expect(adminHref('reviewer', { tasks: 4, markets: 0 })).toBe('/admin/tasks')
    expect(adminHref('reviewer', { tasks: 0, markets: 2 })).toBe('/admin/tasks')
    expect(adminHref('member', { tasks: 4, markets: 2 })).toBeNull()
  })
})

describe('isRole', () => {
  it('accepts only the four roles', () => {
    expect(isRole('admin')).toBe(true)
    expect(isRole('superuser')).toBe(false)
    expect(isRole(1)).toBe(false)
  })
})
