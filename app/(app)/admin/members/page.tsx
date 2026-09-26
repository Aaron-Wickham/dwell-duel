import { redirect } from 'next/navigation'
import { Users } from 'lucide-react'
import { requireUser } from '@/lib/auth/require-user'
import { isAdmin } from '@/lib/auth/is-admin'
import { listMembers } from '@/lib/members/list-members'
import { cardClass } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { ContentReveal } from '@/components/nav/page-transition'
import { cn } from '@/lib/utils'
import { AdjustBalanceForm } from './adjust-balance-form'

export default async function AdminMembersPage() {
  const { supabase, user } = await requireUser()
  if (!user) redirect('/sign-in')
  if (!(await isAdmin(supabase))) redirect('/')

  const members = await listMembers(supabase)

  return (
    <ContentReveal>
      <section aria-labelledby="members-title" className={cn(cardClass, 'px-[18px] py-1 md:px-6')}>
        <h2 id="members-title" className="sr-only">
          Members
        </h2>
        {members.length === 0 ? (
          <div className="py-[18px] md:py-6">
            <EmptyState icon={Users} title="No members yet." />
          </div>
        ) : (
          <ul className="flex flex-col divide-y divide-line">
            {members.map((m) => (
              <li key={m.id} className="flex flex-col gap-3 py-4">
                <AdjustBalanceForm member={m} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </ContentReveal>
  )
}
