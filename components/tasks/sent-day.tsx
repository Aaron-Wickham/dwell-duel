'use client'

import { useTimeZone } from '@/components/ui/local-time'
import { sentLabel } from '@/lib/tasks/sent-label'

// The server formats in UTC and the browser re-renders in the viewer's own zone, as LocalTime does.
export function SentDay({ iso, now }: { iso: string; now: number }) {
  const timeZone = useTimeZone()
  return <time dateTime={iso}>{sentLabel(iso, now, timeZone)}</time>
}
