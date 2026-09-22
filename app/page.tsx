import { redirect } from 'next/navigation'
import Link from 'next/link'
import { requireUser } from '@/lib/auth/require-user'
import { signOut } from '@/lib/auth/sign-out'

export default async function Home() {
  const { supabase, user } = await requireUser()
  if (!user) redirect('/sign-in')

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, avatar_url, balance')
    .eq('id', user.id)
    .single()

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4">
      <h1 className="text-2xl font-semibold">Welcome, {profile?.display_name}</h1>
      <p>Balance: {profile?.balance} DC</p>
      <Link href="/markets" className="text-sm underline">
        Markets
      </Link>
      <form action={signOut}>
        <button type="submit" className="text-sm underline">
          Sign out
        </button>
      </form>
    </div>
  )
}
