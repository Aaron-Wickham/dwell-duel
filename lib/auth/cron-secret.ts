import { timingSafeEqual } from 'node:crypto'

// Vercel's scheduler, and pg_cron's ping (0064), send `Authorization: Bearer ${CRON_SECRET}`.
// An unset secret refuses everything: `Bearer undefined` must never be a valid header. The
// comparison takes the same time whatever the header holds, so nothing about the secret leaks
// through how quickly a guess is refused (#203).
export function cronAuthorized(authHeader: string | null, secret: string | undefined): boolean {
  if (!secret || authHeader === null) return false
  const expected = Buffer.from(`Bearer ${secret}`)
  const given = Buffer.from(authHeader)
  if (expected.length !== given.length) return false
  return timingSafeEqual(expected, given)
}
