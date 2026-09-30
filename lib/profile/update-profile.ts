'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth/require-user'
import { TEXT_LIMITS, tooLong } from '@/lib/forms/limits'
import { AVATAR_MAX_BYTES, AVATAR_TYPE, avatarPathFor } from '@/lib/profile/avatar'

export type ActionState = { formError?: string; field?: 'display_name' | 'bio' | 'avatar'; saved?: boolean } | undefined

export async function updateProfileAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase, user } = await requireUser()
  if (!user) return { formError: 'Not signed in.' }

  const displayName = String(formData.get('display_name') ?? '').trim()
  const bio = String(formData.get('bio') ?? '').trim()
  const avatar = formData.get('avatar')
  const removeAvatar = formData.get('remove_avatar') === 'on'

  if (!displayName) return { formError: 'Enter a display name.', field: 'display_name' }
  if (displayName.length > TEXT_LIMITS.displayName) {
    return { formError: tooLong('Display name', TEXT_LIMITS.displayName), field: 'display_name' }
  }
  if (bio.length > TEXT_LIMITS.bio) return { formError: tooLong('Bio', TEXT_LIMITS.bio), field: 'bio' }

  const newPhoto = avatar instanceof File && avatar.size > 0 ? avatar : null
  if (newPhoto && (newPhoto.type !== AVATAR_TYPE || newPhoto.size > AVATAR_MAX_BYTES)) {
    return { formError: 'That photo couldn’t be used. Try a different one.', field: 'avatar' }
  }

  const { data: current, error: readError } = await supabase
    .from('profiles')
    .select('avatar_path')
    .eq('id', user.id)
    .single()
  if (readError) return { formError: readError.message }
  const oldPath = current.avatar_path as string | null

  let nextPath = removeAvatar ? null : oldPath
  if (newPhoto) {
    nextPath = avatarPathFor(user.id)
    // Each upload gets a fresh path (avatarPathFor), so the bytes at one URL never change and can be cached for a year.
    const { error } = await supabase.storage.from('avatars').upload(nextPath, newPhoto, { contentType: AVATAR_TYPE, cacheControl: '31536000' })
    if (error) return { formError: `Your photo didn’t upload: ${error.message}`, field: 'avatar' }
  }

  const { error } = await supabase.rpc('update_my_profile', {
    p_display_name: displayName,
    p_bio: bio,
    p_avatar_path: nextPath,
  })
  if (error) {
    if (newPhoto && nextPath) await supabase.storage.from('avatars').remove([nextPath])
    return { formError: error.message }
  }

  // Best effort: the profile already points at the new photo, so an old file left behind costs
  // only storage.
  if (oldPath && oldPath !== nextPath) await supabase.storage.from('avatars').remove([oldPath])

  // Names and photos show on every page's lists, so refresh them all.
  revalidatePath('/', 'layout')
  return { saved: true }
}
