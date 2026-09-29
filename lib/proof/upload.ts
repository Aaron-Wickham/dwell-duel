import { downscaleImage } from './downscale'
import { PROOF_MAX_BYTES, type ProofDraft, type ProofRecord } from './types'

// Loaded at upload time, so the pages with a proof picker don't ship the Supabase client up front.
async function proofBucket() {
  const { browserClient } = await import('@/lib/supabase/client')
  return browserClient().storage.from('proof')
}

function safeName(name: string): string {
  return name.replace(/[^A-Za-z0-9._-]+/g, '-').slice(-80) || 'file'
}

// Uploads straight from the browser into the caller's folder in the proof bucket (a server
// action's body is capped at 1MB), then hands back the records the RPC checks and stores. If any
// upload fails, the ones that went up are removed again and the error is thrown.
export async function uploadProof(drafts: ProofDraft[], prefix: string): Promise<ProofRecord[]> {
  const bucket = await proofBucket()
  const uploaded: string[] = []
  const records: ProofRecord[] = []
  try {
    for (const draft of drafts) {
      if (draft.kind === 'link') {
        records.push({ kind: 'link', url: draft.url })
        continue
      }
      const file = draft.kind === 'image' ? await downscaleImage(draft.file) : draft.file
      if (file.size > PROOF_MAX_BYTES) throw new Error(`${draft.file.name} is over 10 MB.`)
      const path = `${prefix}${crypto.randomUUID()}/${safeName(file.name)}`
      const { error } = await bucket.upload(path, file, { contentType: file.type || undefined })
      if (error) throw new Error(`${draft.file.name} didn’t upload: ${error.message}`)
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
