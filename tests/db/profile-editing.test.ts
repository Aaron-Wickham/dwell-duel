import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { serviceClient } from './helpers'
import { seedMembers, clientFor, ensureInvited, type Member } from './fixtures'

let alice: Member
let bob: Member
let aliceClient: SupabaseClient
let bobClient: SupabaseClient

const JPEG = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], { type: 'image/jpeg' })
const photoPath = (member: Member) => `${member.id}/${crypto.randomUUID()}.jpg`

beforeEach(async () => {
  ;[alice, bob] = await seedMembers()
  aliceClient = await clientFor(alice)
  bobClient = await clientFor(bob)
  await ensureInvited(aliceClient)
})

afterEach(async () => {
  const db = serviceClient()
  for (const member of [alice, bob]) {
    const { data } = await db.storage.from('avatars').list(member.id)
    if (data?.length) await db.storage.from('avatars').remove(data.map((f) => `${member.id}/${f.name}`))
  }
})

async function profileOf(member: Member) {
  const { data, error } = await serviceClient()
    .from('profiles')
    .select('display_name, bio, avatar_path, balance, role')
    .eq('id', member.id)
    .single()
  if (error) throw error
  return data
}

describe('update_my_profile', () => {
  it('saves a trimmed name and bio, a blank bio as null, and the photo path', async () => {
    const path = photoPath(alice)
    const { error } = await aliceClient.rpc('update_my_profile', {
      p_display_name: '  Ali  ',
      p_bio: '  Loves Psalms  ',
      p_avatar_path: path,
    })
    expect(error).toBeNull()
    expect(await profileOf(alice)).toMatchObject({ display_name: 'Ali', bio: 'Loves Psalms', avatar_path: path })

    const { error: clearErr } = await aliceClient.rpc('update_my_profile', {
      p_display_name: 'Ali',
      p_bio: '   ',
      p_avatar_path: null,
    })
    expect(clearErr).toBeNull()
    expect(await profileOf(alice)).toMatchObject({ bio: null, avatar_path: null })
  })

  it('changes only the caller’s own name, bio and photo', async () => {
    const before = await profileOf(alice)
    const { error } = await aliceClient.rpc('update_my_profile', { p_display_name: 'New', p_bio: '', p_avatar_path: null })
    if (error) throw error
    const after = await profileOf(alice)
    expect(after.balance).toBe(before.balance)
    expect(after.role).toBe(before.role)
    expect((await profileOf(bob)).display_name).toBe('Bob')
  })

  it('rejects a blank name, a bio over 160 characters, and a photo outside the caller’s folder', async () => {
    const blank = await aliceClient.rpc('update_my_profile', { p_display_name: '   ', p_bio: '', p_avatar_path: null })
    expect(blank.error?.message).toBe('display name is required')

    const longBio = await aliceClient.rpc('update_my_profile', { p_display_name: 'Alice', p_bio: 'x'.repeat(161), p_avatar_path: null })
    expect(longBio.error?.message).toMatch(/profiles_bio_length/)

    const othersFolder = await aliceClient.rpc('update_my_profile', {
      p_display_name: 'Alice',
      p_bio: '',
      p_avatar_path: photoPath(bob),
    })
    expect(othersFolder.error?.message).toMatch(/profiles_avatar_path_own_folder/)

    const traversal = await aliceClient.rpc('update_my_profile', {
      p_display_name: 'Alice',
      p_bio: '',
      p_avatar_path: `${alice.id}/../${bob.id}/x.jpg`,
    })
    expect(traversal.error?.message).toMatch(/profiles_avatar_path_own_folder/)

    expect(await profileOf(alice)).toMatchObject({ display_name: 'Alice', bio: null, avatar_path: null })
  })

  it('refuses a member who isn’t invited', async () => {
    const { error } = await bobClient.rpc('update_my_profile', { p_display_name: 'Robert', p_bio: '', p_avatar_path: null })
    expect(error?.message).toBe('not allowed')
    expect((await profileOf(bob)).display_name).toBe('Bob')
  })
})

describe('avatars bucket', () => {
  it('lets a member upload to and remove from their own folder only', async () => {
    const own = photoPath(alice)
    const { error: uploadErr } = await aliceClient.storage.from('avatars').upload(own, JPEG, { contentType: 'image/jpeg' })
    expect(uploadErr).toBeNull()

    const { error: othersErr } = await aliceClient.storage
      .from('avatars')
      .upload(photoPath(bob), JPEG, { contentType: 'image/jpeg' })
    expect(othersErr).not.toBeNull()

    const { data: removed } = await aliceClient.storage.from('avatars').remove([own])
    expect(removed?.map((f) => f.name)).toEqual([own])
  })

  it("won't let a member delete someone else's photo", async () => {
    await ensureInvited(bobClient)
    const bobs = photoPath(bob)
    const { error } = await bobClient.storage.from('avatars').upload(bobs, JPEG, { contentType: 'image/jpeg' })
    if (error) throw error

    const { data: removed } = await aliceClient.storage.from('avatars').remove([bobs])
    expect(removed ?? []).toEqual([])
    const { data: still } = await serviceClient().storage.from('avatars').list(bob.id)
    expect(still?.map((f) => `${bob.id}/${f.name}`)).toEqual([bobs])
  })

  it('refuses a file that isn’t a JPEG, and an uninvited member', async () => {
    const png = new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], { type: 'image/png' })
    const { error: typeErr } = await aliceClient.storage
      .from('avatars')
      .upload(`${alice.id}/${crypto.randomUUID()}.jpg`, png, { contentType: 'image/png' })
    expect(typeErr).not.toBeNull()

    const { error: uninvitedErr } = await bobClient.storage
      .from('avatars')
      .upload(photoPath(bob), JPEG, { contentType: 'image/jpeg' })
    expect(uninvitedErr).not.toBeNull()
  })
})
