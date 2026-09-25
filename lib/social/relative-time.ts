export function relativeTime(occurredAt: string, now: number): string {
  const seconds = Math.max(0, Math.floor((now - Date.parse(occurredAt)) / 1000))
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export function ageLabel(occurredAt: string): string {
  return relativeTime(occurredAt, Date.now())
}
