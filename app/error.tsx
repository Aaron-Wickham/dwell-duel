'use client'

import { ErrorCard, useReportError } from '@/components/ui/error-card'

export default function Error({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useReportError(error)
  return <ErrorCard retry={retry} digest={error.digest} />
}
