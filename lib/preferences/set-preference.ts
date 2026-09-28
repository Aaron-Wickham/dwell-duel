'use server'

import { cookies } from 'next/headers'
import { HAPTICS_COOKIE, MOTION_COOKIE } from './preferences'

const OPTIONS = { path: '/', sameSite: 'lax', httpOnly: true, maxAge: 60 * 60 * 24 * 365 } as const

export async function setHapticsAction(on: boolean): Promise<void> {
  const jar = await cookies()
  if (on) jar.delete(HAPTICS_COOKIE)
  else jar.set(HAPTICS_COOKIE, 'off', OPTIONS)
}

export async function setReduceMotionAction(reduce: boolean): Promise<void> {
  const jar = await cookies()
  if (reduce) jar.set(MOTION_COOKIE, 'reduce', OPTIONS)
  else jar.delete(MOTION_COOKIE)
}
