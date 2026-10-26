import { downscaleImage } from './downscale'
import { PROOF_MAX_BYTES, PROOF_MAX_FILES, PROOF_MAX_TOTAL_BYTES, type ProofDraft, type ProofRecord } from './types'

// Loaded at upload time, so the pages with a proof picker don't ship the Supabase client up front.
async function proofBucket() {
  const { browserClient } = await import('@/lib/supabase/client')
  return browserClient().storage.from('proof')
}

// A path is never written twice (each upload gets its own UUID folder), so a cached copy can't go
// stale (#452). A day, not a year: a file the retention job deletes shouldn't linger in a cache.
export const PROOF_CACHE_SECONDS = String(24 * 60 * 60)

// What Storage's refusals mean to a member (#253's caps in 0089), never its raw message: the
// rolling-day quota is an insert-policy refusal, which Storage reports as a row-level security
// violation. Matched on the status code, the error code or the message, since Storage versions
// differ in which they fill in. A resolution upload is also refused when the uploader can no longer
// resolve the market, and Storage can't say which, so its refusal names both.
export const UPLOAD_LIMIT_ERROR =
  'You’ve reached today’s upload limit (30 files or 60 MB). Try again tomorrow, or add a link instead.'

export const RESOLUTION_REFUSED_ERROR =
  'That proof didn’t upload: you may have reached today’s upload limit, or can no longer resolve this market. Reload the page and try again.'

export function uploadErrorMessage(
  name: string,
  error: { message?: string; statusCode?: string; code?: string },
  prefix = 'task/',
): string {
  const message = error.message?.toLowerCase() ?? ''
  const status = error.statusCode ?? ''
  if (status === '403' || error.code === 'AccessDenied' || message.includes('row-level security')) {
    return prefix.startsWith('resolution/') ? RESOLUTION_REFUSED_ERROR : UPLOAD_LIMIT_ERROR
  }
  if (status === '413' || error.code === 'EntityTooLarge' || message.includes('maximum allowed size')) {
    return `${name} is over 3 MB. Pick a smaller file.`
  }
  if (status === '415' || error.code === 'InvalidMimeType' || message.includes('mime type')) {
    return `${name} isn’t a photo, PDF or text file. Pick one of those.`
  }
  return `${name} didn’t upload. Check your connection and try again.`
}

function safeName(name: string): string {
  return name.replace(/[^A-Za-z0-9._-]+/g, '-').slice(-80) || 'file'
}

// Uploads straight from the browser into the caller's folder in the proof bucket (a server
// action's body is capped at 1MB), then hands back the records the RPC checks and stores. If any
// upload fails, the ones that went up are removed again and the error is thrown, its message one a
// member can act on. `onProgress` hears which file is going up ("Uploading 1 of 3…").
export async function uploadProof(
  drafts: ProofDraft[],
  prefix: string,
  { onProgress }: { onProgress?: (current: number, total: number) => void } = {},
): Promise<ProofRecord[]> {
  const bucket = await proofBucket()
  const uploaded: string[] = []
  const records: ProofRecord[] = []
  let totalBytes = 0
  const fileCount = drafts.filter((d) => d.kind !== 'link').length
  try {
    if (fileCount > PROOF_MAX_FILES) {
      throw new Error(`Add at most ${PROOF_MAX_FILES} photos or files. Remove one and try again.`)
    }
    for (const draft of drafts) {
      if (draft.kind === 'link') {
        records.push({ kind: 'link', url: draft.url })
        continue
      }
      onProgress?.(uploaded.length + 1, fileCount)
      const file = draft.kind === 'image' ? await downscaleImage(draft.file) : draft.file
      if (file.size > PROOF_MAX_BYTES) throw new Error(`${draft.file.name} is over 3 MB. Pick a smaller file.`)
      totalBytes += file.size
      if (totalBytes > PROOF_MAX_TOTAL_BYTES) throw new Error('Those files are over 6 MB together. Remove one and try again.')
      const path = `${prefix}${crypto.randomUUID()}/${safeName(file.name)}`
      const { error } = await bucket.upload(path, file, { contentType: file.type || undefined, cacheControl: PROOF_CACHE_SECONDS })
      if (error) {
        console.error('Proof upload failed', error)
        throw new Error(uploadErrorMessage(draft.file.name, error, prefix))
      }
      uploaded.push(path)
      records.push({ kind: draft.kind, storage_path: path, file_name: draft.file.name, size_bytes: file.size })
    }
    return records
  } catch (error) {
    if (uploaded.length) await bucket.remove(uploaded)
    throw error
  }
}

export async function discardProof(records: ProofRecord[]): Promise<void> {
  const paths = records.flatMap((r) => (r.kind === 'link' ? [] : [r.storage_path]))
  if (paths.length) await (await proofBucket()).remove(paths)
}
