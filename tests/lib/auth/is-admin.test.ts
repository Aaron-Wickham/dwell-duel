import { describe, it, expect } from 'vitest'
import { isAdmin } from '@/lib/auth/is-admin'
import type { SupabaseClient } from '@supabase/supabase-js'

function client(result: { data: unknown; error: unknown }) {
  return { rpc: async () => result } as unknown as SupabaseClient
}

describe('isAdmin', () => {
  it('is true when the RPC returns true', async () => {
    await expect(isAdmin(client({ data: true, error: null }))).resolves.toBe(true)
  })

  it('is false when the RPC returns false', async () => {
    await expect(isAdmin(client({ data: false, error: null }))).resolves.toBe(false)
  })

  it('throws on an RPC error, instead of silently returning false', async () => {
    const error = new Error('connection reset')
    await expect(isAdmin(client({ data: null, error }))).rejects.toBe(error)
  })
})
