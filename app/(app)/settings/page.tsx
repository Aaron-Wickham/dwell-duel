import Link from 'next/link'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
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
import { InstallApp } from './install-app'

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
    // One reading-width column (#398). Each card says whether it applies to this device or to
    // your account, since the page holds both.
    <Page width="reading" transition="drill-down">
      <BackLink href={`/members/${user.id}`}>Your profile</BackLink>
      <PageHeader title="Settings" />
      <SectionCard title="Appearance & motion" titleId="settings-appearance" description="On this device.">
        <div className="flex flex-col gap-5">
          <ThemeSetting initial={theme} />
          <MotionSettings haptics={prefs.haptics} reduceMotion={prefs.reduceMotion} />
        </div>
      </SectionCard>
      {/* Home's Turn on notifications links here; the margin keeps the heading clear of the bar. */}
      <SectionCard
        title="Notifications"
        titleId="settings-notifications"
        description="Turned on for each device. What you get follows your account."
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
      <InstallApp />
      <SectionCard title="Help" titleId="settings-help">
        <p className="text-ink2">Betting, parlays, results and tasks, explained, and what DwellDuel keeps about you.</p>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/how-it-works"
            transitionTypes={['nav-forward']}
            className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }), 'no-underline')}
          >
            How it works
          </Link>
          {/* The privacy note is the full rules' Your data section (docs/HOW-IT-WORKS.md), so it renders in the app. */}
          <Link
            href="/how-it-works/rules#how-your-data"
            transitionTypes={['nav-forward']}
            className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }), 'no-underline')}
          >
            Your data
          </Link>
        </div>
      </SectionCard>
      <SectionCard title="Account" titleId="settings-account" description="Your profile shows on every device you sign in on.">
        {/* A member still being set up has no profile yet, but can always change the rest and sign out. */}
        {profile && (
          <div className="flex flex-wrap items-center gap-4">
            <Avatar name={profile.display_name as string} src={avatarUrl(profile.avatar_path as string | null)} />
            <p className="min-w-0 grow font-bold break-words">{profile.display_name as string}</p>
            <Link
              href="/profile"
              transitionTypes={['nav-forward']}
              className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }), 'no-underline')}
            >
              Edit profile
            </Link>
          </div>
        )}
        <SignOutButton />
      </SectionCard>
    </Page>
  )
}
