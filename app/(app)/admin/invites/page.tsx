import { redirect } from 'next/navigation'
import Link from 'next/link'
import { requireUser } from '@/lib/auth/require-user'
import { isAdmin } from '@/lib/auth/is-admin'
import { listInvites } from '@/lib/invites/list-invites'
import { AddInviteForm } from './add-invite-form'
import { RevokeInviteButton } from './revoke-invite-button'

export default async function AdminInvitesPage() {
  const { supabase, user } = await requireUser()
  if (!user) redirect('/sign-in')
  if (!(await isAdmin(supabase))) redirect('/')

  const invites = await listInvites(supabase)

  return (
    <div className="mx-auto max-w-xl p-8">
      <h1 className="text-xl font-semibold">Invites</h1>
      <div className="mt-2 flex gap-4">
        <Link href="/admin/tasks" className="text-sm underline">
          Tasks
        </Link>
        <Link href="/admin/members" className="text-sm underline">
          Members
        </Link>
        <Link href="/admin/ledger" className="text-sm underline">
          Ledger
        </Link>
      </div>
      <AddInviteForm />
      <ul className="mt-6 space-y-2">
        {invites.map((invite) => (
          <li key={invite.email} className="flex items-center justify-between">
            <span>
              {invite.email} {invite.claimed ? '(claimed)' : ''}
            </span>
            {!invite.claimed && <RevokeInviteButton email={invite.email} />}
          </li>
        ))}
      </ul>
    </div>
  )
}
