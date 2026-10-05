import { cookies } from 'next/headers'
import type { DbClient } from '@/lib/supabase/database'
import { HOW_IT_WORKS_READ_COOKIE } from './how-it-works-read'

// A cookie, like the Settings ones, so a dismissed card is gone on the very first render, with no
// flash and no column to migrate. It's per device, as Settings are.
export const ONBOARDING_COOKIE = 'onboarding'
export const ONBOARDING_DISMISSED = 'dismissed'

// The steps the server can know. Turning on notifications is per device, so the card asks the
// browser for that one itself.
export type OnboardingSteps = { learn: boolean; photo: boolean; bet: boolean; task: boolean }

export async function onboardingDismissed(): Promise<boolean> {
  return (await cookies()).get(ONBOARDING_COOKIE)?.value === ONBOARDING_DISMISSED
}

// Null once the member has dismissed the card; the card hides itself when every step is done.
export async function getOnboarding(supabase: DbClient): Promise<OnboardingSteps | null> {
  const jar = await cookies()
  if (await onboardingDismissed()) return null

  // One row from my_onboarding (0071) for the signed-in member, in place of five count queries (#210).
  const { data, error } = await supabase.rpc('my_onboarding').single()
  if (error) throw error
  return { learn: jar.has(HOW_IT_WORKS_READ_COOKIE), photo: data.photo, bet: data.bet, task: data.task }
}
