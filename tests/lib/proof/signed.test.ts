import { describe, it, expect, vi, afterEach } from 'vitest'
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

// #452: a re-render hands a viewer the URL they already have, so the browser's copy is reused.
describe('toProofViews signed URL reuse', () => {
  let n = 0
  const signer = () => {
    const createSignedUrls = vi.fn(async (paths: string[]) => ({ data: paths.map((path) => ({ path, signedUrl: `https://signed/${path}?t=${++n}` })), error: null }))
    return { createSignedUrls, supabase: { storage: { from: () => ({ createSignedUrls }) } } as unknown as DbClient }
  }
  const row = (id: string, path: string) => ({ id, kind: 'image' as const, storage_path: path, url: null, file_name: `${id}.webp`, expired_at: null })

  afterEach(() => vi.useRealTimers())

  it('reuses a viewer’s URL for most of its hour, then signs a fresh one', async () => {
    vi.useFakeTimers()
    const { supabase, createSignedUrls } = signer()
    const first = await toProofViews(supabase, [row('1', 'reuse/a.webp')], 'viewer-1')
    vi.advanceTimersByTime(40 * 60 * 1000)
    const again = await toProofViews(supabase, [row('1', 'reuse/a.webp'), row('2', 'reuse/b.webp')], 'viewer-1')
    expect(again[0].href).toBe(first[0].href)
    expect(createSignedUrls).toHaveBeenNthCalledWith(2, ['reuse/b.webp'], 3600)

    vi.advanceTimersByTime(10 * 60 * 1000)
    const later = await toProofViews(supabase, [row('1', 'reuse/a.webp')], 'viewer-1')
    expect(later[0].href).not.toBe(first[0].href)
  })

  it('never hands one viewer’s URL to another, nor reuses one without a viewer', async () => {
    const { supabase, createSignedUrls } = signer()
    await toProofViews(supabase, [row('1', 'own/a.webp')], 'viewer-1')
    await toProofViews(supabase, [row('1', 'own/a.webp')], 'viewer-2')
    await toProofViews(supabase, [row('1', 'own/a.webp')])
    await toProofViews(supabase, [row('1', 'own/a.webp')])
    expect(createSignedUrls).toHaveBeenCalledTimes(4)
  })
})
