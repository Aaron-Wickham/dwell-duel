'use client'

import { useSyncExternalStore } from 'react'
import { formatDateTime, formatDay } from '@/lib/markets/format-date'

const subscribe = () => () => {}

// The server can't know the viewer's time zone: it renders UTC, and the browser swaps in local time after hydration.
export function LocalTime({ iso, format }: { iso: string; format: 'dateTime' | 'day' }) {
  const formatter = format === 'day' ? formatDay : formatDateTime
  const text = useSyncExternalStore(
    subscribe,
    () => formatter(iso),
    () => formatter(iso, 'UTC'),
  )
  return <time dateTime={iso}>{text}</time>
}
