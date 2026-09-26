import { requireUser } from '@/lib/auth/require-user'
import { isAdmin } from '@/lib/auth/is-admin'
import { readSlip } from '@/lib/parlays/slip'
import { AppNav } from '@/components/app-nav/app-nav'
import { SlipCountProvider } from '@/components/app-nav/slip-count'
import { LiveRefresh } from '@/components/live/live-refresh'
import { NavDepthTracker } from '@/lib/nav/nav-depth'
import { Toaster } from '@/components/ui/toaster'
import { OfflineBanner } from '@/components/offline/offline-banner'

export default async function SignedInLayout({ children }: LayoutProps<'/'>) {
  const { supabase, user } = await requireUser()
  if (!user) return children

  const [{ data: profile, error }, admin, slip] = await Promise.all([
    supabase.from('profiles').select('balance').eq('id', user.id).maybeSingle(),
    isAdmin(supabase),
    readSlip(),
  ])
  if (error) throw error
  if (!profile) return children

  return (
    <SlipCountProvider initial={slip.length}>
      <NavDepthTracker />
      <AppNav balance={profile.balance} isAdmin={admin} />
      <main id="main" className="flex flex-1 flex-col pb-[calc(82px+var(--safe-bottom))] md:pb-0">
        <OfflineBanner />
        {children}
      </main>
      <Toaster />
      <LiveRefresh />
    </SlipCountProvider>
  )
}
