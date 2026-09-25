import { redirect } from 'next/navigation'
import Link from 'next/link'
import { requireUser } from '@/lib/auth/require-user'
import { isAdmin } from '@/lib/auth/is-admin'
import { listAllTransactions } from '@/lib/ledger/list-transactions'

export default async function AdminLedgerPage() {
  const { supabase, user } = await requireUser()
  if (!user) redirect('/sign-in')
  if (!(await isAdmin(supabase))) redirect('/')

  const entries = await listAllTransactions(supabase)

  return (
    <div className="mx-auto max-w-2xl p-8">
      <h1 className="text-xl font-semibold">Ledger</h1>
      <div className="mt-2 flex gap-4">
        <Link href="/admin/invites" className="text-sm underline">
          Invites
        </Link>
        <Link href="/admin/tasks" className="text-sm underline">
          Tasks
        </Link>
        <Link href="/admin/members" className="text-sm underline">
          Members
        </Link>
      </div>
      <ul className="mt-6 space-y-2 text-sm">
        {entries.map((e) => (
          <li key={e.id} className="border-b py-2">
            {e.memberName}: {e.amount > 0 ? '+' : ''}
            {e.amount} DC — {e.type}
            {e.reason && ` (${e.reason})`}
          </li>
        ))}
      </ul>
    </div>
  )
}
