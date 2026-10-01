import { describe, it, expect, vi } from 'vitest'
import { toProofViews } from '@/lib/proof/signed'
import type { DbClient } from '@/lib/supabase/database'

describe('toProofViews', () => {
  it('marks an expired file instead of signing it, and leaves the rest alone', async () => {
    const createSignedUrls = vi.fn().mockResolvedValue({ data: [{ path: 'task/u/2/b.webp', signedUrl: 'https://signed/b' }], error: null })
    const supabase = { storage: { from: () => ({ createSignedUrls }) } } as unknown as DbClient
    const views = await toProofViews(supabase, [
      { id: '1', kind: 'image', storage_path: 'task/u/1/a.webp', url: null, file_name: 'a.webp', expired_at: '2026-10-01T00:00:00Z' },
      { id: '2', kind: 'image', storage_path: 'task/u/2/b.webp', url: null, file_name: 'b.webp', expired_at: null },
      { id: '3', kind: 'link', storage_path: null, url: 'https://example.com/x', file_name: null, expired_at: null },
    ])
    expect(createSignedUrls).toHaveBeenCalledWith(['task/u/2/b.webp'], 3600)
    expect(views).toEqual([
      { id: '1', kind: 'image', href: '', label: 'a.webp', expired: true },
      { id: '2', kind: 'image', href: 'https://signed/b', label: 'b.webp' },
      { id: '3', kind: 'link', href: 'https://example.com/x', label: 'example.com/x' },
    ])
  })
})
