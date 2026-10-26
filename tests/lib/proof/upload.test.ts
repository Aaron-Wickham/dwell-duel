import { describe, it, expect, vi, beforeEach } from 'vitest'

const upload = vi.fn()
const remove = vi.fn()
vi.mock('@/lib/supabase/client', () => ({ browserClient: () => ({ storage: { from: () => ({ upload, remove }) } }) }))
vi.mock('@/lib/proof/downscale', () => ({ downscaleImage: async (f: File) => f }))

import { UPLOAD_LIMIT_ERROR, uploadErrorMessage, uploadProof } from '@/lib/proof/upload'
import { PROOF_MAX_BYTES, PROOF_MAX_FILES, PROOF_MAX_ITEMS, PROOF_MAX_TOTAL_BYTES, PROOF_FILE_ACCEPT, PROOF_FILE_TYPES } from '@/lib/proof/types'

beforeEach(() => {
  upload.mockReset().mockResolvedValue({ error: null })
  remove.mockReset().mockResolvedValue({ error: null })
})

const file = (name: string, bytes = 10, type = 'application/pdf') => new File([new Uint8Array(bytes)], name, { type })
const draft = (f: File, kind: 'image' | 'file' = 'file') => ({ key: f.name, kind, file: f }) as const

describe('proof limits', () => {
  it('matches the database: 5 items, 3 files, 3 MB a file, 6 MB together, no Word', () => {
    expect([PROOF_MAX_ITEMS, PROOF_MAX_FILES, PROOF_MAX_BYTES, PROOF_MAX_TOTAL_BYTES]).toEqual([5, 3, 3145728, 6291456])
    expect(PROOF_FILE_TYPES).toEqual(['application/pdf', 'text/plain'])
    expect(PROOF_FILE_ACCEPT).toBe('.pdf,.txt')
  })
})

describe('uploadProof', () => {
  it('refuses a fourth photo or file before uploading anything', async () => {
    const drafts = [1, 2, 3, 4].map((n) => draft(file(`${n}.pdf`)))
    await expect(uploadProof(drafts, 'task/u/')).rejects.toThrow('at most 3')
    expect(upload).not.toHaveBeenCalled()
  })

  it('refuses a file over 3 MB', async () => {
    await expect(uploadProof([draft(file('big.pdf', PROOF_MAX_BYTES + 1))], 'task/u/')).rejects.toThrow('over 3 MB')
  })

  it('refuses files over 6 MB together, and removes the ones that went up', async () => {
    const drafts = [draft(file('a.pdf', 2.5 * 1024 * 1024)), draft(file('b.pdf', 2.5 * 1024 * 1024)), draft(file('c.pdf', 2.5 * 1024 * 1024))]
    await expect(uploadProof(drafts, 'task/u/')).rejects.toThrow('over 6 MB together')
    expect(remove).toHaveBeenCalledTimes(1)
    expect(remove.mock.calls[0][0]).toHaveLength(2)
  })

  it('does not count links against the file cap', async () => {
    const drafts = [
      ...[1, 2, 3].map((n) => draft(file(`${n}.pdf`))),
      { key: 'l', kind: 'link', url: 'https://example.com' } as const,
    ]
    expect(await uploadProof(drafts, 'task/u/')).toHaveLength(4)
  })

  it('uploads each file with a day-long cache lifetime (#452)', async () => {
    await uploadProof([draft(file('a.pdf'))], 'task/u/')
    expect(upload).toHaveBeenCalledWith(expect.stringMatching(/^task\/u\/.+\/a\.pdf$/), expect.anything(), expect.objectContaining({ cacheControl: '86400' }))
  })
})

describe('upload failures (TSK-4)', () => {
  it('says today’s limit for the insert policy’s refusal, never Storage’s words, and logs the raw error', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const refusal = { message: 'new row violates row-level security policy', statusCode: '403' }
    upload.mockResolvedValueOnce({ error: null }).mockResolvedValueOnce({ error: refusal })
    const attempt = uploadProof([draft(file('a.pdf')), draft(file('b.pdf'))], 'task/u/')
    await expect(attempt).rejects.toThrow(UPLOAD_LIMIT_ERROR)
    expect(UPLOAD_LIMIT_ERROR).toContain('30 files or 60 MB')
    expect(log).toHaveBeenCalledWith('Proof upload failed', refusal)
    expect(remove).toHaveBeenCalledTimes(1)
  })

  it.each([
    [{ message: 'new row violates row-level security policy' }, UPLOAD_LIMIT_ERROR],
    [{ message: 'The object exceeded the maximum allowed size', statusCode: '413' }, 'a.jpg is over 3 MB. Pick a smaller file.'],
    [{ message: 'x', code: 'EntityTooLarge' }, 'a.jpg is over 3 MB. Pick a smaller file.'],
    [{ message: 'mime type image/gif is not supported', statusCode: '415' }, 'a.jpg isn’t a photo, PDF or text file. Pick one of those.'],
    [{ message: 'Failed to fetch' }, 'a.jpg didn’t upload. Check your connection and try again.'],
  ])('maps %o to words a member can act on', (error, words) => {
    expect(uploadErrorMessage('a.jpg', error)).toBe(words)
  })

  it('reports which file is going up, counting only files', async () => {
    const onProgress = vi.fn()
    const drafts = [draft(file('a.pdf')), { key: 'l', kind: 'link', url: 'https://example.com' } as const, draft(file('b.pdf'))]
    await uploadProof(drafts, 'task/u/', { onProgress })
    expect(onProgress.mock.calls).toEqual([
      [1, 2],
      [2, 2],
    ])
  })
})
