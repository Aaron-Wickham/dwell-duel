'use server'

import { cookies } from 'next/headers'
import { NOT_INVITED_EMAIL_COOKIE, NOT_INVITED_PATH } from './not-invited'

export async function clearNotInvitedEmailAction(): Promise<void> {
  const jar = await cookies()
  jar.set(NOT_INVITED_EMAIL_COOKIE, '', { path: NOT_INVITED_PATH, maxAge: 0, httpOnly: true, sameSite: 'lax' })
}
