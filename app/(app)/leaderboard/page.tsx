import { redirect } from 'next/navigation'
import Link from 'next/link'
import { requireUser } from '@/lib/auth/require-user'
import { getLeaderboard } from '@/lib/social/leaderboard'

export default async function LeaderboardPage() {
  const { supabase, user } = await requireUser()
  if (!user) redirect('/sign-in')

  const board = await getLeaderboard(supabase)

  return (
    <div className="mx-auto max-w-2xl p-8">
      <h1 className="text-xl font-semibold">Leaderboard</h1>
      <ol className="mt-4 space-y-1">
        {board.map((m) => (
          <li key={m.id}>
            {m.rank}.{' '}
            <Link href={`/members/${m.id}`} className="underline">
              {m.displayName}
            </Link>{' '}
            — {m.balance} DC
          </li>
        ))}
      </ol>
    </div>
  )
}
