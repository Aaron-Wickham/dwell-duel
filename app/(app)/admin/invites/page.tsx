import { redirect } from 'next/navigation'
import { Mail } from 'lucide-react'
import { requireUser } from '@/lib/auth/require-user'
import { atLeast, getRole } from '@/lib/auth/roles'
import { listInvites } from '@/lib/invites/list-invites'
import { SectionCard } from '@/components/ui/section-card'
import { EmptyState } from '@/components/ui/empty-state'
import { ContentReveal } from '@/components/nav/page-transition'
import { InviteListItem } from '@/components/admin/invite-list-item'
import { AddInviteForm } from './add-invite-form'
import { RevokeInviteButton } from './revoke-invite-button'
import { CopyInviteButton } from './copy-invite-button'

export default async function AdminInvitesPage() {
  const { supabase, user } = await requireUser()
  if (!user) redirect('/sign-in')
  if (!atLeast(await getRole(supabase), 'admin')) redirect('/admin/tasks')

  const invites = await listInvites(supabase)

  return (
    <ContentReveal>
      <div className="flex flex-col gap-5 lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start lg:gap-7">
        <SectionCard title="Invite someone" titleId="invite-someone">
          <AddInviteForm />
        </SectionCard>
        <SectionCard title="Invites" titleId="invites" className="gap-1">
          {invites.length === 0 ? (
            <EmptyState icon={Mail} title="No invites yet.">
              Add an email to invite someone.
            </EmptyState>
          ) : (
            <ul className="flex flex-col divide-y divide-line">
              {invites.map((invite) => (
                <InviteListItem
                  key={invite.email}
                  invite={invite}
                  actions={
                    <>
                      <CopyInviteButton email={invite.email} />
                      <RevokeInviteButton email={invite.email} />
                    </>
                  }
                />
              ))}
            </ul>
          )}
        </SectionCard>
      </div>
    </ContentReveal>
  )
}
