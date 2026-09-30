'use client'

import { useEffect } from 'react'
import { ErrorCard, useReportError } from '@/components/ui/error-card'
import { reloadOnceForStaleChunk } from '@/lib/offline/stale-chunk'

export default function Error({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useReportError(error)
  // A tab that outlived a deploy asks for chunks the new build no longer serves (#209); a reload
  // picks up the new build. Once per minute at most, so a build that is really broken can't loop.
  useEffect(() => {
    reloadOnceForStaleChunk(error)
  }, [error])
  return <ErrorCard retry={retry} />
}
