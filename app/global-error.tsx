'use client'

import { Manrope } from 'next/font/google'
import { ErrorCard, useReportError } from '@/components/ui/error-card'
import './globals.css'

const manrope = Manrope({
  variable: '--font-manrope',
  subsets: ['latin'],
})

export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useReportError(error)
  return (
    <html lang="en" className={`${manrope.variable} h-full`}>
      <body className="flex min-h-full flex-col">
        <title>Something went wrong</title>
        <ErrorCard retry={retry} digest={error.digest} />
      </body>
    </html>
  )
}
