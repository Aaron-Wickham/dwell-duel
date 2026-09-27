'use client'

import { useEffect } from 'react'
import { CircleAlert } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { h1Class } from '@/components/ui/page'

// Matches the digest to the corresponding server-side log, per the Next.js error.js docs.
export function useReportError(error: Error & { digest?: string }): void {
  useEffect(() => {
    console.error(error, { digest: error.digest })
  }, [error])
}

export function ErrorCard({ retry }: { retry: () => void }) {
  return (
    <div className="flex flex-1 items-center justify-center px-4 py-10 md:px-20">
      <Card padded={false} className="flex w-full max-w-[440px] flex-col items-start gap-4 p-7 md:p-10">
        <span aria-hidden="true" className="flex size-12 items-center justify-center rounded-full bg-loss-soft text-loss">
          <CircleAlert className="size-6" />
        </span>
        <h1 className={h1Class}>Something went wrong</h1>
        <p className="text-ink2">We couldn’t load this page. Try again in a moment.</p>
        <Button block className="md:w-auto" onClick={retry}>
          Try again
        </Button>
      </Card>
    </div>
  )
}
