import { redirect } from 'next/navigation'
import { Users } from 'lucide-react'
import { requireUser } from '@/lib/auth/require-user'
import { atLeast, getRole } from '@/lib/auth/roles'
import { listMembers } from '@/lib/members/list-members'
import { cardClass } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { ContentReveal } from '@/components/nav/page-transition'
import { cn } from '@/lib/utils'
import { AdjustBalanceForm } from './adjust-balance-form'
import { MemberIdentity } from './member-identity'
import { RoleForm } from './role-form'

const memberCardClass = 'lg:rounded-card lg:border lg:border-line lg:bg-surface lg:p-6 lg:shadow-card'

export default async function AdminMembersPage() {
  const { supabase, user } = await requireUser()
  if (!user) redirect('/sign-in')
  const role = await getRole(supabase)
  if (!atLeast(role, 'admin')) redirect('/admin/tasks')
  // Balances and roles are the owner's alone (0040); admins see who's who.
  const isOwner = role === 'owner'

  const members = await listMembers(supabase)
  // A Server Component renders once per request, so the purity rule's re-render worry doesn't
  // apply; passing this down keeps "2h ago" the same on the server and at hydration.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now()

  return (
    <ContentReveal>
      {/* One card with a row per member on a phone; at lg, a card per member in a grid. */}
      <section
        aria-labelledby="members-title"
        className={cn(
          cardClass,
          'px-[18px] py-1 md:px-6',
          members.length > 0 && 'lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none',
        )}
      >
        <h2 id="members-title" className="sr-only">
          Members
        </h2>
        {members.length === 0 ? (
          <div className="py-[18px] md:py-6">
            <EmptyState icon={Users} title="No members yet." />
          </div>
        ) : (
          <ul className="flex flex-col divide-y divide-line lg:grid lg:grid-cols-3 lg:items-start lg:gap-5 lg:divide-y-0">
            {members.map((m) => (
              <li key={m.id} className={cn('flex flex-col gap-3 py-4', memberCardClass)}>
                {isOwner ? <AdjustBalanceForm member={m} now={now} /> : <MemberIdentity member={m} now={now} />}
                {isOwner && m.role !== 'owner' && <RoleForm member={m} />}
              </li>
            ))}
          </ul>
        )}
      </section>
    </ContentReveal>
  )
}
