import { describe, it, expect, vi, beforeEach } from 'vitest'

const { supabase, single, upload, remove, revalidatePath } = vi.hoisted(() => {
  const single = vi.fn()
  const upload = vi.fn()
  const remove = vi.fn()
  const query = { select: vi.fn(() => query), eq: vi.fn(() => query), single }
  return {
    single,
    upload,
    remove,
    revalidatePath: vi.fn(),
    supabase: {
      from: vi.fn(() => query),
      rpc: vi.fn(),
      storage: { from: vi.fn(() => ({ upload, remove })) },
    },
  }
})
vi.mock('@/lib/auth/require-user', () => ({ requireUser: async () => ({ supabase, user: { id: 'member-1' } }) }))
vi.mock('next/cache', () => ({ revalidatePath }))

import { updateProfileAction } from '@/lib/profile/update-profile'

const NEW_PATH = /^member-1\/[0-9a-f-]{36}\.jpg$/

function profileForm(fields: { name?: string; bio?: string; photo?: File; remove?: boolean } = {}) {
  const form = new FormData()
  form.set('display_name', fields.name ?? 'Priscilla')
  form.set('bio', fields.bio ?? 'Tea after the late service.')
  if (fields.photo) form.set('avatar', fields.photo)
  if (fields.remove) form.set('remove_avatar', 'on')
  return form
}

function jpeg(bytes = 10) {
  return new File([new Uint8Array(bytes)], 'avatar.jpg', { type: 'image/jpeg' })
}

beforeEach(() => {
  vi.clearAllMocks()
  single.mockResolvedValue({ data: { avatar_path: 'member-1/old.jpg' }, error: null })
  upload.mockResolvedValue({ data: {}, error: null })
  remove.mockResolvedValue({ data: [], error: null })
  supabase.rpc.mockResolvedValue({ data: null, error: null })
})

describe('updateProfileAction', () => {
  it('uploads a new photo, points the profile at it, then deletes the old one', async () => {
    const photo = jpeg()
    const state = await updateProfileAction(undefined, profileForm({ name: '  Priscilla  ', photo }))

    expect(state).toEqual({ saved: true })
    expect(supabase.storage.from).toHaveBeenCalledWith('avatars')
    expect(upload).toHaveBeenCalledWith(expect.stringMatching(NEW_PATH), expect.any(File), { contentType: 'image/jpeg', cacheControl: '31536000' })
    const newPath = upload.mock.calls[0][0]
    expect(supabase.rpc).toHaveBeenCalledWith('update_my_profile', {
      p_display_name: 'Priscilla',
      p_bio: 'Tea after the late service.',
      p_avatar_path: newPath,
    })
    expect(remove).toHaveBeenCalledTimes(1)
    expect(remove).toHaveBeenCalledWith(['member-1/old.jpg'])
    expect(revalidatePath).toHaveBeenCalledWith('/', 'layout')
  })

  it('still saves when the old photo cannot be removed, and logs it for the cron sweep to collect', async () => {
    remove.mockResolvedValue({ data: null, error: { message: 'storage down' } })
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const state = await updateProfileAction(undefined, profileForm({ photo: jpeg() }))
    expect(state).toEqual({ saved: true })
    expect(log).toHaveBeenCalledWith('Old avatar not removed', expect.anything())
    log.mockRestore()
  })

  it('removes the new photo again when update_my_profile fails, and keeps the old one', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: { message: 'not allowed' } })

    const state = await updateProfileAction(undefined, profileForm({ photo: jpeg() }))

    expect(state).toEqual({ formError: 'Only invited members can edit their profile.' })
    const newPath = upload.mock.calls[0][0]
    expect(remove).toHaveBeenCalledTimes(1)
    expect(remove).toHaveBeenCalledWith([newPath])
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('leaves storage alone when update_my_profile fails without a new photo, hiding raw text (#203)', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: { message: 'boom' } })
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})

    const state = await updateProfileAction(undefined, profileForm())

    expect(state).toEqual({ formError: 'Something went wrong. Try again.' })
    expect(log).toHaveBeenCalledWith('update_my_profile failed', { message: 'boom' })
    expect(upload).not.toHaveBeenCalled()
    expect(remove).not.toHaveBeenCalled()
  })

  it('reports a failed upload against the photo without saving anything', async () => {
    upload.mockResolvedValue({ data: null, error: { message: 'bucket full' } })
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const state = await updateProfileAction(undefined, profileForm({ photo: jpeg() }))

    expect(state).toEqual({ formError: 'Your photo didn’t upload. Try again.', field: 'avatar' })
    expect(supabase.rpc).not.toHaveBeenCalled()
    expect(remove).not.toHaveBeenCalled()
  })

  it('keeps the current photo when none is chosen', async () => {
    const state = await updateProfileAction(undefined, profileForm())

    expect(state).toEqual({ saved: true })
    expect(upload).not.toHaveBeenCalled()
    expect(supabase.rpc).toHaveBeenCalledWith('update_my_profile', expect.objectContaining({ p_avatar_path: 'member-1/old.jpg' }))
    expect(remove).not.toHaveBeenCalled()
  })

  it('clears the photo and deletes its file when asked to remove it', async () => {
    const state = await updateProfileAction(undefined, profileForm({ remove: true }))

    expect(state).toEqual({ saved: true })
    expect(supabase.rpc).toHaveBeenCalledWith('update_my_profile', expect.objectContaining({ p_avatar_path: null }))
    expect(remove).toHaveBeenCalledWith(['member-1/old.jpg'])
  })

  it('treats an empty file input as no new photo', async () => {
    const state = await updateProfileAction(undefined, profileForm({ photo: jpeg(0) }))

    expect(state).toEqual({ saved: true })
    expect(upload).not.toHaveBeenCalled()
  })

  it('shows a generic error when the current profile can’t be loaded', async () => {
    single.mockResolvedValue({ data: null, error: { message: 'network down' } })
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const state = await updateProfileAction(undefined, profileForm({ photo: jpeg() }))

    expect(state).toEqual({ formError: 'Something went wrong. Try again.' })
    expect(upload).not.toHaveBeenCalled()
    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  describe('validation, before touching the database or storage', () => {
    it.each([
      ['a blank display name', profileForm({ name: '   ' }), { formError: 'Enter a display name.', field: 'display_name' }],
      [
        'a display name over 80 characters',
        profileForm({ name: 'a'.repeat(81) }),
        { formError: 'Display name can be at most 80 characters.', field: 'display_name' },
      ],
      ['a bio over 160 characters', profileForm({ bio: 'b'.repeat(161) }), { formError: 'Bio can be at most 160 characters.', field: 'bio' }],
      [
        'a photo that isn’t a JPEG',
        profileForm({ photo: new File([new Uint8Array(10)], 'avatar.png', { type: 'image/png' }) }),
        { formError: 'That photo couldn’t be used. Try a different one.', field: 'avatar' },
      ],
      [
        'a photo over 1MB',
        profileForm({ photo: jpeg(1024 * 1024 + 1) }),
        { formError: 'That photo couldn’t be used. Try a different one.', field: 'avatar' },
      ],
    ])('refuses %s', async (_label, form, expected) => {
      const state = await updateProfileAction(undefined, form)

      expect(state).toEqual(expected)
      expect(supabase.from).not.toHaveBeenCalled()
      expect(upload).not.toHaveBeenCalled()
      expect(supabase.rpc).not.toHaveBeenCalled()
    })

    it('points a constraint the database still trips at its field', async () => {
      supabase.rpc.mockResolvedValue({
        data: null,
        error: { message: 'new row for relation "profiles" violates check constraint "profiles_bio_length"' },
      })
      expect(await updateProfileAction(undefined, profileForm())).toEqual({ formError: 'Bio can be at most 160 characters.', field: 'bio' })
    })

    it('accepts a display name and bio exactly at their limits', async () => {
      const state = await updateProfileAction(undefined, profileForm({ name: 'a'.repeat(80), bio: 'b'.repeat(160) }))
      expect(state).toEqual({ saved: true })
    })
  })
})
