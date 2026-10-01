// supabase/migrations/0042 and 0077: what the proof bucket accepts, and the attachment records the
// submit and resolve RPCs take. record_proof enforces the same caps.
export const PROOF_MAX_BYTES = 3 * 1024 * 1024
export const PROOF_MAX_ITEMS = 5
export const PROOF_MAX_FILES = 3
export const PROOF_MAX_TOTAL_BYTES = 6 * 1024 * 1024
export const PROOF_FILE_TYPES = ['application/pdf', 'text/plain']
// No HEIC here: naming it makes iOS hand over the original file instead of converting to JPEG. The
// bucket still allows it for desktop uploads.
export const PROOF_IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp'
export const PROOF_FILE_ACCEPT = '.pdf,.txt'

// Chosen in the browser, not yet uploaded.
export type ProofDraft =
  | { key: string; kind: 'image' | 'file'; file: File }
  | { key: string; kind: 'link'; url: string }

// What the RPCs record; storage paths are the caller's own folder in the proof bucket.
export type ProofRecord =
  | { kind: 'image' | 'file'; storage_path: string; file_name: string; size_bytes: number }
  | { kind: 'link'; url: string }

// Read back for display: `href` is a short-lived signed URL for a file, the link itself for a link.
export interface ProofView {
  id: string
  kind: 'image' | 'file' | 'link'
  href: string
  label: string
  // The file was removed by the retention job (0077); `href` is empty.
  expired?: boolean
}

export function isWebLink(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}
