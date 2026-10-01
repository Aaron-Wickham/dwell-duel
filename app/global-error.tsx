'use client'

import { useEffect } from 'react'
import { Manrope } from 'next/font/google'
import { ErrorCard, useReportError } from '@/components/ui/error-card'
import './globals.css'

const manrope = Manrope({
  variable: '--font-manrope',
  subsets: ['latin'],
})

// The three cookies are httpOnly, so script can't read them; the root layout's attributes on <html>
// are the copy it can see. They are still there when this module loads (before React swaps in this
// page's own <html>), so keep them and put them back on mount.
const ATTRIBUTES = ['data-theme', 'data-motion', 'data-haptics'] as const
const saved =
  typeof document === 'undefined'
    ? []
    : ATTRIBUTES.flatMap((name) => {
        const value = document.documentElement.getAttribute(name)
        return value === null ? [] : ([[name, value]] as const)
      })

export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useReportError(error)
  useEffect(() => {
    for (const [name, value] of saved) document.documentElement.setAttribute(name, value)
  }, [])
  return (
    <html lang="en" suppressHydrationWarning className={`${manrope.variable} h-full`}>
      <body className="flex min-h-full flex-col">
        <title>Something went wrong</title>
        <main id="main" className="flex flex-1 flex-col">
          <ErrorCard retry={retry} digest={error.digest} />
        </main>
      </body>
    </html>
  )
}
