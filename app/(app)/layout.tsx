import { requireUser } from '@/lib/auth/require-user'
import { adminHref, getRole } from '@/lib/auth/roles'
import { avatarUrl } from '@/lib/profile/avatar'
import { readSlip } from '@/lib/parlays/slip'
import { AppNav } from '@/components/app-nav/app-nav'
import { SlipProvider } from '@/components/slip/slip-provider'
import { SlipSheet, SlipSpacer } from '@/components/slip/slip-sheet'
import { getSlipView } from '@/lib/parlays/get-slip'
import { LiveRefresh } from '@/components/live/live-refresh'
import { LiveTablesProvider } from '@/components/live/live-tables'
import { NavDepthTracker } from '@/lib/nav/nav-depth'
import { Toaster } from '@/components/ui/toaster'
import { OfflineBanner } from '@/components/offline/offline-banner'
import { FALLBACK_NAME } from '@/lib/profile/fallback-name'

export default async function SignedInLayout({ children }: LayoutProps<'/'>) {
  const { supabase, user } = await requireUser()
  if (!user) return children

  const [{ data: profile, error }, role, slipView] = await Promise.all([
    supabase.from('profiles').select('balance, display_name, avatar_path').eq('id', user.id).maybeSingle(),
    getRole(supabase),
    readSlip().then((slip) => getSlipView(supabase, slip, user.id)),
  ])
  if (error) throw error

  return (
    <LiveTablesProvider userId={user.id}>
      <SlipProvider view={slipView}>
        <NavDepthTracker />
        {/* A missing profile row still gets the nav and <main>, so the page isn't stranded without them. */}
        <AppNav
          balance={profile?.balance ?? 0}
          adminHref={adminHref(role)}
          me={{
            id: user.id,
            name: profile?.display_name ?? FALLBACK_NAME,
            avatarSrc: avatarUrl(profile?.avatar_path),
          }}
        />
        <main id="main" className="flex flex-1 flex-col pb-[calc(82px+var(--safe-bottom))] md:pb-0">
          <OfflineBanner />
          {children}
          <SlipSpacer />
        </main>
        <SlipSheet />
        <Toaster />
        <LiveRefresh />
      </SlipProvider>
    </LiveTablesProvider>
  )
}
