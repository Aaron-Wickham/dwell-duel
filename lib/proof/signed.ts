import type { DbClient } from '@/lib/supabase/database'
import type { ProofView } from './types'

export interface ProofRow {
  id: string
  kind: 'image' | 'file' | 'link'
  storage_path: string | null
  url: string | null
  file_name: string | null
  expired_at?: string | null
}

export const PROOF_COLUMNS = 'id, kind, storage_path, url, file_name, expired_at'

export const SIGNED_URL_SECONDS = 3600
// A signed URL is handed out again until it has this long left, so a page opened from it still has
// time to open the photo.
const REUSE_MARGIN_MS = 15 * 60 * 1000
const MAX_CACHED = 2000

// Each signing makes a new URL, and a new URL is a new download for the browser, so a review queue
// that re-rendered on every live refresh fetched every photo again (#452). A viewer is handed the
// URL they were already given for most of its hour instead. Keyed by viewer, never shared: the
// bucket's policies decided this viewer may see the file when it was signed, and a URL they already
// hold is all that's reused. Per server instance, so it only ever saves work.
const signedCache = new Map<string, { url: string; expiresAt: number }>()

function cacheKey(viewerId: string, path: string): string {
  return `${viewerId}\u0000${path}`
}

function rememberSigned(key: string, url: string, expiresAt: number): void {
  if (signedCache.size >= MAX_CACHED) {
    const now = Date.now()
    for (const [k, v] of signedCache) if (v.expiresAt - REUSE_MARGIN_MS <= now) signedCache.delete(k)
    // Still full of live entries: drop the oldest (a Map iterates in insertion order).
    while (signedCache.size >= MAX_CACHED) signedCache.delete(signedCache.keys().next().value!)
  }
  signedCache.set(key, { url, expiresAt })
}

// Files are private; each gets a signed URL good for an hour, made with the viewer's own client so
// the bucket's policies (0042) still decide who may see it. A file the viewer can't sign is dropped;
// one the retention job removed (#253) comes back marked expired, so the page can say so. Given the
// viewer's id, a URL signed for them earlier is reused while it has a while left.
export async function toProofViews(supabase: DbClient, rows: ProofRow[], viewerId?: string): Promise<ProofView[]> {
  const paths = [...new Set(rows.flatMap((r) => (r.storage_path && !r.expired_at ? [r.storage_path] : [])))]
  const signed = new Map<string, string>()
  const now = Date.now()
  const unsigned = paths.filter((path) => {
    const cached = viewerId ? signedCache.get(cacheKey(viewerId, path)) : undefined
    if (cached && cached.expiresAt - REUSE_MARGIN_MS > now) {
      signed.set(path, cached.url)
      return false
    }
    return true
  })
  if (unsigned.length) {
    const { data, error } = await supabase.storage.from('proof').createSignedUrls(unsigned, SIGNED_URL_SECONDS)
    if (error) throw error
    const expiresAt = now + SIGNED_URL_SECONDS * 1000
    for (const s of data ?? []) {
      if (!s.path || !s.signedUrl) continue
      signed.set(s.path, s.signedUrl)
      if (viewerId) rememberSigned(cacheKey(viewerId, s.path), s.signedUrl, expiresAt)
    }
  }
  return rows.flatMap((r): ProofView[] => {
    if (r.kind === 'link' && r.url) return [{ id: r.id, kind: 'link', href: r.url, label: r.url.replace(/^https?:\/\//, '') }]
    if (r.expired_at) return [{ id: r.id, kind: r.kind, href: '', label: r.file_name ?? 'Attachment', expired: true }]
    const href = r.storage_path ? signed.get(r.storage_path) : undefined
    return href ? [{ id: r.id, kind: r.kind, href, label: r.file_name ?? 'Attachment' }] : []
  })
}
