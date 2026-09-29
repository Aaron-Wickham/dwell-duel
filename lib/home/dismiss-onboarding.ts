'use server'

import { cookies } from 'next/headers'
import { ONBOARDING_COOKIE, ONBOARDING_DISMISSED } from './onboarding'

export async function dismissOnboardingAction(): Promise<void> {
  const jar = await cookies()
  jar.set(ONBOARDING_COOKIE, ONBOARDING_DISMISSED, {
    path: '/',
    sameSite: 'lax',
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 365,
  })
}
