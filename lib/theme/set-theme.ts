'use server'

import { cookies } from 'next/headers'
import { resolveTheme, THEME_COOKIE } from './theme'

export async function setThemeAction(value: string): Promise<void> {
  const jar = await cookies()
  if (value === 'system') {
    jar.delete(THEME_COOKIE)
    return
  }
  const theme = resolveTheme(value)
  if (!theme) return

  jar.set(THEME_COOKIE, theme, {
    path: '/',
    sameSite: 'lax',
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 365,
  })
}
