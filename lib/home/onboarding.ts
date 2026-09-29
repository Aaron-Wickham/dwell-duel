import { cookies } from 'next/headers'
import type { DbClient } from '@/lib/supabase/database'

// A cookie, like the Settings ones, so a dismissed card is gone on the very first render, with no
// flash and no column to migrate. It's per device, as Settings are.
export const ONBOARDING_COOKIE = 'onboarding'
export const ONBOARDING_DISMISSED = 'dismissed'

export type OnboardingSteps = { photo: boolean; bet: boolean; task: boolean }

// Null once the member has dismissed the card; the card hides itself when every step is done.
export async function getOnboarding(supabase: DbClient, userId: string): Promise<OnboardingSteps | null> {
  const jar = await cookies()
  if (jar.get(ONBOARDING_COOKIE)?.value === ONBOARDING_DISMISSED) return null

  // A cancelled bet still counts as a first bet, and cancelling moves it out of `bets` (0037).
  const counts = await Promise.all([
    supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('id', userId).not('avatar_path', 'is', null),
    supabase.from('bets').select('id', { count: 'exact', head: true }).eq('profile_id', userId),
    supabase.from('cancelled_bets').select('id', { count: 'exact', head: true }).eq('profile_id', userId),
    supabase.from('parlays').select('id', { count: 'exact', head: true }).eq('profile_id', userId),
    supabase.from('task_completions').select('id', { count: 'exact', head: true }).eq('profile_id', userId),
  ])
  for (const { error } of counts) if (error) throw error
  const [photo, bets, cancelled, parlays, tasks] = counts.map(({ count }) => (count ?? 0) > 0)

  return { photo, bet: bets || cancelled || parlays, task: tasks }
}
