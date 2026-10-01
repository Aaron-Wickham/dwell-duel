'use client'

import { useEffect } from 'react'
import { Manrope } from 'next/font/google'
import { ErrorCard, useReportError } from '@/components/ui/error-card'
import { HAPTICS_COOKIE, MOTION_COOKIE } from '@/lib/preferences/preferences'
import { resolveTheme, THEME_COOKIE } from '@/lib/theme/theme'
import './globals.css'

const manrope = Manrope({
  variable: '--font-manrope',
  subsets: ['latin'],
})

function readCookie(name: string): string | undefined {
  const pair = document.cookie.split('; ').find((c) => c.startsWith(`${name}=`))
  return pair?.slice(name.length + 1)
}

export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useReportError(error)
  // This page replaces the root layout, which is what normally puts the member's saved choices on
  // <html>; the cookies are readable here, so copy them on once it mounts.
  useEffect(() => {
    const html = document.documentElement
    const theme = resolveTheme(readCookie(THEME_COOKIE))
    if (theme) html.dataset.theme = theme
    if (readCookie(MOTION_COOKIE) === 'reduce') html.dataset.motion = 'reduce'
    if (readCookie(HAPTICS_COOKIE) === 'off') html.dataset.haptics = 'off'
  }, [])
  return (
    <html lang="en" suppressHydrationWarning className={`${manrope.variable} h-full`}>
      <body className="flex min-h-full flex-col">
        <title>Something went wrong</title>
        <main id="main" className="flex flex-1 flex-col">
          <ErrorCard retry={retry} />
        </main>
      </body>
    </html>
  )
}
