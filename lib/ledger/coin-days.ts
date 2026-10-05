import { GROUP_TIME_ZONE } from '@/lib/group-time-zone'

// Coin history's days are the group's (Eastern), like its seasons and task periods, so a day's
// heading and the times under it agree whoever reads them and wherever the server renders them.
const dateKey = new Intl.DateTimeFormat('en-CA', { timeZone: GROUP_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' })
const dayLabel = new Intl.DateTimeFormat('en-US', { timeZone: GROUP_TIME_ZONE, weekday: 'short', month: 'short', day: 'numeric' })
const dayLabelWithYear = new Intl.DateTimeFormat('en-US', {
  timeZone: GROUP_TIME_ZONE,
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  year: 'numeric',
})
const timeLabel = new Intl.DateTimeFormat('en-US', { timeZone: GROUP_TIME_ZONE, hour: 'numeric', minute: '2-digit' })

export type Day<Row> = { key: string; label: string; rows: Row[] }

function previousDay(key: string): string {
  const d = new Date(`${key}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

// "Today", "Yesterday", "Sat, Oct 3", or with its year once it's another year's.
export function coinDayLabel(iso: string, now: Date): string {
  const key = dateKey.format(new Date(iso))
  const today = dateKey.format(now)
  if (key === today) return 'Today'
  if (key === previousDay(today)) return 'Yesterday'
  return (key.slice(0, 4) === today.slice(0, 4) ? dayLabel : dayLabelWithYear).format(new Date(iso))
}

export function coinTime(iso: string): string {
  return timeLabel.format(new Date(iso))
}

// Rows arrive newest first; each run of one day becomes a group, in that order. A day split by
// Show more starts the next page under its heading again.
export function groupByDay<Row extends { createdAt: string }>(rows: Row[], now: Date): Day<Row>[] {
  const days: Day<Row>[] = []
  for (const row of rows) {
    const key = dateKey.format(new Date(row.createdAt))
    const last = days.at(-1)
    if (last?.key === key) last.rows.push(row)
    else days.push({ key, label: coinDayLabel(row.createdAt, now), rows: [row] })
  }
  return days
}
