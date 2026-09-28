import type { DbClient } from '@/lib/supabase/database'
import type { ProofView } from './types'

export interface ProofRow {
  id: string
  kind: 'image' | 'file' | 'link'
  storage_path: string | null
  url: string | null
  file_name: string | null
}

export const PROOF_COLUMNS = 'id, kind, storage_path, url, file_name'

// Files are private; each gets a signed URL good for an hour, made with the viewer's own client so
// the bucket's policies (0042) still decide who may see it. A file the viewer can't sign is dropped.
export async function toProofViews(supabase: DbClient, rows: ProofRow[]): Promise<ProofView[]> {
  const paths = rows.flatMap((r) => (r.storage_path ? [r.storage_path] : []))
  const signed = new Map<string, string>()
  if (paths.length) {
    const { data, error } = await supabase.storage.from('proof').createSignedUrls(paths, 3600)
    if (error) throw error
    for (const s of data ?? []) if (s.path && s.signedUrl) signed.set(s.path, s.signedUrl)
  }
  return rows.flatMap((r): ProofView[] => {
    if (r.kind === 'link' && r.url) return [{ id: r.id, kind: 'link', href: r.url, label: r.url.replace(/^https?:\/\//, '') }]
    const href = r.storage_path ? signed.get(r.storage_path) : undefined
    return href ? [{ id: r.id, kind: r.kind, href, label: r.file_name ?? 'Attachment' }] : []
  })
}
