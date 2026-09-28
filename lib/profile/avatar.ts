// supabase/migrations/0038_profile_editing.sql: the avatars bucket's size and type limits, and
// the <member id>/<uuid>.jpg path its check constraint allows.
export const AVATAR_MAX_BYTES = 1024 * 1024
export const AVATAR_TYPE = 'image/jpeg'

export function avatarPathFor(memberId: string): string {
  return `${memberId}/${crypto.randomUUID()}.jpg`
}

export function avatarUrl(path: string | null | undefined): string | null {
  if (!path) return null
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/avatars/${path}`
}
