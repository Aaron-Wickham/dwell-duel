import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth/require-user'
import { avatarUrl } from '@/lib/profile/avatar'
import { Page, PageHeader } from '@/components/ui/page'
import { BackLink } from '@/components/ui/back-link'
import { ProfileForm } from './profile-form'

export default async function ProfilePage() {
  const { supabase, user } = await requireUser()
  if (!user) redirect('/sign-in')

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('display_name, bio, avatar_path')
    .eq('id', user.id)
    .single()
  if (error) throw error

  return (
    <Page transition="drill-down">
      <BackLink href={`/members/${user.id}`}>Your profile</BackLink>
      <PageHeader title="Edit profile" description="Your name, photo and bio show to every member." />
      <ProfileForm
        displayName={profile.display_name as string}
        bio={(profile.bio as string | null) ?? ''}
        avatarSrc={avatarUrl(profile.avatar_path as string | null)}
      />
    </Page>
  )
}
