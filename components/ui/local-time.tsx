'use client'

import { useSyncExternalStore } from 'react'
import { formatCloseTime, formatDateTime, formatDay } from '@/lib/markets/format-date'

const subscribe = () => () => {}

// The server can't know the viewer's time zone, so it formats in UTC and the browser re-renders in local time.
export function useTimeZone(): string | undefined {
  return useSyncExternalStore(
    subscribe,
    () => undefined,
    () => 'UTC',
  )
}

// `close` is a close time after "Closes": the day, or the time within 24 hours of `now`, which the
// server passes so both renders agree on what "within 24 hours" means.
export function LocalTime(props: { iso: string; format: 'dateTime' | 'day' } | { iso: string; format: 'close'; now: number }) {
  const timeZone = useTimeZone()
  const text =
    props.format === 'close'
      ? formatCloseTime(props.iso, props.now, timeZone)
      : (props.format === 'day' ? formatDay : formatDateTime)(props.iso, timeZone)
  return <time dateTime={props.iso}>{text}</time>
}
