import Link from 'next/link'
import { describeEvent, type FeedEvent } from '@/lib/social/describe-event'
import { ageLabel } from '@/lib/social/relative-time'

export function FeedList({ events }: { events: FeedEvent[] }) {
  if (events.length === 0) return <p className="mt-2 text-sm text-foreground/70">Nothing yet.</p>

  return (
    <ul className="mt-4 space-y-2 text-sm">
      {events.map((e) => (
        <li key={e.id}>
          {describeEvent(e).map((segment, i) =>
            typeof segment === 'string' ? (
              <span key={i}>{segment}</span>
            ) : (
              <Link key={i} href={segment.href} className="underline">
                {segment.text}
              </Link>
            ),
          )}{' '}
          <span className="text-foreground/60">· {ageLabel(e.occurredAt)}</span>
        </li>
      ))}
    </ul>
  )
}
