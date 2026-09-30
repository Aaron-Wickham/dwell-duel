import { requireUser } from '@/lib/auth/require-user'
import { adminHref, atLeast, getRole } from '@/lib/auth/roles'
import { getReviewCounts, reviewSubscriptions } from '@/lib/admin/review-counts'
import { nextResolveCheckAt } from '@/lib/markets/markets-to-resolve'
import { RefreshAt } from '@/components/home/refresh-at'
import { avatarUrl } from '@/lib/profile/avatar'
import { readSlip } from '@/lib/parlays/slip'
import { AppNav } from '@/components/app-nav/app-nav'
import { SlipProvider } from '@/components/slip/slip-provider'
import { SlipSheet, SlipSpacer } from '@/components/slip/slip-sheet'
import { getSlipView } from '@/lib/parlays/get-slip'
import { LiveRefresh } from '@/components/live/live-refresh'
import { LiveTables, LiveTablesProvider } from '@/components/live/live-tables'
import { NavDepthTracker } from '@/lib/nav/nav-depth'
import { CardLinkClick } from '@/components/ui/card-link-click'
import { PushResync } from '@/components/push/push-resync'
import { vapidKeys } from '@/lib/push/config'
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
  const isAdmin = atLeast(role, 'admin')
  // The badge is a nicety: if reading it fails, the page still renders, without it.
  const [reviewCounts, nextClose] = await Promise.all([
    getReviewCounts(supabase, role).catch((error: unknown) => {
      console.error('Reading the review counts failed', error)
      return { tasks: 0, markets: 0 }
    }),
    isAdmin
      ? nextResolveCheckAt(supabase, user.id, true).catch((error: unknown) => {
          console.error('Reading the next market close failed', error)
          return null
        })
      : null,
  ])
  const alertTables = reviewSubscriptions(role)
  const vapid = vapidKeys()

  return (
    <LiveTablesProvider userId={user.id}>
      <SlipProvider view={slipView} balance={profile?.balance ?? 0}>
        <NavDepthTracker />
        <CardLinkClick />
        {alertTables.length > 0 && <LiveTables subscriptions={alertTables} />}
        {/* A market closing changes nothing in the database, so an admin's badge refreshes at the next close. */}
        {isAdmin && <RefreshAt at={nextClose} />}
        {/* A missing profile row still gets the nav and <main>, so the page isn't stranded without them. */}
        <AppNav
          balance={profile?.balance ?? 0}
          adminHref={adminHref(role)}
          adminAttention={reviewCounts.tasks + reviewCounts.markets}
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
        {vapid && <PushResync userId={user.id} publicKey={vapid.publicKey} />}
        <Toaster />
        <LiveRefresh />
      </SlipProvider>
    </LiveTablesProvider>
  )
}
