import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createOwnProfile } from '@/lib/auth/create-own-profile'

function fakeClient() {
  const insert = vi.fn(async () => ({ error: null }))
  return { client: { from: vi.fn(() => ({ insert })) } as unknown as SupabaseClient, insert }
}

describe('createOwnProfile display name', () => {
  it('cuts a name longer than 80 characters to 80, so sign-up never fails on it', async () => {
    const { client, insert } = fakeClient()

    const result = await createOwnProfile(client, 'u-1', 'long@example.com', 'n'.repeat(81), null)

    expect(result).toEqual({ ok: true })
    expect(insert).toHaveBeenCalledWith({ id: 'u-1', email: 'long@example.com', display_name: 'n'.repeat(80), avatar_url: null })
  })

  it('keeps a name of 80 characters or fewer as it is', async () => {
    const { client, insert } = fakeClient()

    await createOwnProfile(client, 'u-1', 'mia@example.com', 'Mia Thompson', 'https://example.com/a.png')

    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ display_name: 'Mia Thompson' }))
  })

  it('counts an emoji as one character and never splits it', async () => {
    const { client, insert } = fakeClient()

    await createOwnProfile(client, 'u-1', 'emoji@example.com', '😀'.repeat(81), null)

    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ display_name: '😀'.repeat(80) }))
  })
})
