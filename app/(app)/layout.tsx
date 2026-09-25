import type { ReactNode } from 'react'
import { requireUser } from '@/lib/auth/require-user'
import { isAdmin } from '@/lib/auth/is-admin'
import { readSlip } from '@/lib/parlays/slip'
import { AppNav } from '@/components/app-nav/app-nav'

export default async function SignedInLayout({ children }: { children: ReactNode }) {
  const { supabase, user } = await requireUser()
  if (!user) return children

  const { data: profile, error } = await supabase.from('profiles').select('balance').eq('id', user.id).maybeSingle()
  if (error) throw error
  if (!profile) return children

  const [admin, slip] = await Promise.all([isAdmin(supabase), readSlip()])

  return (
    <>
      <AppNav balance={profile.balance} slipCount={slip.length} isAdmin={admin} />
      <div className="flex flex-1 flex-col pb-[calc(82px+env(safe-area-inset-bottom))] md:pb-0">{children}</div>
    </>
  )
}
