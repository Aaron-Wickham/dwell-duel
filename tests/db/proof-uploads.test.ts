import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { rpcLoose, serviceClient, type TestClient } from './helpers'
import { expectError } from './assertions'
import { seedMembers, makeMember, clientFor, createTestMarket, createTestTask, ensureInvited, type Member, giveRole } from './fixtures'

let owner: Member
let bob: Member
let rita: Member
let mo: Member
let ownerClient: TestClient
let bobClient: TestClient
let ritaClient: TestClient
let moClient: TestClient

const JPEG = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], { type: 'image/jpeg' })
const uuid = () => crypto.randomUUID()

beforeEach(async () => {
  ;[owner, bob] = await seedMembers()
  rita = await makeMember('Rita')
  mo = await makeMember('Mo')
  await giveRole(owner, 'owner')
  await giveRole(rita, 'reviewer')
  ownerClient = await clientFor(owner)
  bobClient = await clientFor(bob)
  ritaClient = await clientFor(rita)
  moClient = await clientFor(mo)
  for (const c of [ownerClient, bobClient, ritaClient, moClient]) await ensureInvited(c)
})

afterEach(async () => {
  const db = serviceClient()
  for (const top of ['task', 'resolution']) {
    const { data: folders } = await db.storage.from('proof').list(top)
    for (const folder of folders ?? []) {
      const { data: subs } = await db.storage.from('proof').list(`${top}/${folder.name}`)
      for (const sub of subs ?? []) {
        const { data: files } = await db.storage.from('proof').list(`${top}/${folder.name}/${sub.name}`)
        const paths = (files ?? []).map((f) => `${top}/${folder.name}/${sub.name}/${f.name}`)
        if (paths.length) await db.storage.from('proof').remove(paths)
      }
    }
  }
})

async function upload(client: TestClient, path: string) {
  const { error } = await client.storage.from('proof').upload(path, JPEG, { contentType: 'image/jpeg' })
  if (error) throw error
  return path
}

describe('task proof', () => {
  it('lets an admin create and change a proof-required task through their own session', async () => {
    const { data, error } = await ownerClient
      .from('tasks')
      .insert({ title: 'Recite Psalm 1', reward_amount: 5, is_repeatable: false, proof_required: true })
      .select('id, proof_required')
      .single()
    expect(error).toBeNull()
    expect(data?.proof_required).toBe(true)
    const { error: updateErr } = await ownerClient.from('tasks').update({ proof_required: false }).eq('id', data!.id)
    expect(updateErr).toBeNull()
  })

  it('records a note, a photo and a link with the submission', async () => {
    const { taskId } = await createTestTask(owner)
    const path = await upload(bobClient, `task/${bob.id}/${uuid()}/page.jpg`)

    const { data: id, error } = await bobClient.rpc('submit_task_completion', {
      p_task_id: taskId,
      p_note: '  Read it with my small group  ',
      p_attachments: [
        { kind: 'image', storage_path: path, file_name: 'page.jpg', size_bytes: 4 },
        { kind: 'link', url: 'https://example.com/notes' },
      ],
    })
    expect(error).toBeNull()

    const db = serviceClient()
    const { data: completion } = await db.from('task_completions').select('note').eq('id', id as string).single()
    expect(completion?.note).toBe('Read it with my small group')
    const { data: rows } = await db.from('proof_attachments').select('kind, storage_path, url').eq('task_completion_id', id as string).order('kind')
    expect(rows).toEqual([
      { kind: 'image', storage_path: path, url: null },
      { kind: 'link', storage_path: null, url: 'https://example.com/notes' },
    ])
  })

  it('refuses a proof-required task with no proof, and takes it with a link', async () => {
    const { taskId } = await createTestTask(owner)
    await serviceClient().from('tasks').update({ proof_required: true }).eq('id', taskId)

    const bare = await bobClient.rpc('submit_task_completion', { p_task_id: taskId, p_note: 'Done!' })
    expect(bare.error?.message).toBe('this task needs proof: add a photo, file or link')

    const withLink = await bobClient.rpc('submit_task_completion', {
      p_task_id: taskId,
      p_attachments: [{ kind: 'link', url: 'https://example.com/recording' }],
    })
    expect(withLink.error).toBeNull()
  })

  it("refuses someone else's file, a file that never uploaded, and a non-web link", async () => {
    const { taskId } = await createTestTask(owner)
    const monsPath = await upload(moClient, `task/${mo.id}/${uuid()}/x.jpg`)
    for (const [items, message] of [
      [[{ kind: 'image', storage_path: monsPath }], "that file can't be attached here"],
      [[{ kind: 'image', storage_path: `task/${bob.id}/${uuid()}/ghost.jpg` }], "an attachment didn't finish uploading; try again"],
      [[{ kind: 'link', url: 'javascript:alert(1)' }], 'links must start with http:// or https://'],
    ] as const) {
      const { error } = await rpcLoose(bobClient, 'submit_task_completion', { p_task_id: taskId, p_attachments: items })
      expect(error?.message).toBe(message)
    }
  })

  it('lets only the member and reviewers read the proof', async () => {
    const { taskId } = await createTestTask(owner)
    const path = await upload(bobClient, `task/${bob.id}/${uuid()}/page.jpg`)
    const { data: id } = await bobClient.rpc('submit_task_completion', {
      p_task_id: taskId,
      p_attachments: [{ kind: 'image', storage_path: path }],
    })

    for (const [client, sees] of [
      [bobClient, true],
      [ritaClient, true],
      [moClient, false],
    ] as const) {
      const { data: rows } = await client.from('proof_attachments').select('id').eq('task_completion_id', id as string)
      expect(rows?.length ?? 0).toBe(sees ? 1 : 0)
      const { data: signed } = await client.storage.from('proof').createSignedUrl(path, 60)
      expect(Boolean(signed?.signedUrl)).toBe(sees)
    }
  })

  it("won't let a member upload into someone else's task folder", async () => {
    const { error } = await moClient.storage.from('proof').upload(`task/${bob.id}/${uuid()}/x.jpg`, JPEG, { contentType: 'image/jpeg' })
    expectError(error, { message: 'new row violates row-level security policy' })
  })
})

describe('resolution proof', () => {
  it('needs a note to resolve, and shows the note and proof to every member', async () => {
    const market = await createTestMarket(bobClient, ['Yes', 'No'])
    await serviceClient().from('markets').update({ close_at: new Date(Date.now() - 1000).toISOString() }).eq('id', market.marketId)

    const bare = await bobClient.rpc('resolve_market', { p_market_id: market.marketId, p_outcome_id: market.outcomeIds[0], p_note: '   ' })
    expect(bare.error?.message).toBe('say why this outcome won')

    const path = await upload(bobClient, `resolution/${market.marketId}/${uuid()}/scoreboard.jpg`)
    const { error } = await bobClient.rpc('resolve_market', {
      p_market_id: market.marketId,
      p_outcome_id: market.outcomeIds[0],
      p_note: 'Scoreboard at the final whistle',
      p_attachments: [{ kind: 'image', storage_path: path }],
    })
    expect(error).toBeNull()

    const { data: m } = await serviceClient().from('markets').select('current_resolution_id').eq('id', market.marketId).single()
    const { data: resolution } = await moClient.from('market_resolutions').select('note').eq('id', m!.current_resolution_id!).single()
    expect(resolution?.note).toBe('Scoreboard at the final whistle')
    const { data: rows } = await moClient.from('proof_attachments').select('storage_path').eq('resolution_id', m!.current_resolution_id!)
    expect(rows).toEqual([{ storage_path: path }])
    const { data: signed } = await moClient.storage.from('proof').createSignedUrl(path, 60)
    expect(signed?.signedUrl).toBeTruthy()
  })

  it("won't let someone who can't resolve the market upload proof for it", async () => {
    const market = await createTestMarket(bobClient, ['Yes', 'No'])
    const { error } = await moClient.storage
      .from('proof')
      .upload(`resolution/${market.marketId}/${uuid()}/fake.jpg`, JPEG, { contentType: 'image/jpeg' })
    expectError(error, { message: 'new row violates row-level security policy' })
  })

  it('needs its own note to override, and keeps the earlier resolution’s proof as history', async () => {
    const market = await createTestMarket(ownerClient, ['Yes', 'No'])
    await ownerClient.rpc('resolve_market', {
      p_market_id: market.marketId,
      p_outcome_id: market.outcomeIds[0],
      p_note: 'First call',
      p_attachments: [{ kind: 'link', url: 'https://example.com/first' }],
    })
    const noNote = await ownerClient.rpc('resolve_market', { p_market_id: market.marketId, p_outcome_id: market.outcomeIds[1], p_note: '' })
    expect(noNote.error?.message).toBe('say why this outcome won')

    const { error } = await ownerClient.rpc('resolve_market', {
      p_market_id: market.marketId,
      p_outcome_id: market.outcomeIds[1],
      p_note: 'Replay showed No',
    })
    expect(error).toBeNull()

    const { data: resolutions } = await serviceClient()
      .from('market_resolutions')
      .select('note, reversed_at, proof_attachments(url)')
      .eq('market_id', market.marketId)
      .order('resolved_at')
    expect(resolutions?.map((r) => [r.note, r.reversed_at !== null, r.proof_attachments.length])).toEqual([
      ['First call', true, 1],
      ['Replay showed No', false, 0],
    ])
  })

  it('keeps resolve_market_core out of members’ reach', async () => {
    const market = await createTestMarket(ownerClient, ['Yes', 'No'])
    const { error } = await ownerClient.rpc('resolve_market_core', { p_market_id: market.marketId, p_outcome_id: market.outcomeIds[0] })
    expectError(error, { code: '42501', message: 'permission denied for function resolve_market_core' })
  })
})
