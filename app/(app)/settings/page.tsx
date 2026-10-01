import Link from 'next/link'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { BookOpenText, UserRound } from 'lucide-react'
import { requireUser } from '@/lib/auth/require-user'
import { atLeast, getRole } from '@/lib/auth/roles'
import { resolvePreferences } from '@/lib/preferences/preferences'
import { vapidKeys } from '@/lib/push/config'
import { getMyNotificationSettings } from '@/lib/push/prefs'
import { avatarUrl } from '@/lib/profile/avatar'
import { resolveTheme, THEME_COOKIE } from '@/lib/theme/theme'
import { Avatar } from '@/components/ui/avatar'
import { BackLink } from '@/components/ui/back-link'
import { buttonVariants } from '@/components/ui/button'
import { Page, PageHeader } from '@/components/ui/page'
import { SectionCard } from '@/components/ui/section-card'
import { cn } from '@/lib/utils'
import { NotificationSettings } from './notification-settings'
import { MotionSettings, ThemeSetting } from './settings-controls'
import { SignOutButton } from './sign-out-button'

export default async function SettingsPage() {
  const { supabase, user } = await requireUser()
  if (!user) redirect('/sign-in')

  const [{ data: profile, error }, jar, notifications, role] = await Promise.all([
    supabase.from('profiles').select('display_name, avatar_path').eq('id', user.id).maybeSingle(),
    cookies(),
    getMyNotificationSettings(supabase, user.id),
    getRole(supabase),
  ])
  if (error) throw error
  const theme = resolveTheme(jar.get(THEME_COOKIE)?.value) ?? 'system'
  const prefs = resolvePreferences((name) => jar.get(name)?.value)

  return (
    <Page transition="drill-down">
      <BackLink href={`/members/${user.id}`}>Your profile</BackLink>
      <PageHeader title="Settings" description="These apply on this device." />
      <div className="flex flex-col gap-5 md:gap-7 lg:grid lg:grid-cols-2 lg:items-start">
        <div className="flex flex-col gap-5 md:gap-7">
          <SectionCard title="Appearance" titleId="settings-appearance">
            <ThemeSetting initial={theme} />
          </SectionCard>
          {/* A member still being set up has no profile yet, but can always change the rest and sign out. */}
          {profile && (
            <SectionCard title="Profile" titleId="settings-profile">
              <div className="flex flex-wrap items-center gap-4">
                <Avatar name={profile.display_name as string} src={avatarUrl(profile.avatar_path as string | null)} />
                <p className="min-w-0 grow font-bold break-words">{profile.display_name as string}</p>
                <Link
                  href="/profile"
                  transitionTypes={['nav-forward']}
                  className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }), 'no-underline')}
                >
                  <UserRound aria-hidden="true" className="size-[18px]" />
                  Edit profile
                </Link>
              </div>
            </SectionCard>
          )}
          <SectionCard title="Haptics & motion" titleId="settings-motion">
            <MotionSettings haptics={prefs.haptics} reduceMotion={prefs.reduceMotion} />
          </SectionCard>
        </div>
        <div className="flex flex-col gap-5 md:gap-7">
          {/* Home's Turn on notifications links here; the margin keeps the heading clear of the bar. */}
          <SectionCard
            title="Notifications"
            titleId="settings-notifications"
            className="[&_h2]:scroll-mt-[calc(64px+var(--safe-top)+40px)] md:[&_h2]:scroll-mt-[calc(72px+var(--safe-top)+48px)]"
          >
            <NotificationSettings
              userId={user.id}
              publicKey={vapidKeys()?.publicKey ?? null}
              endpoints={notifications.endpoints}
              prefs={notifications.prefs}
              reviewer={atLeast(role, 'reviewer')}
            />
          </SectionCard>
          <SectionCard title="Help" titleId="settings-help">
            <p className="text-ink2">Odds, payouts, parlays, results and tasks, explained.</p>
            <Link
              href="/how-it-works"
              transitionTypes={['nav-forward']}
              className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }), 'self-start no-underline')}
            >
              <BookOpenText aria-hidden="true" className="size-[18px]" />
              How it works
            </Link>
          </SectionCard>
          <SectionCard title="Account" titleId="settings-account">
            <SignOutButton />
          </SectionCard>
        </div>
      </div>
    </Page>
  )
}
