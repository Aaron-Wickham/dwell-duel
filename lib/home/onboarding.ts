import { cookies } from 'next/headers'
import type { DbClient } from '@/lib/supabase/database'

// A cookie, like the Settings ones, so a dismissed card is gone on the very first render, with no
// flash and no column to migrate. It's per device, as Settings are.
export const ONBOARDING_COOKIE = 'onboarding'
export const ONBOARDING_DISMISSED = 'dismissed'

export type OnboardingSteps = { photo: boolean; bet: boolean; task: boolean }

// Null once the member has dismissed the card; the card hides itself when every step is done.
export async function getOnboarding(supabase: DbClient): Promise<OnboardingSteps | null> {
  const jar = await cookies()
  if (jar.get(ONBOARDING_COOKIE)?.value === ONBOARDING_DISMISSED) return null

  // One row from my_onboarding (0071) for the signed-in member, in place of five count queries (#210).
  const { data, error } = await supabase.rpc('my_onboarding').single()
  if (error) throw error
  return { photo: data.photo, bet: data.bet, task: data.task }
}
