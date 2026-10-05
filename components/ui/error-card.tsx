'use client'

import { useEffect } from 'react'
import { Card } from '@/components/ui/card'
import { Button, buttonVariants } from '@/components/ui/button'
import { reportClientError } from '@/lib/observability/client'
import { h2Class } from '@/components/ui/page'
import { cn } from '@/lib/utils'

export const ERROR_TITLE = 'This page didn’t load'

// Matches the digest to the corresponding server-side log, per the Next.js error.js docs.
export function useReportError(error: Error & { digest?: string }): void {
  useEffect(() => {
    console.error(error, { digest: error.digest })
    // Server-rendered errors are captured by onRequestError; this is the member's browser, which no
    // server ever sees.
    reportClientError(error)
  }, [error])
}

// A card-sized headline, not the page h1's 40px squeezed into a 440px card (ST-11), plain words that
// say what to do, and a way out: Try again re-renders the segment (Next 16's retry()), Go to Home
// is a plain link so it reloads even when the client is what broke.
export function ErrorCard({ retry, digest }: { retry: () => void; digest?: string }) {
  return (
    <div className="flex flex-1 items-center justify-center px-4 py-10 md:px-20">
      <Card padded={false} className="flex w-full max-w-[440px] flex-col items-start gap-3 p-7 md:p-10">
        <h1 className={h2Class}>{ERROR_TITLE}</h1>
        <p className="text-ink2">Something went wrong on our side. Try again, or go back to Home.</p>
        <div className="mt-1 flex w-full flex-col gap-2 md:flex-row">
          <Button block className="md:w-auto" onClick={retry}>
            Try again
          </Button>
          {/* A full load on purpose: the client router may be what failed. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/" className={cn(buttonVariants({ variant: 'secondary', block: true }), 'no-underline md:w-auto')}>
            Go to Home
          </a>
        </div>
        {digest ? <p className="select-text text-sm text-ink2">Error code: {digest}</p> : null}
      </Card>
    </div>
  )
}
