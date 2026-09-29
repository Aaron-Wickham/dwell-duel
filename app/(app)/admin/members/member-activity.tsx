import { LocalTime } from '@/components/ui/local-time'
import { relativeTime } from '@/lib/social/relative-time'

const RECENT_MS = 7 * 24 * 60 * 60 * 1000

// `now` comes from the server render, so the relative label hydrates to the same text.
export function MemberActivity({
  joinedAt,
  lastSignInAt,
  now,
}: {
  joinedAt: string | null
  lastSignInAt: string | null
  now: number
}) {
  return (
    <span className="text-sm text-ink2">
      {joinedAt && (
        <>
          Joined <LocalTime iso={joinedAt} format="day" />
          {' · '}
        </>
      )}
      {!lastSignInAt ? (
        'Never signed in'
      ) : now - Date.parse(lastSignInAt) > RECENT_MS ? (
        <>
          Active <LocalTime iso={lastSignInAt} format="day" />
        </>
      ) : (
        <>
          Active <time dateTime={lastSignInAt}>{relativeTime(lastSignInAt, now)}</time>
        </>
      )}
    </span>
  )
}
