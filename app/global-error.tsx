'use client'

import { ErrorCard, useReportError } from '@/components/ui/error-card'
import './globals.css'

export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useReportError(error)
  return (
    <html lang="en">
      <body className="flex min-h-full flex-col">
        <title>Something went wrong</title>
        <ErrorCard retry={retry} />
      </body>
    </html>
  )
}
