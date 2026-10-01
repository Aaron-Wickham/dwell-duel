import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { serviceClient } from './helpers'
import { pgQuery } from './pg-query'
import { seedMembers, clientFor, createTestMarket, createTestTask, ensureInvited, giveRole, type Member } from './fixtures'

// 0077 (#253): the 1 GB Storage quota is guarded in the database, not only in the browser.
let owner: Member
let bob: Member
let ownerClient: SupabaseClient
let bobClient: SupabaseClient

const JPEG = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], { type: 'image/jpeg' })
const uuid = () => crypto.randomUUID()
const db = () => serviceClient()

beforeEach(async () => {
  ;[owner, bob] = await seedMembers()
  await giveRole(owner, 'owner')
  ownerClient = await clientFor(owner)
  bobClient = await clientFor(bob)
  for (const c of [ownerClient, bobClient]) await ensureInvited(c)
})

afterEach(async () => {
  const names = await pgQuery<{ bucket_id: string; name: string }>(
    "select bucket_id, name from storage.objects where bucket_id in ('proof', 'avatars')",
  )
  for (const bucket of ['proof', 'avatars']) {
    const paths = names.filter((n) => n.bucket_id === bucket).map((n) => n.name)
    if (paths.length) await db().storage.from(bucket).remove(paths)
  }
})

async function upload(client: SupabaseClient, path: string, blob: Blob = JPEG, contentType = 'image/jpeg') {
  return client.storage.from('proof').upload(path, blob, { contentType })
}

async function uploaded(client: SupabaseClient, memberId: string, n: number) {
  const paths: string[] = []
  for (let i = 0; i < n; i++) {
    const path = `task/${memberId}/${uuid()}/p${i}.jpg`
    const { error } = await upload(client, path)
    expect(error).toBeNull()
    paths.push(path)
  }
  return paths
}

const exists = async (path: string) => (await pgQuery<{ name: string }>(`select name from storage.objects where name = '${path}'`)).length === 1

describe('proof bucket rules', () => {
  it('holds files to 3 MB and drops Word documents from the accepted types', async () => {
    const [bucket] = await pgQuery<{ file_size_limit: number; allowed_mime_types: string[] }>(
      "select file_size_limit, allowed_mime_types from storage.buckets where id = 'proof'",
    )
    expect(bucket.file_size_limit).toBe(3 * 1024 * 1024)
    expect([...bucket.allowed_mime_types].sort()).toEqual(
      ['application/pdf', 'image/heic', 'image/heif', 'image/jpeg', 'image/png', 'image/webp', 'text/plain'].sort(),
    )
  })

  it('refuses a Word document and an over-size file from the Storage API', async () => {
    const doc = await upload(bobClient, `task/${bob.id}/${uuid()}/a.doc`, new Blob(['x']), 'application/msword')
    expect(doc.error).not.toBeNull()
    const big = await upload(bobClient, `task/${bob.id}/${uuid()}/big.pdf`, new Blob([new Uint8Array(3 * 1024 * 1024 + 1)]), 'application/pdf')
    expect(big.error).not.toBeNull()
  })
})

describe('submitted proof is kept', () => {
  it('lets a member delete an unattached upload, but not one a submission holds', async () => {
    const { taskId } = await createTestTask(owner)
    const [attached, loose] = await uploaded(bobClient, bob.id, 2)
    const { error } = await bobClient.rpc('submit_task_completion', {
      p_task_id: taskId,
      p_attachments: [{ kind: 'image', storage_path: attached }],
    })
    expect(error).toBeNull()

    await bobClient.storage.from('proof').remove([attached, loose])
    expect(await exists(attached)).toBe(true)
    expect(await exists(loose)).toBe(false)
  })

  it("keeps a resolver's evidence once the market is resolved", async () => {
    const market = await createTestMarket(ownerClient, ['Yes', 'No'])
    const path = `resolution/${market.marketId}/${uuid()}/score.jpg`
    expect((await upload(ownerClient, path)).error).toBeNull()
    const { error } = await ownerClient.rpc('resolve_market', {
      p_market_id: market.marketId,
      p_outcome_id: market.outcomeIds[0],
      p_note: 'Final score',
      p_attachments: [{ kind: 'image', storage_path: path }],
    })
    expect(error).toBeNull()
    await ownerClient.storage.from('proof').remove([path])
    expect(await exists(path)).toBe(true)
  })
})

describe('upload quota', () => {
  it('stops a member at 30 proof uploads in a day', async () => {
    await uploaded(bobClient, bob.id, 30)
    const { error } = await upload(bobClient, `task/${bob.id}/${uuid()}/one-too-many.jpg`)
    expect(error).not.toBeNull()
    // Another member's quota is their own.
    expect((await upload(ownerClient, `task/${owner.id}/${uuid()}/fine.jpg`)).error).toBeNull()
  })

  it('counts only the last day', async () => {
    await uploaded(bobClient, bob.id, 30)
    await pgQuery("update storage.objects set created_at = now() - interval '2 days' where bucket_id = 'proof'")
    expect((await upload(bobClient, `task/${bob.id}/${uuid()}/again.jpg`)).error).toBeNull()
  })

  it('stops a member whose day already holds 60 MB', async () => {
    await uploaded(bobClient, bob.id, 1)
    await pgQuery(`update storage.objects set metadata = jsonb_set(metadata, '{size}', '${61 * 1024 * 1024}') where bucket_id = 'proof'`)
    expect((await upload(bobClient, `task/${bob.id}/${uuid()}/more.jpg`)).error).not.toBeNull()
  })
})

describe('per-submission cap', () => {
  it('takes 3 files and refuses a fourth', async () => {
    const { taskId } = await createTestTask(owner)
    const paths = await uploaded(bobClient, bob.id, 4)
    const items = paths.map((storage_path) => ({ kind: 'image', storage_path }))
    const tooMany = await bobClient.rpc('submit_task_completion', { p_task_id: taskId, p_attachments: items })
    expect(tooMany.error?.message).toBe('add at most 3 photos or files')
    const ok = await bobClient.rpc('submit_task_completion', { p_task_id: taskId, p_attachments: items.slice(0, 3) })
    expect(ok.error).toBeNull()
  })

  it('refuses more than 5 attachments in all, links included', async () => {
    const { taskId } = await createTestTask(owner)
    const links = Array.from({ length: 6 }, (_, i) => ({ kind: 'link', url: `https://example.com/${i}` }))
    const { error } = await bobClient.rpc('submit_task_completion', { p_task_id: taskId, p_attachments: links })
    expect(error?.message).toBe('add at most 5 attachments')
  })

  it('refuses files over 6 MB together, by the size Storage recorded', async () => {
    const { taskId } = await createTestTask(owner)
    const paths = await uploaded(bobClient, bob.id, 2)
    await pgQuery(`update storage.objects set metadata = jsonb_set(metadata, '{size}', '${4 * 1024 * 1024}') where name in ('${paths.join("','")}')`)
    const { error } = await bobClient.rpc('submit_task_completion', {
      p_task_id: taskId,
      p_attachments: paths.map((storage_path) => ({ kind: 'image', storage_path, size_bytes: 1 })),
    })
    expect(error?.message).toBe('those files are over 6 MB together')
  })
})

describe('retention', () => {
  async function submitWithFile() {
    const { taskId } = await createTestTask(owner)
    const [path] = await uploaded(bobClient, bob.id, 1)
    const { data: id } = await bobClient.rpc('submit_task_completion', {
      p_task_id: taskId,
      p_attachments: [{ kind: 'image', storage_path: path }, { kind: 'link', url: 'https://example.com/x' }],
    })
    return { completionId: id as string, path }
  }
  const expiredPaths = async () => ((await db().rpc('expired_proof_attachments')).data as { storage_path: string }[]).map((r) => r.storage_path)
  const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString()

  it('expires proof of a task reviewed over 30 days ago, never a pending or recent one', async () => {
    const { completionId, path } = await submitWithFile()
    expect(await expiredPaths()).toEqual([])

    await db().from('task_completions').update({ status: 'rejected', reviewed_at: daysAgo(10) }).eq('id', completionId)
    expect(await expiredPaths()).toEqual([])

    await db().from('task_completions').update({ reviewed_at: daysAgo(31) }).eq('id', completionId)
    expect(await expiredPaths()).toEqual([path])

    // Pending for a year is still pending.
    await db().from('task_completions').update({ status: 'pending', reviewed_at: null, submitted_at: daysAgo(365) }).eq('id', completionId)
    expect(await expiredPaths()).toEqual([])
  })

  it('expires resolution proof after 90 days', async () => {
    const market = await createTestMarket(ownerClient, ['Yes', 'No'])
    const path = `resolution/${market.marketId}/${uuid()}/score.jpg`
    expect((await upload(ownerClient, path)).error).toBeNull()
    await ownerClient.rpc('resolve_market', {
      p_market_id: market.marketId,
      p_outcome_id: market.outcomeIds[0],
      p_note: 'Final score',
      p_attachments: [{ kind: 'image', storage_path: path }],
    })
    await db().from('market_resolutions').update({ resolved_at: daysAgo(60) }).eq('market_id', market.marketId)
    expect(await expiredPaths()).toEqual([])
    await db().from('market_resolutions').update({ resolved_at: daysAgo(91) }).eq('market_id', market.marketId)
    expect(await expiredPaths()).toEqual([path])
  })

  it('stamps the rows, keeps them, and stops listing them', async () => {
    const { completionId } = await submitWithFile()
    await db().from('task_completions').update({ status: 'approved', reviewed_at: daysAgo(31), reviewed_by: owner.id }).eq('id', completionId)
    const { data } = await db().rpc('expired_proof_attachments')
    const ids = (data as { id: string }[]).map((r) => r.id)
    expect(ids).toHaveLength(1)

    const marked = await db().rpc('mark_proof_expired', { p_ids: ids })
    expect(marked.data).toBe(1)
    expect(await expiredPaths()).toEqual([])
    const { data: rows } = await db().from('proof_attachments').select('kind, expired_at').eq('task_completion_id', completionId).order('kind')
    expect(rows?.map((r) => [r.kind, r.expired_at !== null])).toEqual([['image', true], ['link', false]])
  })

  it('keeps the retention functions to the service role', async () => {
    for (const [fn, args] of [
      ['expired_proof_attachments', {}],
      ['mark_proof_expired', { p_ids: [] }],
      ['stray_avatar_objects', {}],
      ['storage_usage', {}],
    ] as const) {
      const { error } = await bobClient.rpc(fn, args)
      expect(error, fn).not.toBeNull()
    }
  })
})

describe('avatars and usage', () => {
  it('lists avatar files no profile points at once they are a day old', async () => {
    const pointed = `${bob.id}/${uuid()}.jpg`
    const loose = `${bob.id}/${uuid()}.jpg`
    for (const path of [pointed, loose]) {
      const { error } = await bobClient.storage.from('avatars').upload(path, JPEG, { contentType: 'image/jpeg' })
      expect(error).toBeNull()
    }
    await bobClient.rpc('update_my_profile', { p_display_name: 'Bob', p_bio: '', p_avatar_path: pointed })

    const names = async () => ((await db().rpc('stray_avatar_objects')).data as { name: string }[]).map((r) => r.name)
    expect(await names()).toEqual([])
    await pgQuery("update storage.objects set created_at = now() - interval '2 days' where bucket_id = 'avatars'")
    expect(await names()).toEqual([loose])
  })

  it('reports objects and bytes per bucket', async () => {
    await uploaded(bobClient, bob.id, 2)
    const { data, error } = await db().rpc('storage_usage')
    expect(error).toBeNull()
    const proof = (data as { bucket_id: string; objects: number; bytes: number }[]).find((b) => b.bucket_id === 'proof')
    expect(Number(proof?.objects)).toBe(2)
    expect(Number(proof?.bytes)).toBe(8)
  })
})
