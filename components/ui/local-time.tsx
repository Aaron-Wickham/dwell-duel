'use client'

import { useSyncExternalStore } from 'react'
import { formatDateTime, formatDay } from '@/lib/markets/format-date'

const subscribe = () => () => {}

// The server can't know the viewer's time zone, so it formats in UTC and the browser re-renders in local time.
export function useTimeZone(): string | undefined {
  return useSyncExternalStore(
    subscribe,
    () => undefined,
    () => 'UTC',
  )
}

export function LocalTime({ iso, format }: { iso: string; format: 'dateTime' | 'day' }) {
  const timeZone = useTimeZone()
  const formatter = format === 'day' ? formatDay : formatDateTime
  return <time dateTime={iso}>{formatter(iso, timeZone)}</time>
}
