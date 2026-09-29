import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { addInvite } from '@/lib/invites/add-invite'

function fakeClient() {
  const insert = vi.fn(async () => ({ error: null }))
  const from = vi.fn(() => ({ insert }))
  return { client: { from } as unknown as SupabaseClient, from, insert }
}

// 64 + 1 + 185 + 4 = 254 characters.
const AT_LIMIT = `${'a'.repeat(64)}@${'b'.repeat(185)}.com`

describe('addInvite length limit', () => {
  it('refuses an email over 254 characters without inserting anything', async () => {
    const { client, from } = fakeClient()

    const result = await addInvite(client, 'admin-1', `x${AT_LIMIT}`)

    expect(result).toEqual({ ok: false, formError: 'Email can be at most 254 characters.' })
    expect(from).not.toHaveBeenCalled()
  })

  it('invites an email of exactly 254 characters, measured after trimming', async () => {
    const { client, insert } = fakeClient()

    const result = await addInvite(client, 'admin-1', `  ${AT_LIMIT.toUpperCase()}  `)

    expect(result).toEqual({ ok: true, email: AT_LIMIT })
    expect(insert).toHaveBeenCalledWith({ email: AT_LIMIT, invited_by: 'admin-1' })
  })
})
