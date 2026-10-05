'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth/require-user'
import { friendlyError, type KnownError, SIGNED_OUT_ERROR } from '@/lib/errors/friendly-error'
import { TEXT_LIMITS, tooLong } from '@/lib/forms/limits'
import { AVATAR_MAX_BYTES, AVATAR_TYPE, avatarPathFor } from '@/lib/profile/avatar'

export type ActionState = { formError?: string; field?: 'display_name' | 'bio' | 'avatar'; saved?: boolean } | undefined

type Field = 'display_name' | 'bio' | 'avatar'

// update_my_profile's raises (0038, 0046) and the profile constraints its update can trip.
const UPDATE_PROFILE_ERRORS: readonly KnownError<Field>[] = [
  { match: 'not allowed', formError: 'Only invited members can edit their profile.' },
  { match: 'display name is required', formError: 'Enter a display name.', field: 'display_name' },
  { match: 'profiles_display_name_not_blank', formError: 'Enter a display name.', field: 'display_name' },
  { match: 'profiles_display_name_length', formError: tooLong('Display name', TEXT_LIMITS.displayName), field: 'display_name' },
  { match: 'profiles_bio_length', formError: tooLong('Bio', TEXT_LIMITS.bio), field: 'bio' },
  { match: 'profiles_avatar_path_own_folder', formError: 'That photo couldn’t be used. Try a different one.', field: 'avatar' },
]

export async function updateProfileAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase, user } = await requireUser()
  if (!user) return { formError: SIGNED_OUT_ERROR }

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
  if (readError) return friendlyError(readError, UPDATE_PROFILE_ERRORS, 'reading the profile failed')
  const oldPath = current.avatar_path as string | null

  let nextPath = removeAvatar ? null : oldPath
  if (newPhoto) {
    nextPath = avatarPathFor(user.id)
    // Each upload gets a fresh path (avatarPathFor), so the bytes at one URL never change and can be cached for a year.
    const { error } = await supabase.storage.from('avatars').upload(nextPath, newPhoto, { contentType: AVATAR_TYPE, cacheControl: '31536000' })
    if (error) {
      console.error('Avatar upload failed', error)
      return { formError: 'Your photo didn’t upload. Try again.', field: 'avatar' }
    }
  }

  const { error } = await supabase.rpc('update_my_profile', {
    p_display_name: displayName,
    p_bio: bio,
    p_avatar_path: nextPath,
  })
  if (error) {
    if (newPhoto && nextPath) await supabase.storage.from('avatars').remove([nextPath])
    return friendlyError(error, UPDATE_PROFILE_ERRORS, 'update_my_profile failed')
  }

  // Best effort: the profile already points at the new photo, so an old file left behind costs
  // only storage, and the daily cron sweeps avatars no profile points at (0077).
  if (oldPath && oldPath !== nextPath) {
    const { error: removeError } = await supabase.storage.from('avatars').remove([oldPath])
    if (removeError) console.error('Old avatar not removed', removeError)
  }

  // Names and photos show on every page's lists, so refresh them all.
  revalidatePath('/', 'layout')
  return { saved: true }
}
