'use client'

import { ErrorCard, useReportError } from '@/components/ui/error-card'

// Above the signed-in layout, so nothing else draws the page's main landmark.
export default function Error({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useReportError(error)
  return (
    <main id="main" className="flex flex-1 flex-col">
      <ErrorCard retry={retry} digest={error.digest} />
    </main>
  )
}
