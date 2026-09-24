import { redirect } from 'next/navigation'
import Link from 'next/link'
import { requireUser } from '@/lib/auth/require-user'
import { isAdmin } from '@/lib/auth/is-admin'
import { listMembers } from '@/lib/members/list-members'
import { AdjustBalanceForm } from './adjust-balance-form'

export default async function AdminMembersPage() {
  const { supabase, user } = await requireUser()
  if (!user) redirect('/sign-in')
  if (!(await isAdmin(supabase))) redirect('/')

  const members = await listMembers(supabase)

  return (
    <div className="mx-auto max-w-2xl p-8">
      <h1 className="text-xl font-semibold">Members</h1>
      <div className="mt-2 flex gap-4">
        <Link href="/admin/invites" className="text-sm underline">
          Invites
        </Link>
        <Link href="/admin/tasks" className="text-sm underline">
          Tasks
        </Link>
      </div>
      <ul className="mt-6 space-y-3">
        {members.map((m) => (
          <li key={m.id} className="border p-3">
            <p className="font-medium">
              {m.displayName} — {m.balance} DC {m.isAdmin && '(admin)'}
            </p>
            <p className="text-sm text-foreground/70">{m.email}</p>
            <AdjustBalanceForm profileId={m.id} />
          </li>
        ))}
      </ul>
    </div>
  )
}
